/**
 * Hook para verificar e corrigir discrepâncias de saldo em bookmakers
 * 
 * O saldo é DERIVADO e RECALCULÁVEL:
 * saldo_atual = depósitos - saques + transferências_entrada - transferências_saída 
 *             + lucro_apostas + cashback + giros_gratis
 * 
 * Este hook:
 * 1. Verifica se há discrepâncias entre o saldo registrado e o calculado
 * 2. Permite corrigir automaticamente usando a RPC do banco
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BookmakerDiscrepancy {
  bookmaker_id: string;
  nome: string;
  moeda: string; // Moeda nativa do bookmaker (BRL, USD, etc.)
  saldo_anterior: number;
  saldo_calculado: number;
  diferenca: number;
  depositos: number;
  saques: number;
  transferencias_entrada: number;
  transferencias_saida: number;
  lucro_apostas: number;
  cashback: number;
  giros_gratis: number;
}

interface UseBookmakerBalanceVerificationProps {
  projetoId?: string;
  workspaceId?: string;
}

export function useBookmakerBalanceVerification({
  projetoId,
  workspaceId,
}: UseBookmakerBalanceVerificationProps) {
  const [loading, setLoading] = useState(false);
  const [discrepancies, setDiscrepancies] = useState<BookmakerDiscrepancy[]>([]);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  /**
   * Verifica discrepâncias para um bookmaker específico
   */
  const checkBookmaker = useCallback(async (bookmakerId: string): Promise<BookmakerDiscrepancy | null> => {
    try {
      const { data, error } = await supabase.rpc('recalcular_saldo_bookmaker', {
        p_bookmaker_id: bookmakerId
      });

      if (error) {
        console.error('[useBookmakerBalanceVerification] Erro RPC:', error);
        return null;
      }

      if (data && data.length > 0) {
        const result = data[0];
        if (Math.abs(result.diferenca) > 0.01) {
          return {
            bookmaker_id: result.bookmaker_id,
            nome: result.nome,
            moeda: result.moeda || 'BRL',
            saldo_anterior: result.saldo_anterior,
            saldo_calculado: result.saldo_calculado,
            diferenca: result.diferenca,
            depositos: result.depositos,
            saques: result.saques,
            transferencias_entrada: result.transferencias_entrada,
            transferencias_saida: result.transferencias_saida,
            lucro_apostas: result.lucro_apostas,
            cashback: result.cashback || 0,
            giros_gratis: result.giros_gratis || 0,
          };
        }
      }
      return null;
    } catch (error) {
      console.error('[useBookmakerBalanceVerification] Exceção:', error);
      return null;
    }
  }, []);

  /**
   * Verifica discrepâncias para todos os bookmakers de um projeto
   */
  const checkProject = useCallback(async (): Promise<BookmakerDiscrepancy[]> => {
    if (!projetoId) return [];

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('recalcular_saldos_projeto', {
        p_projeto_id: projetoId,
        p_aplicar: false // Apenas verificar, não corrigir
      });

      if (error) {
        console.error('[useBookmakerBalanceVerification] Erro RPC projeto:', error);
        return [];
      }

      const discrepanciasEncontradas = (data || [])
        .filter((item: any) => Math.abs(item.diferenca) > 0.01)
        .map((item: any) => ({
          bookmaker_id: item.bookmaker_id,
          nome: item.nome,
          moeda: item.moeda || 'BRL',
          saldo_anterior: item.saldo_anterior,
          saldo_calculado: item.saldo_calculado,
          diferenca: item.diferenca,
          depositos: item.depositos,
          saques: item.saques,
          transferencias_entrada: item.transferencias_entrada || 0,
          transferencias_saida: item.transferencias_saida || 0,
          lucro_apostas: item.lucro_apostas,
          cashback: item.cashback || 0,
          giros_gratis: item.giros_gratis || 0,
        }));

      setDiscrepancies(discrepanciasEncontradas);
      setLastCheck(new Date());
      return discrepanciasEncontradas;
    } catch (error) {
      console.error('[useBookmakerBalanceVerification] Exceção:', error);
      return [];
    } finally {
      setLoading(false);
    }
  }, [projetoId]);

  /**
   * Corrige o saldo de um bookmaker específico
   */
  const fixBookmaker = useCallback(async (bookmakerId: string): Promise<boolean> => {
    try {
      // Primeiro, obter o saldo calculado
      const { data: calcData } = await supabase.rpc('recalcular_saldo_bookmaker', {
        p_bookmaker_id: bookmakerId
      });

      if (!calcData || calcData.length === 0) {
        toast.error('Não foi possível calcular o saldo correto');
        return false;
      }

      const saldoCorreto = calcData[0].saldo_calculado;

      // Atualizar o saldo
      const { error: updateError } = await supabase
        .from('bookmakers')
        .update({ 
          saldo_atual: saldoCorreto,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookmakerId);

      if (updateError) {
        console.error('[useBookmakerBalanceVerification] Erro update:', updateError);
        toast.error('Erro ao corrigir saldo');
        return false;
      }

      // Remover da lista de discrepâncias
      setDiscrepancies(prev => prev.filter(d => d.bookmaker_id !== bookmakerId));
      toast.success(`Saldo corrigido para ${calcData[0].nome}`);
      return true;
    } catch (error) {
      console.error('[useBookmakerBalanceVerification] Exceção fix:', error);
      toast.error('Erro ao corrigir saldo');
      return false;
    }
  }, []);

  /**
   * Corrige todos os saldos do projeto
   */
  const fixAllProject = useCallback(async (): Promise<boolean> => {
    if (!projetoId || discrepancies.length === 0) return false;

    setLoading(true);
    try {
      let successCount = 0;
      
      for (const discrepancy of discrepancies) {
        const success = await fixBookmaker(discrepancy.bookmaker_id);
        if (success) successCount++;
      }

      if (successCount === discrepancies.length) {
        toast.success(`${successCount} saldo(s) corrigido(s) com sucesso`);
      } else {
        toast.warning(`${successCount} de ${discrepancies.length} saldos corrigidos`);
      }

      return successCount > 0;
    } finally {
      setLoading(false);
    }
  }, [projetoId, discrepancies, fixBookmaker]);

  /**
   * Verifica se há discrepâncias significativas
   */
  const hasDiscrepancies = discrepancies.length > 0;
  const totalDiscrepancy = discrepancies.reduce((sum, d) => sum + Math.abs(d.diferenca), 0);

  return {
    loading,
    discrepancies,
    lastCheck,
    hasDiscrepancies,
    totalDiscrepancy,
    checkBookmaker,
    checkProject,
    fixBookmaker,
    fixAllProject,
  };
}
