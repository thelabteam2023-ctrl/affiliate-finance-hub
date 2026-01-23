/**
 * Hook para buscar transações pendentes de conciliação
 * Busca GLOBALMENTE no workspace, sem filtro de data
 * Garante que todas as transações pendentes apareçam na aba Conciliação
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CASH_REAL_TYPES } from "@/lib/cashOperationalTypes";

export interface PendingTransaction {
  id: string;
  data_transacao: string;
  created_at: string;
  tipo_transacao: string;
  tipo_moeda: string;
  moeda: string;
  moeda_origem: string | null;
  moeda_destino: string | null;
  coin: string | null;
  valor: number;
  valor_origem: number | null;
  valor_destino: number | null;
  valor_usd: number | null;
  qtd_coin: number | null;
  cotacao: number | null;
  origem_tipo: string | null;
  destino_tipo: string | null;
  descricao: string | null;
  status: string;
  origem_parceiro_id: string | null;
  origem_conta_bancaria_id: string | null;
  origem_wallet_id: string | null;
  origem_bookmaker_id: string | null;
  destino_parceiro_id: string | null;
  destino_conta_bancaria_id: string | null;
  destino_wallet_id: string | null;
  destino_bookmaker_id: string | null;
  nome_investidor: string | null;
  operador_id: string | null;
}

export const PENDING_TRANSACTIONS_QUERY_KEY = "pending-transactions";

export function usePendingTransactions() {
  return useQuery({
    queryKey: [PENDING_TRANSACTIONS_QUERY_KEY],
    queryFn: async (): Promise<PendingTransaction[]> => {
      // Buscar TODAS as transações pendentes no workspace
      // Sem filtro de data para garantir visibilidade completa
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("*")
        .in("tipo_transacao", [...CASH_REAL_TYPES])
        .in("status", ["pendente", "PENDENTE"])
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao buscar transações pendentes:", error);
        throw error;
      }

      return (data || []) as PendingTransaction[];
    },
    staleTime: 30 * 1000, // 30 segundos
    refetchOnWindowFocus: true,
  });
}

export function useInvalidatePendingTransactions() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: [PENDING_TRANSACTIONS_QUERY_KEY] });
  };
}
