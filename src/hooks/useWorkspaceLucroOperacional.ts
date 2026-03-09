import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchProjetosLucroOperacionalKpi } from '@/services/fetchProjetosLucroOperacionalKpi';

/**
 * Interface de retorno do lucro por módulo
 * Mantida para retrocompatibilidade com componentes que consomem breakdown por módulo.
 */
export interface ModuloLucro {
  moduleId: string;
  moduleName: string;
  valor: number;
  count: number;
  isActive: boolean;
}

/**
 * Interface principal de resultado consolidado do workspace
 */
export interface WorkspaceLucroConsolidado {
  // Lucro total consolidado (soma de todos os projetos)
  lucroTotal: number;
  
  // Breakdown por módulo (simplificado — agora é lucro por projeto)
  modulos: ModuloLucro[];
  
  // Flags de consolidação
  hasMultiCurrency: boolean;
  
  // Contadores gerais
  totalOperacoes: number;
}

interface UseWorkspaceLucroOperacionalProps {
  dataInicio?: string | null;
  dataFim?: string | null;
  cotacaoUSD?: number;
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
 * DELEGA INTEGRALMENTE para fetchProjetosLucroOperacionalKpi (engine dos projetos),
 * garantindo paridade absoluta entre a visão por projeto e o dashboard financeiro.
 * 
 * Módulos incluídos (via engine canônica):
 * - Apostas liquidadas (apostas_unificada)
 * - Cashback manual (cashback_manual)
 * - Giros grátis confirmados
 * - Bônus ganhos (exceto FREEBET)
 * - Perdas operacionais confirmadas
 * - Ajustes de conciliação
 * - Ajustes de saldo + Resultado cambial
 * 
 * Este hook deve ser usado por:
 * - Dashboard Financeiro (Financeiro.tsx)
 * - Cards de Equilíbrio Operacional
 * - Cards de Eficiência do Capital
 * - Qualquer lugar que exiba lucro operacional do workspace
 */
export function useWorkspaceLucroOperacional({
  dataInicio = null,
  dataFim = null,
  cotacaoUSD = 5.0,
}: UseWorkspaceLucroOperacionalProps = {}): UseWorkspaceLucroOperacionalReturn {
  const [resultado, setResultado] = useState<WorkspaceLucroConsolidado | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const calculateLucro = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 1) Buscar todos os projetos do workspace do usuário
      const { data: projetos, error: projError } = await supabase
        .from('projetos')
        .select('id');

      if (projError) throw projError;

      const projetoIds = (projetos || []).map((p) => p.id);

      if (projetoIds.length === 0) {
        setResultado({
          lucroTotal: 0,
          modulos: [],
          hasMultiCurrency: false,
          totalOperacoes: 0,
        });
        return;
      }

      // 2) Delegar para a engine canônica dos projetos
      const lucroPorProjeto = await fetchProjetosLucroOperacionalKpi({
        projetoIds,
        cotacaoUSD,
        dataInicio: dataInicio || undefined,
        dataFim: dataFim || undefined,
      });

      // 3) Agregar resultados
      let lucroTotal = 0;
      let hasMultiCurrency = false;
      const modulos: ModuloLucro[] = [];

      for (const projetoId of projetoIds) {
        const resumo = lucroPorProjeto[projetoId];
        if (!resumo) continue;

        lucroTotal += resumo.consolidado;

        // Detectar multi-moeda
        if (resumo.porMoeda.USD !== 0) {
          hasMultiCurrency = true;
        }

        modulos.push({
          moduleId: projetoId,
          moduleName: `Projeto ${projetoId.slice(0, 8)}`,
          valor: resumo.consolidado,
          count: 1,
          isActive: true,
        });
      }

      setResultado({
        lucroTotal,
        modulos,
        hasMultiCurrency,
        totalOperacoes: modulos.length,
      });
    } catch (err: any) {
      console.error('Erro ao calcular lucro operacional do workspace:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dataInicio, dataFim, cotacaoUSD]);

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
