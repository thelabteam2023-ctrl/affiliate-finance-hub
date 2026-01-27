/**
 * =============================================================================
 * HOOK: useWalletTransitBalance
 * =============================================================================
 * 
 * Hook para gerenciar saldos de wallets crypto com suporte a "Dinheiro em Trânsito".
 * Implementa o modelo de 3 camadas de saldo:
 * 
 * 1. balance_total: Saldo total confirmado da wallet
 * 2. balance_locked: Valor em trânsito (enviado mas não confirmado)
 * 3. balance_available: Saldo disponível para uso (total - locked)
 * 
 * REGRA FUNDAMENTAL: Operações sempre usam balance_available, nunca balance_total
 * =============================================================================
 */

import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface WalletBalances {
  wallet_id: string;
  exchange: string | null;
  endereco: string;
  network: string | null;
  balance_total: number;      // Saldo total (USD)
  balance_locked: number;     // Em trânsito (USD)
  balance_available: number;  // Disponível (USD)
  coin_total: number;         // Saldo em coins
  primary_coin: string | null;
}

export interface TransitOperation {
  success: boolean;
  error?: string;
  ledger_id?: string;
  locked_amount?: number;
  new_locked_total?: number;
  remaining_available?: number;
  valor_confirmado?: number;
  funds_released?: number;
}

export type TransitStatus = 'PENDING' | 'CONFIRMED' | 'FAILED' | 'REVERSED';

/**
 * Hook para gerenciar saldos de wallet com suporte a dinheiro em trânsito
 */
// Type for RPC responses (JSON returns from Supabase)
interface RpcResponse {
  success?: boolean;
  error?: string;
  wallet_id?: string;
  exchange?: string;
  endereco?: string;
  network?: string;
  balance_total?: number;
  balance_locked?: number;
  balance_available?: number;
  coin_total?: number;
  primary_coin?: string;
  available?: number;
  requested?: number;
  locked_amount?: number;
  new_locked_total?: number;
  remaining_available?: number;
  ledger_id?: string;
  valor_confirmado?: number;
  funds_released?: number;
  current_status?: string;
}

export function useWalletTransitBalance() {
  const { toast } = useToast();

  /**
   * Obtém os saldos de uma wallet específica com os 3 valores
   */
  const getWalletBalances = useCallback(async (walletId: string): Promise<WalletBalances | null> => {
    try {
      const { data, error } = await supabase.rpc('get_wallet_balances', {
        p_wallet_id: walletId
      });

      if (error) {
        console.error('[getWalletBalances] Error:', error);
        return null;
      }

      const result = data as unknown as RpcResponse;

      if (!result?.success) {
        console.error('[getWalletBalances] RPC error:', result?.error);
        return null;
      }

      return {
        wallet_id: result.wallet_id || walletId,
        exchange: result.exchange || null,
        endereco: result.endereco || '',
        network: result.network || null,
        balance_total: Number(result.balance_total) || 0,
        balance_locked: Number(result.balance_locked) || 0,
        balance_available: Number(result.balance_available) || 0,
        coin_total: Number(result.coin_total) || 0,
        primary_coin: result.primary_coin || null,
      };
    } catch (err) {
      console.error('[getWalletBalances] Exception:', err);
      return null;
    }
  }, []);

  /**
   * Trava saldo na wallet (quando inicia uma transação crypto)
   * Deve ser chamado ANTES de inserir no cash_ledger
   */
  const lockBalance = useCallback(async (
    walletId: string,
    valorUsd: number,
    ledgerId?: string
  ): Promise<TransitOperation> => {
    try {
      const { data, error } = await supabase.rpc('lock_wallet_balance', {
        p_wallet_id: walletId,
        p_valor_usd: valorUsd,
        p_ledger_id: ledgerId || null
      });

      if (error) {
        console.error('[lockBalance] Error:', error);
        return { success: false, error: error.message };
      }

      const result = data as unknown as RpcResponse;

      if (!result?.success) {
        // Saldo insuficiente
        if (result?.error === 'INSUFFICIENT_AVAILABLE_BALANCE') {
          toast({
            title: "Saldo insuficiente",
            description: `Disponível: $${result.available?.toFixed(2)}, Solicitado: $${result.requested?.toFixed(2)}`,
            variant: "destructive",
          });
        }
        return { 
          success: false, 
          error: result?.error,
          remaining_available: result?.available
        };
      }

      return {
        success: true,
        locked_amount: result.locked_amount,
        new_locked_total: result.new_locked_total,
        remaining_available: result.remaining_available
      };
    } catch (err) {
      console.error('[lockBalance] Exception:', err);
      return { success: false, error: 'Erro ao travar saldo' };
    }
  }, [toast]);

  /**
   * Destrava saldo diretamente (sem ledger_id)
   * Usado quando o insert no ledger falha APÓS o lock ter sido feito
   */
  const unlockBalance = useCallback(async (
    walletId: string,
    valorUsd: number
  ): Promise<TransitOperation> => {
    try {
      const { data, error } = await supabase.rpc('unlock_wallet_balance', {
        p_wallet_id: walletId,
        p_valor_usd: valorUsd
      });

      if (error) {
        console.error('[unlockBalance] Error:', error);
        return { success: false, error: error.message };
      }

      const result = data as unknown as RpcResponse;

      if (!result?.success) {
        return { success: false, error: result?.error };
      }

      console.log('[unlockBalance] Saldo liberado:', {
        unlocked: (result as any).unlocked_amount,
        newLocked: (result as any).new_locked_total
      });

      return {
        success: true,
        funds_released: (result as any).unlocked_amount
      };
    } catch (err) {
      console.error('[unlockBalance] Exception:', err);
      return { success: false, error: 'Erro ao destravar saldo' };
    }
  }, []);

  /**
   * Confirma uma transação em trânsito (destravar e efetivar débito)
   * Deve ser chamado na CONCILIAÇÃO quando o valor chegar no destino
   */
  const confirmTransit = useCallback(async (
    ledgerId: string,
    valorConfirmado?: number
  ): Promise<TransitOperation> => {
    try {
      const { data, error } = await supabase.rpc('confirm_wallet_transit', {
        p_ledger_id: ledgerId,
        p_valor_confirmado: valorConfirmado || null
      });

      if (error) {
        console.error('[confirmTransit] Error:', error);
        return { success: false, error: error.message };
      }

      const result = data as unknown as RpcResponse;

      if (!result?.success) {
        return { success: false, error: result?.error };
      }

      toast({
        title: "Transação confirmada",
        description: "O valor foi confirmado no destino.",
      });

      return {
        success: true,
        ledger_id: result.ledger_id,
        valor_confirmado: result.valor_confirmado
      };
    } catch (err) {
      console.error('[confirmTransit] Exception:', err);
      return { success: false, error: 'Erro ao confirmar transação' };
    }
  }, [toast]);

  /**
   * Reverte ou marca como falha uma transação em trânsito
   * Os fundos voltam a ficar disponíveis
   */
  const revertTransit = useCallback(async (
    ledgerId: string,
    status: 'FAILED' | 'REVERSED' = 'FAILED',
    motivo?: string
  ): Promise<TransitOperation> => {
    try {
      const { data, error } = await supabase.rpc('revert_wallet_transit', {
        p_ledger_id: ledgerId,
        p_status: status,
        p_motivo: motivo || null
      });

      if (error) {
        console.error('[revertTransit] Error:', error);
        return { success: false, error: error.message };
      }

      const result = data as unknown as RpcResponse;

      if (!result?.success) {
        return { success: false, error: result?.error };
      }

      toast({
        title: status === 'REVERSED' ? "Transação revertida" : "Transação falhou",
        description: `Os fundos ($${result.funds_released?.toFixed(2)}) foram liberados.`,
        variant: status === 'REVERSED' ? "default" : "destructive",
      });

      return {
        success: true,
        ledger_id: result.ledger_id,
        funds_released: result.funds_released
      };
    } catch (err) {
      console.error('[revertTransit] Exception:', err);
      return { success: false, error: 'Erro ao reverter transação' };
    }
  }, [toast]);

  /**
   * Busca todas as transações PENDING de uma wallet
   */
  const getPendingTransactions = useCallback(async (walletId: string) => {
    try {
      const { data, error } = await supabase
        .from('cash_ledger')
        .select('id, valor_usd, data_transacao, descricao, destino_bookmaker_id')
        .eq('origem_wallet_id', walletId)
        .eq('transit_status', 'PENDING')
        .order('data_transacao', { ascending: false });

      if (error) {
        console.error('[getPendingTransactions] Error:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('[getPendingTransactions] Exception:', err);
      return [];
    }
  }, []);

  /**
   * Valida se um valor pode ser enviado (tem saldo disponível suficiente)
   */
  const canSendAmount = useCallback(async (
    walletId: string,
    valorUsd: number
  ): Promise<{ canSend: boolean; available: number; shortfall?: number }> => {
    const balances = await getWalletBalances(walletId);
    
    if (!balances) {
      return { canSend: false, available: 0 };
    }

    const canSend = balances.balance_available >= valorUsd;
    
    return {
      canSend,
      available: balances.balance_available,
      shortfall: canSend ? undefined : valorUsd - balances.balance_available
    };
  }, [getWalletBalances]);

  return {
    getWalletBalances,
    lockBalance,
    unlockBalance,
    confirmTransit,
    revertTransit,
    getPendingTransactions,
    canSendAmount,
  };
}
