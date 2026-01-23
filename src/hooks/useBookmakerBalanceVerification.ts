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
  bonus_creditado: number; // Bônus com status 'credited' - fonte legítima de saldo
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
   * NOTE: recalcular_saldo_bookmaker now returns a single numeric (the recalculated balance)
   * This function now queries the bookmaker directly to get the current balance and compare
   */
  const checkBookmaker = useCallback(async (bookmakerId: string): Promise<BookmakerDiscrepancy | null> => {
    try {
      // Get current bookmaker data
      const { data: bookmaker, error: bkError } = await supabase
        .from('bookmakers')
        .select('id, nome, moeda, saldo_atual')
        .eq('id', bookmakerId)
        .single();

      if (bkError || !bookmaker) {
        console.error('[useBookmakerBalanceVerification] Erro ao buscar bookmaker:', bkError);
        return null;
      }

      // Get the recalculated balance (returns numeric)
      const { data: saldoCalculado, error } = await supabase.rpc('recalcular_saldo_bookmaker', {
        p_bookmaker_id: bookmakerId
      });

      if (error) {
        console.error('[useBookmakerBalanceVerification] Erro RPC:', error);
        return null;
      }

      const diferenca = (saldoCalculado as number || 0) - (bookmaker.saldo_atual || 0);
      
      if (Math.abs(diferenca) > 0.01) {
        return {
          bookmaker_id: bookmaker.id,
          nome: bookmaker.nome,
          moeda: bookmaker.moeda || 'BRL',
          saldo_anterior: bookmaker.saldo_atual || 0,
          saldo_calculado: saldoCalculado as number || 0,
          diferenca,
          depositos: 0, // These details not available from simple recalc
          saques: 0,
          transferencias_entrada: 0,
          transferencias_saida: 0,
          lucro_apostas: 0,
          cashback: 0,
          giros_gratis: 0,
          bonus_creditado: 0,
        };
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
          bonus_creditado: item.bonus_creditado || 0,
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
   * NOTE: recalcular_saldo_bookmaker now returns a single numeric (the new calculated balance)
   */
  const fixBookmaker = useCallback(async (bookmakerId: string): Promise<boolean> => {
    try {
      // Get bookmaker name for toast
      const { data: bookmaker } = await supabase
        .from('bookmakers')
        .select('nome')
        .eq('id', bookmakerId)
        .single();

      // Get the recalculated balance (returns numeric directly)
      const { data: saldoCorreto, error: calcError } = await supabase.rpc('recalcular_saldo_bookmaker', {
        p_bookmaker_id: bookmakerId
      });

      if (calcError || saldoCorreto === null || saldoCorreto === undefined) {
        console.error('[useBookmakerBalanceVerification] Erro ao calcular saldo:', calcError);
        toast.error('Não foi possível calcular o saldo correto');
        return false;
      }

      // Atualizar o saldo (the RPC already updates it, but we can confirm)
      const { error: updateError } = await supabase
        .from('bookmakers')
        .update({ 
          saldo_atual: saldoCorreto as number,
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
      toast.success(`Saldo corrigido para ${bookmaker?.nome || 'bookmaker'}`);
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
