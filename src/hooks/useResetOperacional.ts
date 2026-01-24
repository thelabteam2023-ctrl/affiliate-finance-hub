/**
 * Hook para Reset Operacional Seguro de Projetos
 * 
 * Usa a RPC `reset_projeto_operacional_seguro` que:
 * 1. Gera estornos no ledger para todos os registros
 * 2. Deleta registros operacionais
 * 3. Recalcula saldos das bookmakers
 * 
 * EXTENSIBILIDADE:
 * Para adicionar novos módulos, edite a RPC no banco e
 * atualize PROFIT_MODULES em src/lib/profitModulesRegistry.ts
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface ResetModuloInfo {
  modulo: string;
  registros: number;
  estornos_gerados: number;
}

export interface ResetBookmakerInfo {
  id: string;
  nome: string;
}

export interface ResetResultado {
  success: boolean;
  dry_run: boolean;
  projeto_id: string;
  total_estornos_gerados: number;
  resumo: {
    apostas: number;
    cashback: number;
    giros_gratis: number;
    bonus: number;
  };
  modulos: ResetModuloInfo[];
  bookmakers_afetados: ResetBookmakerInfo[];
  mensagem: string;
  error?: string;
  error_detail?: string;
}

interface UseResetOperacionalReturn {
  /** Executa simulação (dry run) sem alterar dados */
  simularReset: (projetoId: string) => Promise<ResetResultado | null>;
  
  /** Executa reset real (gera estornos e deleta registros) */
  executarReset: (projetoId: string) => Promise<ResetResultado | null>;
  
  /** Último resultado retornado */
  resultado: ResetResultado | null;
  
  /** Se está processando */
  loading: boolean;
  
  /** Erro se houver */
  error: string | null;
}

export function useResetOperacional(): UseResetOperacionalReturn {
  const [resultado, setResultado] = useState<ResetResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const executarRPC = useCallback(async (
    projetoId: string,
    dryRun: boolean
  ): Promise<ResetResultado | null> => {
    setLoading(true);
    setError(null);

    try {
      // Obter ID do usuário atual
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuário não autenticado');
      }

      const { data, error: rpcError } = await supabase.rpc(
        'reset_projeto_operacional_seguro',
        {
          p_projeto_id: projetoId,
          p_user_id: user.id,
          p_dry_run: dryRun,
        }
      );

      if (rpcError) {
        throw new Error(rpcError.message);
      }

      const result = data as unknown as ResetResultado;
      setResultado(result);

      if (!result.success) {
        throw new Error(result.error || 'Erro desconhecido no reset');
      }

      // Se não foi dry run, invalidar TODOS os caches relevantes
      if (!dryRun) {
        // Caches de projeto
        await queryClient.invalidateQueries({ queryKey: ['projeto-resultado', projetoId] });
        await queryClient.invalidateQueries({ queryKey: ['projeto-breakdowns', projetoId] });
        await queryClient.invalidateQueries({ queryKey: ['projeto-painel-contas', projetoId] });
        
        // Caches de bookmakers (globais - afeta todos os parceiros)
        await queryClient.invalidateQueries({ queryKey: ['bookmaker-saldos'] });
        await queryClient.invalidateQueries({ queryKey: ['bookmaker-saldos-financeiro'] });
        
        // Caches de parceiros (CRÍTICO para evitar saldos stale)
        await queryClient.invalidateQueries({ queryKey: ['parceiro-financeiro'] });
        await queryClient.invalidateQueries({ queryKey: ['parceiro-consolidado'] });
        
        // Caches operacionais
        await queryClient.invalidateQueries({ queryKey: ['apostas'] });
        await queryClient.invalidateQueries({ queryKey: ['cashback-manual'] });
        await queryClient.invalidateQueries({ queryKey: ['giros-gratis'] });
        await queryClient.invalidateQueries({ queryKey: ['bonus'] });
        
        // Disparar evento global para componentes com state local
        window.dispatchEvent(new CustomEvent('lovable:reset-operacional-completed', {
          detail: { projetoId, bookmakers: result.bookmakers_afetados }
        }));
        
        toast.success('Reset operacional concluído', {
          description: result.mensagem,
        });
      }

      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao executar reset';
      setError(message);
      toast.error('Erro no reset operacional', { description: message });
      return null;
    } finally {
      setLoading(false);
    }
  }, [queryClient]);

  const simularReset = useCallback(
    (projetoId: string) => executarRPC(projetoId, true),
    [executarRPC]
  );

  const executarReset = useCallback(
    (projetoId: string) => executarRPC(projetoId, false),
    [executarRPC]
  );

  return {
    simularReset,
    executarReset,
    resultado,
    loading,
    error,
  };
}
