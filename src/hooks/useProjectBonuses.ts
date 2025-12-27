import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type BonusStatus = "pending" | "credited" | "failed" | "expired" | "reversed" | "finalized";

export type FinalizeReason = "rollover_completed" | "bonus_consumed" | "expired" | "cancelled_reversed";

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

export function useProjectBonuses({ projectId, bookmakerId }: UseProjectBonusesProps) {
  const [bonuses, setBonuses] = useState<ProjectBonus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchBonuses = useCallback(async () => {
    try {
      setLoading(true);

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

      const mapped: ProjectBonus[] = (data || []).map((b: any) => ({
        id: b.id,
        workspace_id: b.workspace_id,
        project_id: b.project_id,
        bookmaker_id: b.bookmaker_id,
        title: b.title,
        bonus_amount: Number(b.bonus_amount),
        saldo_atual: Number(b.saldo_atual || 0), // Saldo atual do bônus
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
        // New fields
        source: (b.source || "manual") as BonusSource,
        template_snapshot: b.template_snapshot as Record<string, unknown> | null,
        rollover_multiplier: b.rollover_multiplier ? Number(b.rollover_multiplier) : null,
        rollover_base: b.rollover_base,
        rollover_target_amount: b.rollover_target_amount ? Number(b.rollover_target_amount) : null,
        rollover_progress: Number(b.rollover_progress || 0),
        deposit_amount: b.deposit_amount ? Number(b.deposit_amount) : null,
        min_odds: b.min_odds ? Number(b.min_odds) : null,
        deadline_days: b.deadline_days ? Number(b.deadline_days) : null,
        // Joined data
        bookmaker_nome: b.bookmakers?.nome,
        bookmaker_login: b.bookmakers?.login_username,
        bookmaker_logo_url: b.bookmakers?.bookmakers_catalogo?.logo_url,
        parceiro_nome: b.bookmakers?.parceiros?.nome,
        bookmaker_catalogo_id: b.bookmakers?.bookmaker_catalogo_id,
        // Campos de snapshot multi-moeda
        cotacao_credito_snapshot: b.cotacao_credito_snapshot ? Number(b.cotacao_credito_snapshot) : null,
        cotacao_credito_at: b.cotacao_credito_at,
        valor_brl_referencia: b.valor_brl_referencia ? Number(b.valor_brl_referencia) : null,
      }));

      setBonuses(mapped);
    } catch (error: any) {
      console.error("Erro ao carregar bônus:", error.message);
      toast.error("Erro ao carregar bônus");
    } finally {
      setLoading(false);
    }
  }, [projectId, bookmakerId]);

  useEffect(() => {
    if (projectId) {
      fetchBonuses();
    }
  }, [fetchBonuses, projectId]);

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
          // Credited = active bonus: use saldo_atual (pode ter sido consumido parcialmente)
          summary.active_bonus_total += b.saldo_atual;
          if (b.saldo_atual > 0) {
            bookmakersWithBonus.add(b.bookmaker_id);
          }
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

  // Get active (credited) bonus saldo_atual for a specific bookmaker
  const getActiveBonusByBookmaker = useCallback((bkId: string): number => {
    return bonuses
      .filter((b) => b.bookmaker_id === bkId && b.status === "credited")
      .reduce((acc, b) => acc + b.saldo_atual, 0); // Usar saldo_atual, não bonus_amount
  }, [bonuses]);

  // Get all bookmaker IDs that have active bonuses with saldo > 0
  const getBookmakersWithActiveBonus = useCallback((): string[] => {
    const ids = new Set<string>();
    bonuses.forEach((b) => {
      if (b.status === "credited" && b.saldo_atual > 0) {
        ids.add(b.bookmaker_id);
      }
    });
    return Array.from(ids);
  }, [bonuses]);

  // Get active bonus ID for a bookmaker (para uso na decomposição de stake)
  const getActiveBonusId = useCallback((bkId: string): string | null => {
    const bonus = bonuses.find((b) => b.bookmaker_id === bkId && b.status === "credited" && b.saldo_atual > 0);
    return bonus?.id || null;
  }, [bonuses]);

  const createBonus = async (data: BonusFormData): Promise<boolean> => {
    try {
      setSaving(true);

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Usuário não autenticado");

      // Get workspace_id from project
      const { data: projectData } = await supabase
        .from("projetos")
        .select("workspace_id")
        .eq("id", projectId)
        .single();

      const bonusData = {
        project_id: projectId,
        bookmaker_id: data.bookmaker_id,
        title: data.title || "",
        bonus_amount: data.bonus_amount,
        saldo_atual: data.status === "credited" ? data.bonus_amount : 0, // Inicializar saldo_atual
        currency: data.currency,
        status: data.status,
        credited_at: data.status === "credited" ? (data.credited_at || new Date().toISOString()) : null,
        expires_at: data.expires_at || null,
        notes: data.notes || null,
        created_by: userData.user.id,
        user_id: userData.user.id,
        workspace_id: projectData?.workspace_id || null,
        // New fields
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

      toast.success("Bônus registrado com sucesso");
      await fetchBonuses();
      return true;
    } catch (error: any) {
      console.error("Erro ao criar bônus:", error.message);
      toast.error("Erro ao registrar bônus: " + error.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const updateBonus = async (id: string, data: Partial<BonusFormData>): Promise<boolean> => {
    try {
      setSaving(true);

      const updateData: any = { ...data };
      
      // If status changed to credited and no credited_at, set it
      if (data.status === "credited" && !data.credited_at) {
        updateData.credited_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("project_bookmaker_link_bonuses")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      toast.success("Bônus atualizado com sucesso");
      await fetchBonuses();
      return true;
    } catch (error: any) {
      console.error("Erro ao atualizar bônus:", error.message);
      toast.error("Erro ao atualizar bônus: " + error.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const finalizeBonus = async (id: string, reason: FinalizeReason): Promise<boolean> => {
    try {
      setSaving(true);

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

      const reasonLabels: Record<FinalizeReason, string> = {
        rollover_completed: "Rollover concluído",
        bonus_consumed: "Bônus consumido/zerado",
        expired: "Expirou",
        cancelled_reversed: "Cancelado/Revertido",
      };

      toast.success(`Bônus finalizado: ${reasonLabels[reason]}`);
      await fetchBonuses();
      return true;
    } catch (error: any) {
      console.error("Erro ao finalizar bônus:", error.message);
      toast.error("Erro ao finalizar bônus: " + error.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteBonus = async (id: string): Promise<boolean> => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from("project_bookmaker_link_bonuses")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Bônus excluído com sucesso");
      await fetchBonuses();
      return true;
    } catch (error: any) {
      console.error("Erro ao excluir bônus:", error.message);
      toast.error("Erro ao excluir bônus: " + error.message);
      return false;
    } finally {
      setSaving(false);
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

  const updateRolloverProgress = async (id: string, progress: number): Promise<boolean> => {
    try {
      setSaving(true);

      const { error } = await supabase
        .from("project_bookmaker_link_bonuses")
        .update({ rollover_progress: progress })
        .eq("id", id);

      if (error) throw error;

      toast.success("Progresso de rollover atualizado");
      await fetchBonuses();
      return true;
    } catch (error: any) {
      console.error("Erro ao atualizar progresso:", error.message);
      toast.error("Erro ao atualizar progresso: " + error.message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Calculate rollover percentage for a bonus
  const getRolloverPercentage = useCallback((bonus: ProjectBonus): number => {
    if (!bonus.rollover_target_amount || bonus.rollover_target_amount <= 0) return 0;
    const progress = bonus.rollover_progress || 0;
    return Math.min(100, (progress / bonus.rollover_target_amount) * 100);
  }, []);

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
    updateRolloverProgress,
    getRolloverPercentage,
  };
}
