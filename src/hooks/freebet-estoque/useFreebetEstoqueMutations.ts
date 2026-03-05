import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { creditarFreebetViaLedger, estornarFreebetViaLedger } from "@/lib/freebetLedgerService";
import { useWorkspace } from "@/hooks/useWorkspace";
import { useInvalidateBonusQueries } from "@/hooks/useProjectBonuses";
import type { FreebetRecebidaCompleta } from "./types";
import { FREEBET_ESTOQUE_KEYS } from "./types";

export interface CreateFreebetData {
  bookmaker_id: string;
  valor: number;
  motivo: string;
  data_recebida: string;
  data_validade?: string;
  status: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA";
  origem?: "MANUAL" | "QUALIFICADORA" | "PROMOCAO";
}

/**
 * Centraliza a invalidação de todas as queries afetadas por mudanças em freebets.
 * Reutiliza useInvalidateBonusQueries para evitar duplicação.
 */
function useInvalidateFreebetQueries() {
  const queryClient = useQueryClient();
  const invalidateBonusQueries = useInvalidateBonusQueries();

  return (projetoId: string) => {
    // Invalida a query de estoque (useQuery nativo agora)
    queryClient.invalidateQueries({ queryKey: FREEBET_ESTOQUE_KEYS.all(projetoId) });
    // Reutiliza o invalidador centralizado de bônus (saldos, KPIs, vínculos, etc.)
    invalidateBonusQueries(projetoId);
  };
}

export function useFreebetEstoqueMutations(projetoId: string) {
  const { workspaceId } = useWorkspace();
  const invalidate = useInvalidateFreebetQueries();

  const createMutation = useMutation({
    mutationFn: async (data: CreateFreebetData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!workspaceId) throw new Error("Workspace não definido");

      const { error } = await supabase
        .from("freebets_recebidas")
        .insert({
          projeto_id: projetoId,
          bookmaker_id: data.bookmaker_id,
          valor: data.valor,
          motivo: data.motivo,
          data_recebida: data.data_recebida,
          data_validade: data.data_validade || null,
          status: data.status,
          origem: data.origem || "MANUAL",
          user_id: user.id,
          workspace_id: workspaceId,
          utilizada: false,
        });

      if (error) throw error;

      if (data.status === "LIBERADA") {
        const result = await creditarFreebetViaLedger(
          data.bookmaker_id,
          data.valor,
          "MANUAL",
          { descricao: `Freebet manual: ${data.motivo}` }
        );
        if (!result.success) {
          console.error("[FreebetMutations] Erro ao creditar freebet:", result.error);
          toast.error(`Freebet registrada, mas erro ao atualizar saldo: ${result.error || "falha desconhecida"}`);
        }
      }
    },
    onSuccess: () => {
      toast.success("Freebet registrada com sucesso");
      invalidate(projetoId);
    },
    onError: (err: Error) => {
      console.error("Error creating freebet:", err);
      toast.error("Erro ao registrar freebet");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<FreebetRecebidaCompleta> }) => {
      const updateData: any = {};
      if (data.valor !== undefined) updateData.valor = data.valor;
      if (data.motivo !== undefined) updateData.motivo = data.motivo;
      if (data.data_recebida !== undefined) updateData.data_recebida = data.data_recebida;
      if (data.data_validade !== undefined) updateData.data_validade = data.data_validade;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.utilizada !== undefined) updateData.utilizada = data.utilizada;
      if (data.data_utilizacao !== undefined) updateData.data_utilizacao = data.data_utilizacao;
      if (data.origem !== undefined) updateData.origem = data.origem;

      const { error } = await supabase
        .from("freebets_recebidas")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Freebet atualizada com sucesso");
      invalidate(projetoId);
    },
    onError: (err: Error) => {
      console.error("Error updating freebet:", err);
      toast.error("Erro ao atualizar freebet");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, freebet }: { id: string; freebet: FreebetRecebidaCompleta }) => {
      // ================================================================
      // ROTA 1: Freebet originada do módulo de Bônus
      // ================================================================
      if (freebet.origem === "PROMOCAO") {
        if (freebet.status === "LIBERADA" && !freebet.utilizada) {
          const result = await estornarFreebetViaLedger(
            freebet.bookmaker_id,
            freebet.valor,
            `Reversão por exclusão de freebet (promoção): ${freebet.motivo}`
          );
          if (!result.success) {
            throw new Error(`Erro ao reverter saldo: ${result.error || "falha desconhecida"}`);
          }
        }

        const { error } = await supabase
          .from("project_bookmaker_link_bonuses")
          .delete()
          .eq("id", id);

        if (error) throw error;
        return;
      }

      // ================================================================
      // ROTA 2: Freebet manual (freebets_recebidas)
      // ================================================================
      if (freebet.status === "LIBERADA" && !freebet.utilizada) {
        const result = await estornarFreebetViaLedger(
          freebet.bookmaker_id,
          freebet.valor,
          `Reversão por exclusão de freebet: ${freebet.motivo}`
        );
        if (!result.success) {
          throw new Error(`Erro ao reverter saldo: ${result.error || "falha desconhecida"}`);
        }
      }

      const { error } = await supabase
        .from("freebets_recebidas")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Freebet removida e saldo estornado");
      invalidate(projetoId);
    },
    onError: (err: Error) => {
      console.error("Error deleting freebet:", err);
      toast.error(`Erro ao remover freebet: ${err.message}`);
    },
  });

  return {
    createFreebet: async (data: CreateFreebetData) => {
      try {
        await createMutation.mutateAsync(data);
        return true;
      } catch {
        return false;
      }
    },
    updateFreebet: async (id: string, data: Partial<FreebetRecebidaCompleta>) => {
      try {
        await updateMutation.mutateAsync({ id, data });
        return true;
      } catch {
        return false;
      }
    },
    deleteFreebet: async (id: string, freebet: FreebetRecebidaCompleta) => {
      try {
        await deleteMutation.mutateAsync({ id, freebet });
        return true;
      } catch {
        return false;
      }
    },
    isSaving: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
  };
}
