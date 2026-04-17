import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { invalidateCanonicalCaches } from "@/lib/invalidateCanonicalCaches";

interface ReverterArgs {
  transacaoId: string;
  motivo: string;
  projetoIdSnapshot?: string | null;
}

interface ExcluirArgs {
  transacaoId: string;
  motivo: string;
  projetoIdSnapshot?: string | null;
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>, projetoId?: string | null) {
  qc.invalidateQueries({ queryKey: ["caixa-operacional"] });
  qc.invalidateQueries({ queryKey: ["cash_ledger"] });
  qc.invalidateQueries({ queryKey: ["caixa-transacoes"] });
  qc.invalidateQueries({ queryKey: ["parceiro-saldos"] });
  qc.invalidateQueries({ queryKey: ["saldo-contas-bancarias"] });
  qc.invalidateQueries({ queryKey: ["saldo-wallets-crypto"] });
  qc.invalidateQueries({ queryKey: ["bookmakers"] });
  if (projetoId) invalidateCanonicalCaches(qc, projetoId);
  window.dispatchEvent(new CustomEvent("lovable:caixa-data-changed"));
}

export function useReverterMovimentacao() {
  const qc = useQueryClient();

  const reverter = useMutation({
    mutationFn: async ({ transacaoId, motivo }: ReverterArgs) => {
      const { data, error } = await supabase.rpc("reverter_movimentacao_caixa" as any, {
        p_transacao_id: transacaoId,
        p_motivo: motivo,
      });
      if (error) throw error;
      const result = data as { success: boolean; message: string; mirror_id?: string };
      if (!result?.success) throw new Error(result?.message || "Falha ao reverter");
      return result;
    },
    onSuccess: (result, vars) => {
      toast.success(result.message || "Movimentação revertida");
      invalidateAll(qc, vars.projetoIdSnapshot);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao reverter movimentação");
    },
  });

  const excluir = useMutation({
    mutationFn: async ({ transacaoId, motivo }: ExcluirArgs) => {
      const { data, error } = await supabase.rpc("excluir_movimentacao_caixa" as any, {
        p_transacao_id: transacaoId,
        p_motivo: motivo,
      });
      if (error) throw error;
      const result = data as { success: boolean; message: string };
      if (!result?.success) throw new Error(result?.message || "Falha ao excluir");
      return result;
    },
    onSuccess: (result, vars) => {
      toast.success(result.message || "Movimentação excluída");
      invalidateAll(qc, vars.projetoIdSnapshot);
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao excluir movimentação");
    },
  });

  return { reverter, excluir };
}
