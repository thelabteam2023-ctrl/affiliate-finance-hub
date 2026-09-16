import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useTabWorkspace } from '@/hooks/useTabWorkspace';
import { fetchProjetosLucroOperacionalKpi } from '@/services/fetchProjetosLucroOperacionalKpi';

/**
 * Interface de retorno do lucro por projeto (breakdown auditável)
 */
export interface ProjetoLucroBreakdown {
  projetoId: string;
  nome: string;
  status: string | null;
  /** Moeda de consolidação do projeto */
  moeda: string;
  /** Lucro operacional na moeda do projeto */
  valor: number;
  /** Lucro operacional convertido para a moeda do workspace (BRL) */
  valorBRL: number;
  /** Composição por módulo, na moeda do projeto */
  modulos: Record<string, number>;
  /** Composição por módulo, convertida para BRL */
  modulosBRL: Record<string, number>;
}

/** Retrocompatibilidade: breakdown "por módulo" (hoje = por projeto) */
export interface ModuloLucro {
  moduleId: string;
  moduleName: string;
  valor: number;
  count: number;
  isActive: boolean;
}

export interface WorkspaceLucroConsolidado {
  /** Lucro total consolidado em BRL (moeda do workspace) */
  lucroTotal: number;
  modulos: ModuloLucro[];
  /** Breakdown auditável por projeto */
  projetos: ProjetoLucroBreakdown[];
  /** Composição por módulo somada em BRL (apostas, bonus, cashback, ...) */
  componentesBRL: Record<string, number>;
  hasMultiCurrency: boolean;
  totalOperacoes: number;
}

interface UseWorkspaceLucroOperacionalProps {
  dataInicio?: string | null;
  dataFim?: string | null;
  cotacaoUSD?: number;
  /** Mapa de cotações adicionais para moedas não-USD/BRL (ex: { EUR: 6.2 }) */
  cotacoes?: Record<string, number>;
}

interface UseWorkspaceLucroOperacionalReturn {
  resultado: WorkspaceLucroConsolidado | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook centralizado para calcular o lucro operacional do workspace.
 *
 * FONTE ÚNICA DE VERDADE para lucro operacional consolidado.
 *
 * DELEGA INTEGRALMENTE para fetchProjetosLucroOperacionalKpi (engine dos projetos,
 * RPC `get_projetos_lucro_operacional`), garantindo paridade absoluta entre a visão
 * por projeto e o dashboard financeiro.
 *
 * REGRAS:
 * - Só entram projetos do workspace ativo (filtro explícito, não apenas RLS).
 * - O lucro de cada projeto vem na MOEDA DE CONSOLIDAÇÃO do projeto e é convertido
 *   para BRL (moeda do workspace) ANTES de somar — nunca somar moedas diferentes.
 * - Bônus usa `valor_consolidado_snapshot`, que já está na moeda do projeto
 *   (conversão feita no banco, sem reconversão).
 */
export function useWorkspaceLucroOperacional({
  dataInicio = null,
  dataFim = null,
  cotacaoUSD = 5.0,
  cotacoes = {},
}: UseWorkspaceLucroOperacionalProps = {}): UseWorkspaceLucroOperacionalReturn {
  const { workspaceId } = useTabWorkspace();
  const [resultado, setResultado] = useState<WorkspaceLucroConsolidado | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cotacoesKey = JSON.stringify(cotacoes);

  const calculateLucro = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const cotacoesMap: Record<string, number> = JSON.parse(cotacoesKey);

      /** Quanto vale 1 unidade da moeda em BRL */
      const rateToBRL = (moeda: string): number => {
        const m = (moeda || 'BRL').toUpperCase();
        if (m === 'BRL') return 1;
        if (m === 'USD' || m === 'USDT' || m === 'USDC') return cotacaoUSD || 1;
        const r = cotacoesMap[m];
        return r && r > 0 ? r : 1;
      };

      // 1) Projetos DO WORKSPACE ATIVO
      let query = supabase.from('projetos').select('id, nome, status, moeda_consolidacao');
      if (workspaceId) query = query.eq('workspace_id', workspaceId);

      const { data: projetos, error: projError } = await query;
      if (projError) throw projError;

      const projetoIds = (projetos || []).map((p) => p.id);

      if (projetoIds.length === 0) {
        setResultado({
          lucroTotal: 0,
          modulos: [],
          projetos: [],
          componentesBRL: {},
          hasMultiCurrency: false,
          totalOperacoes: 0,
        });
        return;
      }

      // 2) Delegar para a engine canônica dos projetos (agregação e conversão server-side)
      const lucroPorProjeto = await fetchProjetosLucroOperacionalKpi({
        projetoIds,
        cotacaoUSD,
        cotacoes: cotacoesMap,
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
      });

      // 3) Agregar em BRL
      let lucroTotal = 0;
      let hasMultiCurrency = false;
      const modulos: ModuloLucro[] = [];
      const breakdown: ProjetoLucroBreakdown[] = [];
      const componentesBRL: Record<string, number> = {};

      for (const projeto of projetos || []) {
        const resumo = lucroPorProjeto[projeto.id];
        if (!resumo) continue;

        const moeda = (resumo.moedaConsolidacao || projeto.moeda_consolidacao || 'BRL').toUpperCase();
        const taxa = rateToBRL(moeda);
        const valorBRL = resumo.consolidado * taxa;

        lucroTotal += valorBRL;

        const moedasOrigem = Object.keys(resumo.porMoeda).filter(
          (m) => Math.abs(resumo.porMoeda[m]) > 0.01,
        );
        if (moeda !== 'BRL' || moedasOrigem.some((m) => m !== 'BRL')) {
          hasMultiCurrency = true;
        }

        const modulosBRL: Record<string, number> = {};
        for (const [modulo, valor] of Object.entries(resumo.modulos)) {
          const emBRL = valor * taxa;
          modulosBRL[modulo] = emBRL;
          componentesBRL[modulo] = (componentesBRL[modulo] || 0) + emBRL;
        }

        breakdown.push({
          projetoId: projeto.id,
          nome: projeto.nome || 'Projeto sem nome',
          status: projeto.status ?? null,
          moeda,
          valor: resumo.consolidado,
          valorBRL,
          modulos: resumo.modulos,
          modulosBRL,
        });

        modulos.push({
          moduleId: projeto.id,
          moduleName: projeto.nome || `Projeto ${projeto.id.slice(0, 8)}`,
          valor: valorBRL,
          count: 1,
          isActive: true,
        });
      }

      breakdown.sort((a, b) => Math.abs(b.valorBRL) - Math.abs(a.valorBRL));

      setResultado({
        lucroTotal,
        modulos,
        projetos: breakdown,
        componentesBRL,
        hasMultiCurrency,
        totalOperacoes: breakdown.length,
      });
    } catch (err: any) {
      console.error('Erro ao calcular lucro operacional do workspace:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, cotacaoUSD, cotacoesKey, workspaceId]);

  useEffect(() => {
    calculateLucro();
  }, [calculateLucro]);

  return {
    resultado,
    loading,
    error,
    refresh: calculateLucro,
  };
}

// ==================== HOOK UTILITÁRIO ====================

/**
 * Hook auxiliar para obter apenas o lucro total (para uso simplificado)
 */
export function useWorkspaceLucroTotal(props?: UseWorkspaceLucroOperacionalProps) {
  const { resultado, loading, error } = useWorkspaceLucroOperacional(props);

  return {
    lucroTotal: resultado?.lucroTotal ?? 0,
    hasMultiCurrency: resultado?.hasMultiCurrency ?? false,
    loading,
    error,
  };
}
