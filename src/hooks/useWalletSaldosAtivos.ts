import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface WalletSaldoAtivo {
  coin: string;
  saldo_total_coin: number;
  saldo_disponivel_coin: number;
  saldo_em_transito_coin: number;
  saldo_disponivel_usd: number;
  /** Cotação implícita do ativo (USD por unidade), derivada do próprio saldo */
  cotacao_usd: number;
}

/**
 * Saldos por ativo de uma carteira cripto (fonte: v_saldo_parceiro_wallets).
 * Usado para validar o valor em disputa contra o saldo realmente disponível.
 */
export function useWalletSaldosAtivos(walletId: string | null | undefined) {
  return useQuery({
    queryKey: ['wallet-saldos-ativos', walletId],
    queryFn: async (): Promise<WalletSaldoAtivo[]> => {
      if (!walletId) return [];
      const { data, error } = await supabase
        .from('v_saldo_parceiro_wallets' as any)
        .select('coin, saldo_total_coin, saldo_disponivel_coin, saldo_em_transito_coin, saldo_disponivel')
        .eq('wallet_id', walletId);
      if (error) throw error;
      return ((data as any[]) ?? [])
        .filter((r) => !!r.coin)
        .map((r) => {
          const disponivelCoin = Number(r.saldo_disponivel_coin) || 0;
          const disponivelUsd = Number(r.saldo_disponivel) || 0;
          return {
            coin: String(r.coin).toUpperCase(),
            saldo_total_coin: Number(r.saldo_total_coin) || 0,
            saldo_disponivel_coin: disponivelCoin,
            saldo_em_transito_coin: Number(r.saldo_em_transito_coin) || 0,
            saldo_disponivel_usd: disponivelUsd,
            cotacao_usd: disponivelCoin > 0 ? disponivelUsd / disponivelCoin : 0,
          };
        })
        .sort((a, b) => b.saldo_disponivel_usd - a.saldo_disponivel_usd);
    },
    enabled: !!walletId,
    staleTime: 60 * 1000,
  });
}
