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
 */
function useInvalidateFreebetQueries() {
  const queryClient = useQueryClient();
  const invalidateBonusQueries = useInvalidateBonusQueries();

  return (projetoId: string) => {
    queryClient.invalidateQueries({ queryKey: FREEBET_ESTOQUE_KEYS.all(projetoId) });
    invalidateBonusQueries(projetoId);
  };
}

export function useFreebetEstoqueMutations(projetoId: string) {
  const { workspaceId } = useWorkspace();
  const invalidate = useInvalidateFreebetQueries();

  // ================================================================
  // CRIAÇÃO
  // ================================================================
  const createMutation = useMutation({
    mutationFn: async (data: CreateFreebetData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");
      if (!workspaceId) throw new Error("Workspace não definido");

      const { data: inserted, error } = await supabase
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
        })
        .select("id")
        .single();

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

      return inserted;
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

  // ================================================================
  // EDIÇÃO — com proteções de integridade
  // ================================================================
  const updateMutation = useMutation({
    mutationFn: async ({ id, data, currentFreebet }: { 
      id: string; 
      data: Partial<FreebetRecebidaCompleta>;
      currentFreebet?: FreebetRecebidaCompleta;
    }) => {
      // 🛡️ PROTEÇÃO: Freebets utilizadas NÃO podem ser editadas
      if (currentFreebet?.utilizada) {
        throw new Error("Freebet já utilizada não pode ser editada. Cancele e crie uma nova.");
      }

      // 🛡️ PROTEÇÃO: Freebets canceladas NÃO podem ser editadas
      if (currentFreebet?.status === "CANCELADA") {
        throw new Error("Freebet cancelada não pode ser editada.");
      }

      const updateData: Record<string, unknown> = {};
      if (data.valor !== undefined) updateData.valor = data.valor;
      if (data.motivo !== undefined) updateData.motivo = data.motivo;
      if (data.data_recebida !== undefined) updateData.data_recebida = data.data_recebida;
      if (data.data_validade !== undefined) updateData.data_validade = data.data_validade;
      if (data.status !== undefined) updateData.status = data.status;
      if (data.origem !== undefined) updateData.origem = data.origem;

      // 🛡️ PROTEÇÃO: Não permitir alterar flag utilizada diretamente
      // Este campo é derivado do ledger
      
      updateData.updated_at = new Date().toISOString();

      const { data: updated, error } = await supabase
        .from("freebets_recebidas")
        .update(updateData)
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!updated) throw new Error("Sem permissão para atualizar ou registro não encontrado");

      // Se mudou de status para LIBERADA, creditar no ledger
      if (data.status === "LIBERADA" && currentFreebet?.status !== "LIBERADA") {
        const valor = data.valor ?? currentFreebet?.valor ?? 0;
        const result = await creditarFreebetViaLedger(
          currentFreebet?.bookmaker_id || "",
          valor,
          "MANUAL",
          { descricao: `Freebet liberada: ${data.motivo ?? currentFreebet?.motivo ?? ""}` }
        );
        if (!result.success) {
          console.error("[FreebetMutations] Erro ao creditar na mudança de status:", result.error);
        }
      }

      // Se saiu de LIBERADA para outro status, estornar do ledger
      if (currentFreebet?.status === "LIBERADA" && data.status && data.status !== "LIBERADA") {
        const result = await estornarFreebetViaLedger(
          currentFreebet.bookmaker_id,
          currentFreebet.valor,
          `Estorno por mudança de status: ${currentFreebet.motivo}`
        );
        if (!result.success) {
          console.error("[FreebetMutations] Erro ao estornar na mudança de status:", result.error);
        }
      }
    },
    onSuccess: () => {
      toast.success("Freebet atualizada com sucesso");
      invalidate(projetoId);
    },
    onError: (err: Error) => {
      console.error("Error updating freebet:", err);
      toast.error(err.message || "Erro ao atualizar freebet");
    },
  });

  // ================================================================
  // CANCELAMENTO (soft-delete) — substitui o DELETE físico
  // ================================================================
  const deleteMutation = useMutation({
    mutationFn: async ({ id, freebet }: { id: string; freebet: FreebetRecebidaCompleta }) => {
      // 🛡️ PROTEÇÃO: Freebet já utilizada NÃO pode ser cancelada/excluída
      if (freebet.utilizada) {
        throw new Error("Freebet já utilizada não pode ser removida. O histórico deve ser preservado.");
      }

      // 🛡️ PROTEÇÃO: Freebet já cancelada
      if (freebet.status === "CANCELADA") {
        throw new Error("Freebet já foi cancelada anteriormente.");
      }

      // ================================================================
      // ROTA 1: Freebet originada do módulo de Bônus
      // ================================================================
      if (freebet.origem === "PROMOCAO") {
        if (freebet.status === "LIBERADA") {
          const result = await estornarFreebetViaLedger(
            freebet.bookmaker_id,
            freebet.valor,
            `Cancelamento de freebet (promoção): ${freebet.motivo}`
          );
          if (!result.success) {
            throw new Error(`Erro ao reverter saldo: ${result.error || "falha desconhecida"}`);
          }
        }

        // Soft-delete: marcar como cancelada no módulo de bônus
        const { error } = await supabase
          .from("project_bookmaker_link_bonuses")
          .update({ status: "cancelled" })
          .eq("id", id);

        if (error) throw error;
        return;
      }

      // ================================================================
      // ROTA 2: Freebet manual (freebets_recebidas) — SOFT DELETE
      // ================================================================
      if (freebet.status === "LIBERADA") {
        const result = await estornarFreebetViaLedger(
          freebet.bookmaker_id,
          freebet.valor,
          `Cancelamento de freebet: ${freebet.motivo}`
        );
        if (!result.success) {
          throw new Error(`Erro ao reverter saldo: ${result.error || "falha desconhecida"}`);
        }
      }

      // SOFT DELETE: marca como CANCELADA em vez de deletar fisicamente
      const { data: updated, error } = await supabase
        .from("freebets_recebidas")
        .update({ 
          status: "CANCELADA",
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("id")
        .maybeSingle();

      if (error) throw error;
      if (!updated) throw new Error("Sem permissão para cancelar ou registro não encontrado");
    },
    onSuccess: () => {
      toast.success("Freebet cancelada e saldo estornado");
      invalidate(projetoId);
    },
    onError: (err: Error) => {
      console.error("Error cancelling freebet:", err);
      toast.error(`Erro ao cancelar freebet: ${err.message}`);
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
    updateFreebet: async (id: string, data: Partial<FreebetRecebidaCompleta>, currentFreebet?: FreebetRecebidaCompleta) => {
      try {
        await updateMutation.mutateAsync({ id, data, currentFreebet });
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
