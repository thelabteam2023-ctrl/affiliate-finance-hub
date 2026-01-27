/**
 * Hook para verificar discrepâncias de saldo em bookmakers
 * usando a view v_financial_audit do motor financeiro v7.
 * 
 * O saldo é a soma dos eventos em financial_events.
 */

import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BookmakerDiscrepancy {
  bookmaker_id: string;
  nome: string;
  moeda: string;
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
  bonus_creditado: number;
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
   * Verifica discrepâncias usando a view v_financial_audit
   */
  const checkBookmaker = useCallback(async (bookmakerId: string): Promise<BookmakerDiscrepancy | null> => {
    try {
      // Usar a view de auditoria financeira
      const { data, error } = await supabase
        .from('v_financial_audit')
        .select('*')
        .eq('bookmaker_id', bookmakerId)
        .single();

      if (error || !data) {
        console.error('[useBookmakerBalanceVerification] Erro ao buscar auditoria:', error);
        return null;
      }

      const diferenca = data.diferenca_normal;
      
      if (Math.abs(diferenca) > 0.01) {
        return {
          bookmaker_id: data.bookmaker_id,
          nome: data.bookmaker_nome,
          moeda: data.moeda || 'BRL',
          saldo_anterior: data.saldo_registrado || 0,
          saldo_calculado: data.soma_eventos_normal || 0,
          diferenca,
          depositos: 0,
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
   * Verifica discrepâncias para todos os bookmakers de um workspace
   */
  const checkProject = useCallback(async (): Promise<BookmakerDiscrepancy[]> => {
    if (!workspaceId) return [];

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('v_financial_audit')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (error) {
        console.error('[useBookmakerBalanceVerification] Erro RPC projeto:', error);
        return [];
      }

      const discrepanciasEncontradas = (data || [])
        .filter((item: any) => item.status_auditoria === 'DIVERGENTE')
        .map((item: any) => ({
          bookmaker_id: item.bookmaker_id,
          nome: item.bookmaker_nome,
          moeda: item.moeda || 'BRL',
          saldo_anterior: item.saldo_registrado,
          saldo_calculado: item.soma_eventos_normal,
          diferenca: item.diferenca_normal,
          depositos: 0,
          saques: 0,
          transferencias_entrada: 0,
          transferencias_saida: 0,
          lucro_apostas: 0,
          cashback: 0,
          giros_gratis: 0,
          bonus_creditado: 0,
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
  }, [workspaceId]);

  /**
   * Corrige o saldo de um bookmaker específico
   * No motor v7, isso significa ajustar o saldo para a soma dos eventos
   */
  const fixBookmaker = useCallback(async (bookmakerId: string): Promise<boolean> => {
    try {
      // Buscar soma dos eventos
      const { data: audit } = await supabase
        .from('v_financial_audit')
        .select('soma_eventos_normal, soma_eventos_freebet, bookmaker_nome')
        .eq('bookmaker_id', bookmakerId)
        .single();

      if (!audit) {
        toast.error('Bookmaker não encontrado na auditoria');
        return false;
      }

      // Atualizar saldo para refletir a soma dos eventos
      const { error: updateError } = await supabase
        .from('bookmakers')
        .update({ 
          saldo_atual: audit.soma_eventos_normal || 0,
          saldo_freebet: audit.soma_eventos_freebet || 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', bookmakerId);

      if (updateError) {
        console.error('[useBookmakerBalanceVerification] Erro update:', updateError);
        toast.error('Erro ao corrigir saldo');
        return false;
      }

      setDiscrepancies(prev => prev.filter(d => d.bookmaker_id !== bookmakerId));
      toast.success(`Saldo corrigido para ${audit.bookmaker_nome || 'bookmaker'}`);
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
    if (!workspaceId || discrepancies.length === 0) return false;

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
  }, [workspaceId, discrepancies, fixBookmaker]);

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
