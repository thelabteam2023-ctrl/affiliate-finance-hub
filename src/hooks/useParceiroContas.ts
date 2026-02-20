import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ContaBancaria {
  id: string;
  tipo: 'banco';
  label: string;
  banco: string;
  agencia: string | null;
  conta: string | null;
  titular: string;
  moeda: string;
  pix_key?: string | null;
}

export interface WalletCrypto {
  id: string;
  tipo: 'wallet';
  label: string;
  exchange: string | null;
  network: string;
  endereco: string;
  moedas: string[];
}

export type ContaOuWallet = ContaBancaria | WalletCrypto;

export function useParceiroContas(parceiroId: string | null) {
  return useQuery({
    queryKey: ['parceiro-contas', parceiroId],
    queryFn: async (): Promise<ContaOuWallet[]> => {
      if (!parceiroId) return [];

      const [contasRes, walletsRes] = await Promise.all([
        supabase
          .from('contas_bancarias')
          .select('id, banco, agencia, conta, titular, moeda, pix_key')
          .eq('parceiro_id', parceiroId)
          .order('banco'),
        supabase
          .from('wallets_crypto')
          .select('id, exchange, network, endereco, moeda')
          .eq('parceiro_id', parceiroId)
          .order('network'),
      ]);

      const contas: ContaBancaria[] = (contasRes.data ?? []).map((c: any) => ({
        id: c.id,
        tipo: 'banco',
        banco: c.banco,
        agencia: c.agencia,
        conta: c.conta,
        titular: c.titular,
        moeda: c.moeda,
        pix_key: c.pix_key,
        label: `${c.banco}${c.conta ? ` – ${c.conta}` : ''} (${c.moeda})`,
      }));

      const wallets: WalletCrypto[] = (walletsRes.data ?? []).map((w: any) => ({
        id: w.id,
        tipo: 'wallet',
        exchange: w.exchange,
        network: w.network,
        endereco: w.endereco,
        moedas: Array.isArray(w.moeda) ? w.moeda : [],
        label: `${w.exchange ?? w.network} – ${w.endereco.slice(0, 8)}...${w.endereco.slice(-6)}`,
      }));

      return [...contas, ...wallets];
    },
    enabled: !!parceiroId,
    staleTime: 2 * 60 * 1000,
  });
}
