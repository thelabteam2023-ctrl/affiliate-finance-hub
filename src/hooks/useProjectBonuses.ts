import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { registrarBonusCreditadoViaLedger, getBookmakerMoeda } from "@/lib/ledgerService";
import { useWorkspace } from "@/hooks/useWorkspace";

export type BonusStatus = "pending" | "credited" | "failed" | "expired" | "reversed" | "finalized";

export type FinalizeReason = "rollover_completed" | "cycle_completed" | "expired" | "cancelled_reversed";

export type BonusSource = "manual" | "template";

export interface ProjectBonus {
  id: string;
  workspace_id: string | null;
  project_id: string;
  bookmaker_id: string;
  title: string;
  bonus_amount: number;
  saldo_atual: number; // Saldo atual do bônus (pode ser menor que bonus_amount se consumido)
  currency: string;
  status: BonusStatus;
  credited_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  finalized_by: string | null;
  finalize_reason: FinalizeReason | null;
  // New fields for template and rollover
  source: BonusSource;
  template_snapshot: Record<string, unknown> | null;
  rollover_multiplier: number | null;
  rollover_base: string | null;
  rollover_target_amount: number | null;
  rollover_progress: number;
  deposit_amount: number | null;
  min_odds: number | null;
  deadline_days: number | null;
  // Joined data
  bookmaker_nome?: string;
  bookmaker_login?: string;
  bookmaker_logo_url?: string | null;
  parceiro_nome?: string | null;
  bookmaker_catalogo_id?: string | null;
  // Campos de snapshot multi-moeda
  cotacao_credito_snapshot?: number | null;
  cotacao_credito_at?: string | null;
  valor_brl_referencia?: number | null;
}

export interface BonusFormData {
  bookmaker_id: string;
  title: string;
  bonus_amount: number;
  currency: string;
  status: BonusStatus;
  credited_at?: string | null;
  expires_at?: string | null;
  notes?: string | null;
  // New fields
  source?: BonusSource;
  template_snapshot?: Record<string, unknown> | null;
  rollover_multiplier?: number | null;
  rollover_base?: string | null;
  rollover_target_amount?: number | null;
  deposit_amount?: number | null;
  min_odds?: number | null;
  deadline_days?: number | null;
}

export interface BonusSummary {
  total_credited: number;
  total_pending: number;
  total_failed: number;
  total_expired: number;
  total_reversed: number;
  total_finalized: number;
  count_credited: number;
  count_pending: number;
  count_failed: number;
  count_expired: number;
  count_reversed: number;
  count_finalized: number;
  // For operational balance
  active_bonus_total: number;
  bookmakers_with_active_bonus: number;
}

interface UseProjectBonusesProps {
  projectId: string;
  bookmakerId?: string; // Optional: filter by specific bookmaker
}

// Query keys for bonus-related queries
export const bonusQueryKeys = {
  all: ["bonus"] as const,
  project: (projectId: string) => ["bonus", "project", projectId] as const,
  bookmaker: (projectId: string, bookmakerId: string) => ["bonus", "project", projectId, "bookmaker", bookmakerId] as const,
  // Related queries that depend on bonus data
  related: (projectId: string) => [
    ["bonus", "project", projectId],
    ["apostas", projectId], // Bets may have bonus_id
    ["bookmaker-saldos", projectId], // Balance includes bonus info
  ] as const,
};

// Function to invalidate all bonus-related queries + FINANCIAL_STATE
export function useInvalidateBonusQueries() {
  const queryClient = useQueryClient();
  
  return useCallback((projectId: string) => {
    // Bonus queries
    queryClient.invalidateQueries({ queryKey: ["bonus", "project", projectId] });
    
    // FINANCIAL_STATE - Bônus afetam saldos e KPIs
    queryClient.invalidateQueries({ queryKey: ["apostas", projectId] });
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos", projectId] });
    queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos"] });
    queryClient.invalidateQueries({ queryKey: ["bookmakers"] });
    
    // Vínculos (saldos aparecem na aba vínculos)
    queryClient.invalidateQueries({ queryKey: ["projeto-vinculos", projectId] });
    
    // KPIs
    queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projectId] });
    queryClient.invalidateQueries({ queryKey: ["projeto-breakdowns", projectId] });
    
    // Exposição
    queryClient.invalidateQueries({ queryKey: ["exposicao-projeto", projectId] });
    
    // Parceiros
    queryClient.invalidateQueries({ queryKey: ["parceiro-financeiro"] });
    queryClient.invalidateQueries({ queryKey: ["parceiro-consolidado"] });
    
    console.log(`[useInvalidateBonusQueries] Invalidated FINANCIAL_STATE for project ${projectId}`);
  }, [queryClient]);
}

async function fetchBonusesFromDb(projectId: string, bookmakerId?: string): Promise<ProjectBonus[]> {
  let query = supabase
    .from("project_bookmaker_link_bonuses")
    .select(`
      *,
      bookmakers!project_bookmaker_link_bonuses_bookmaker_id_fkey (
        nome,
        login_username,
        parceiro_id,
        bookmaker_catalogo_id,
        bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (logo_url),
        parceiros!bookmakers_parceiro_id_fkey (nome)
      )
    `)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  if (bookmakerId) {
    query = query.eq("bookmaker_id", bookmakerId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).map((b: any) => ({
    id: b.id,
    workspace_id: b.workspace_id,
    project_id: b.project_id,
    bookmaker_id: b.bookmaker_id,
    title: b.title,
    bonus_amount: Number(b.bonus_amount),
    saldo_atual: Number(b.saldo_atual || 0),
    currency: b.currency,
    status: b.status as BonusStatus,
    credited_at: b.credited_at,
    expires_at: b.expires_at,
    notes: b.notes,
    created_by: b.created_by,
    created_at: b.created_at,
    updated_at: b.updated_at,
    finalized_at: b.finalized_at,
    finalized_by: b.finalized_by,
    finalize_reason: b.finalize_reason as FinalizeReason | null,
    source: (b.source || "manual") as BonusSource,
    template_snapshot: b.template_snapshot as Record<string, unknown> | null,
    rollover_multiplier: b.rollover_multiplier ? Number(b.rollover_multiplier) : null,
    rollover_base: b.rollover_base,
    rollover_target_amount: b.rollover_target_amount ? Number(b.rollover_target_amount) : null,
    rollover_progress: Number(b.rollover_progress || 0),
    deposit_amount: b.deposit_amount ? Number(b.deposit_amount) : null,
    min_odds: b.min_odds ? Number(b.min_odds) : null,
    deadline_days: b.deadline_days ? Number(b.deadline_days) : null,
    bookmaker_nome: b.bookmakers?.nome,
    bookmaker_login: b.bookmakers?.login_username,
    bookmaker_logo_url: b.bookmakers?.bookmakers_catalogo?.logo_url,
    parceiro_nome: b.bookmakers?.parceiros?.nome,
    bookmaker_catalogo_id: b.bookmakers?.bookmaker_catalogo_id,
    cotacao_credito_snapshot: b.cotacao_credito_snapshot ? Number(b.cotacao_credito_snapshot) : null,
    cotacao_credito_at: b.cotacao_credito_at,
    valor_brl_referencia: b.valor_brl_referencia ? Number(b.valor_brl_referencia) : null,
  }));
}

export function useProjectBonuses({ projectId, bookmakerId }: UseProjectBonusesProps) {
  const queryClient = useQueryClient();
  const invalidateBonusQueries = useInvalidateBonusQueries();
  const { workspaceId } = useWorkspace();

  const queryKey = bookmakerId 
    ? bonusQueryKeys.bookmaker(projectId, bookmakerId)
    : bonusQueryKeys.project(projectId);

  const { data: bonuses = [], isLoading: loading, refetch } = useQuery({
    queryKey,
    queryFn: () => fetchBonusesFromDb(projectId, bookmakerId),
    enabled: !!projectId,
    staleTime: 1000 * 30, // 30 seconds
  });
  
  const fetchBonuses = refetch;

  const getSummary = useCallback((): BonusSummary => {
    const summary: BonusSummary = {
      total_credited: 0,
      total_pending: 0,
      total_failed: 0,
      total_expired: 0,
      total_reversed: 0,
      total_finalized: 0,
      count_credited: 0,
      count_pending: 0,
      count_failed: 0,
      count_expired: 0,
      count_reversed: 0,
      count_finalized: 0,
      active_bonus_total: 0,
      bookmakers_with_active_bonus: 0,
    };

    const bookmakersWithBonus = new Set<string>();

    bonuses.forEach((b) => {
      switch (b.status) {
        case "credited":
          summary.total_credited += b.bonus_amount;
          summary.count_credited++;
          // No modelo unificado, saldo_atual é 0, usamos bonus_amount para contabilizar
          summary.active_bonus_total += b.bonus_amount;
          // Sempre adiciona bookmaker com bônus creditado (independente de saldo_atual)
          bookmakersWithBonus.add(b.bookmaker_id);
          break;
        case "pending":
          summary.total_pending += b.bonus_amount;
          summary.count_pending++;
          break;
        case "failed":
          summary.total_failed += b.bonus_amount;
          summary.count_failed++;
          break;
        case "expired":
          summary.total_expired += b.bonus_amount;
          summary.count_expired++;
          break;
        case "reversed":
          summary.total_reversed += b.bonus_amount;
          summary.count_reversed++;
          break;
        case "finalized":
          summary.total_finalized += b.bonus_amount;
          summary.count_finalized++;
          break;
      }
    });

    summary.bookmakers_with_active_bonus = bookmakersWithBonus.size;

    return summary;
  }, [bonuses]);

  const getActiveBonusByBookmaker = useCallback((bkId: string): number => {
    // No modelo unificado, retorna bonus_amount dos bônus creditados
    return bonuses
      .filter((b) => b.bookmaker_id === bkId && b.status === "credited")
      .reduce((acc, b) => acc + b.bonus_amount, 0);
  }, [bonuses]);

  const getBookmakersWithActiveBonus = useCallback((): string[] => {
    // Retorna bookmakers que têm bônus com status "credited"
    // No modelo unificado, saldo_atual é sempre 0, então verificamos apenas o status
    const ids = new Set<string>();
    bonuses.forEach((b) => {
      if (b.status === "credited") {
        ids.add(b.bookmaker_id);
      }
    });
    return Array.from(ids);
  }, [bonuses]);

 const getBookmakersWithAnyBonus = useCallback((): string[] => {
   // Retorna bookmakers que têm QUALQUER bônus (credited OU finalized)
   // Usado para análise histórica por casa
   const ids = new Set<string>();
   bonuses.forEach((b) => {
     if (b.status === "credited" || b.status === "finalized") {
       ids.add(b.bookmaker_id);
     }
   });
   return Array.from(ids);
 }, [bonuses]);

  const getActiveBonusId = useCallback((bkId: string): string | null => {
    // Retorna o ID do primeiro bônus creditado para o bookmaker
    const bonus = bonuses.find((b) => b.bookmaker_id === bkId && b.status === "credited");
    return bonus?.id || null;
  }, [bonuses]);

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: BonusFormData) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      if (!workspaceId) throw new Error("Workspace não definido nesta aba");

      // CORREÇÃO: saldo_atual do bônus deve refletir o valor creditado
      // A RPC get_bookmaker_saldos calcula saldo_bonus via SUM(saldo_atual) dos bônus creditados
      const bonusData = {
        project_id: projectId,
        bookmaker_id: data.bookmaker_id,
        title: data.title || "",
        bonus_amount: data.bonus_amount,
        // saldo_atual = valor do bônus quando creditado, 0 quando pendente
        saldo_atual: data.status === "credited" ? data.bonus_amount : 0,
        valor_creditado_no_saldo: data.status === "credited" ? data.bonus_amount : 0,
        migrado_para_saldo_unificado: true,
        currency: data.currency,
        status: data.status,
        credited_at: data.status === "credited" ? (data.credited_at || new Date().toISOString()) : null,
        expires_at: data.expires_at || null,
        notes: data.notes || null,
        created_by: userData.user.id,
        user_id: userData.user.id,
        workspace_id: workspaceId,
        source: data.source || "manual",
        template_snapshot: data.template_snapshot || null,
        rollover_multiplier: data.rollover_multiplier || null,
        rollover_base: data.rollover_base || null,
        rollover_target_amount: data.rollover_target_amount || null,
        deposit_amount: data.deposit_amount || null,
        min_odds: data.min_odds || null,
        deadline_days: data.deadline_days || null,
      };

      const { error } = await supabase
        .from("project_bookmaker_link_bonuses")
        .insert(bonusData as any);

      if (error) throw error;

      // MODELO UNIFICADO: Se status = credited, creditar via ledger
      if (data.status === "credited") {
        const moeda = await getBookmakerMoeda(data.bookmaker_id);
        
        const creditedAt = data.credited_at || new Date().toISOString();
        const result = await registrarBonusCreditadoViaLedger({
          bookmakerId: data.bookmaker_id,
          valor: data.bonus_amount,
          moeda,
          workspaceId,
          userId: userData.user.id,
          descricao: `Crédito de bônus: ${data.title || 'Sem título'}`,
          dataCredito: creditedAt.split('T')[0],
        });
        
        if (!result.success) {
          console.error("[useProjectBonuses] Erro ao creditar bônus via ledger:", result.error);
        } else {
          console.log(`[useProjectBonuses] Bônus creditado via ledger: ${data.bonus_amount}`);
        }
      }
    },
    onSuccess: () => {
      toast.success("Bônus registrado com sucesso");
      invalidateBonusQueries(projectId);
    },
    onError: (error: Error) => {
      console.error("Erro ao criar bônus:", error.message);
      toast.error("Erro ao registrar bônus: " + error.message);
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BonusFormData> }) => {
      const existingBonus = bonuses.find((b) => b.id === id);
      const updateData: any = { ...data };

      if (data.status === "credited" && !data.credited_at) {
        updateData.credited_at = new Date().toISOString();
      }

      // CORREÇÃO: saldo_atual do bônus deve refletir o valor creditado
      // A RPC get_bookmaker_saldos calcula saldo_bonus via SUM(saldo_atual) dos bônus creditados
      if (existingBonus && data.status && data.status !== existingBonus.status) {
        if (data.status === "credited") {
          // Creditar via ledger (para impactar saldo_real)
          const bonusAmount = data.bonus_amount ?? existingBonus.bonus_amount;
          const { data: userData } = await supabase.auth.getUser();

          if (!workspaceId) throw new Error("Workspace não definido nesta aba");
          
          const moeda = await getBookmakerMoeda(existingBonus.bookmaker_id);
          
          const creditedAt = (data.credited_at || existingBonus.credited_at || new Date().toISOString());
          const result = await registrarBonusCreditadoViaLedger({
            bookmakerId: existingBonus.bookmaker_id,
            valor: bonusAmount,
            moeda,
            workspaceId,
            userId: userData?.user?.id || '',
            descricao: `Crédito de bônus: ${existingBonus.title || 'Sem título'}`,
            bonusId: id,
            dataCredito: creditedAt.split('T')[0],
          });
          
          if (!result.success) {
            console.error("[useProjectBonuses] Erro ao creditar bônus via ledger:", result.error);
          } else {
            console.log(`[useProjectBonuses] Bônus atualizado e creditado via ledger: ${bonusAmount}`);
          }

          updateData.valor_creditado_no_saldo = bonusAmount;
          updateData.migrado_para_saldo_unificado = true;
          // CORREÇÃO: saldo_atual = valor do bônus quando creditado
          updateData.saldo_atual = bonusAmount;
        } else {
          // Se status muda de credited para outro, zerar saldo_atual
          updateData.saldo_atual = 0;
        }
        if (data.status !== "credited" && typeof data.credited_at === "undefined") {
          updateData.credited_at = null;
        }
      }

      const { error } = await supabase
        .from("project_bookmaker_link_bonuses")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bônus atualizado com sucesso");
      invalidateBonusQueries(projectId);
    },
    onError: (error: Error) => {
      console.error("Erro ao atualizar bônus:", error.message);
      toast.error("Erro ao atualizar bônus: " + error.message);
    },
  });

  // Finalize mutation
  const finalizeMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: FinalizeReason }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      const updateData = {
        status: "finalized",
        finalized_at: new Date().toISOString(),
        finalized_by: userData.user.id,
        finalize_reason: reason,
      };

      const { error } = await supabase
        .from("project_bookmaker_link_bonuses")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
      return reason;
    },
    onSuccess: (reason) => {
      const reasonLabels: Record<FinalizeReason, string> = {
        rollover_completed: "Rollover concluído (saque liberado)",
        cycle_completed: "Bônus utilizado / ciclo encerrado",
        expired: "Expirado",
        cancelled_reversed: "Cancelado / Revertido",
      };
      toast.success(`Bônus finalizado: ${reasonLabels[reason]}`);
      invalidateBonusQueries(projectId);
    },
    onError: (error: Error) => {
      console.error("Erro ao finalizar bônus:", error.message);
      toast.error("Erro ao finalizar bônus: " + error.message);
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("project_bookmaker_link_bonuses")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bônus excluído com sucesso");
      invalidateBonusQueries(projectId);
    },
    onError: (error: Error) => {
      console.error("Erro ao excluir bônus:", error.message);
      toast.error("Erro ao excluir bônus: " + error.message);
    },
  });

  // Update rollover progress mutation
  const updateRolloverMutation = useMutation({
    mutationFn: async ({ id, progress }: { id: string; progress: number }) => {
      const { error } = await supabase
        .from("project_bookmaker_link_bonuses")
        .update({ rollover_progress: progress })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Progresso de rollover atualizado");
      invalidateBonusQueries(projectId);
    },
    onError: (error: Error) => {
      console.error("Erro ao atualizar progresso:", error.message);
      toast.error("Erro ao atualizar progresso: " + error.message);
    },
  });

  const createBonus = async (data: BonusFormData): Promise<boolean> => {
    try {
      await createMutation.mutateAsync(data);
      return true;
    } catch {
      return false;
    }
  };

  const updateBonus = async (id: string, data: Partial<BonusFormData>): Promise<boolean> => {
    try {
      await updateMutation.mutateAsync({ id, data });
      return true;
    } catch {
      return false;
    }
  };

  const finalizeBonus = async (id: string, reason: FinalizeReason): Promise<boolean> => {
    try {
      await finalizeMutation.mutateAsync({ id, reason });
      return true;
    } catch {
      return false;
    }
  };

  const deleteBonus = async (id: string): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  };

  const updateRolloverProgress = async (id: string, progress: number): Promise<boolean> => {
    try {
      await updateRolloverMutation.mutateAsync({ id, progress });
      return true;
    } catch {
      return false;
    }
  };

  const getBonusesByBookmaker = useCallback((bkId: string): ProjectBonus[] => {
    return bonuses.filter((b) => b.bookmaker_id === bkId);
  }, [bonuses]);

  const getTotalCreditedByBookmaker = useCallback((bkId: string): number => {
    return bonuses
      .filter((b) => b.bookmaker_id === bkId && b.status === "credited")
      .reduce((acc, b) => acc + b.bonus_amount, 0);
  }, [bonuses]);

  const getRolloverPercentage = useCallback((bonus: ProjectBonus): number => {
    if (!bonus.rollover_target_amount || bonus.rollover_target_amount <= 0) return 0;
    const progress = bonus.rollover_progress || 0;
    return Math.min(100, (progress / bonus.rollover_target_amount) * 100);
  }, []);

  const saving = createMutation.isPending || updateMutation.isPending || finalizeMutation.isPending || deleteMutation.isPending || updateRolloverMutation.isPending;

  return {
    bonuses,
    loading,
    saving,
    fetchBonuses,
    getSummary,
    createBonus,
    updateBonus,
    finalizeBonus,
    deleteBonus,
    getBonusesByBookmaker,
    getTotalCreditedByBookmaker,
    getActiveBonusByBookmaker,
    getBookmakersWithActiveBonus,
    getActiveBonusId,
   getBookmakersWithAnyBonus,
    updateRolloverProgress,
    getRolloverPercentage,
  };
}
