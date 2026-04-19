import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

// ──────────────────────── TIPOS ────────────────────────

export interface PlanningIp {
  id: string;
  workspace_id: string;
  label: string;
  ip_address: string;
  proxy_type: string | null;
  location_country: string | null;
  location_city: string | null;
  provider: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlanningWallet {
  id: string;
  workspace_id: string;
  label: string;
  asset: string;
  network: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PlanningCampanha {
  id: string;
  workspace_id: string;
  scheduled_date: string; // YYYY-MM-DD
  bookmaker_catalogo_id: string | null;
  bookmaker_nome: string;
  deposit_amount: number;
  currency: string;
  parceiro_id: string | null;
  parceiro_snapshot: any | null;
  ip_id: string | null;
  wallet_id: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ParceiroLite {
  id: string;
  nome: string;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
}

export interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  moeda_padrao: string;
}

// ──────────────────────── QUERIES ────────────────────────

export function usePlanningIps() {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: ["planning-ips", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planning_ips" as any)
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("label");
      if (error) throw error;
      return (data ?? []) as unknown as PlanningIp[];
    },
  });
}

export function usePlanningWallets() {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: ["planning-wallets", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planning_wallets" as any)
        .select("*")
        .eq("workspace_id", workspaceId!)
        .order("label");
      if (error) throw error;
      return (data ?? []) as unknown as PlanningWallet[];
    },
  });
}

export function usePlanningCampanhas(year: number, month: number) {
  const { workspaceId } = useAuth();
  // month: 1-12
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;

  return useQuery({
    queryKey: ["planning-campanhas", workspaceId, year, month],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planning_campanhas" as any)
        .select("*")
        .eq("workspace_id", workspaceId!)
        .gte("scheduled_date", start)
        .lte("scheduled_date", end)
        .order("scheduled_date");
      if (error) throw error;
      return (data ?? []) as unknown as PlanningCampanha[];
    },
  });
}

export function useParceirosLite() {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: ["planning-parceiros-lite", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parceiros")
        .select("id, nome, email, endereco, cidade")
        .eq("workspace_id", workspaceId!)
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ParceiroLite[];
    },
  });
}

export function useBookmakersCatalogo() {
  return useQuery({
    queryKey: ["planning-bookmakers-catalogo"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, moeda_padrao")
        .eq("status", "ativo")
        .order("nome");
      if (error) throw error;
      return (data ?? []) as BookmakerCatalogo[];
    },
  });
}

// ──────────────────────── MUTATIONS ────────────────────────

export function useUpsertPlanningIp() {
  const qc = useQueryClient();
  const { workspaceId, user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<PlanningIp> & { id?: string }) => {
      if (!workspaceId || !user) throw new Error("Sem workspace");
      const base = {
        workspace_id: workspaceId,
        created_by: user.id,
        label: payload.label ?? "",
        ip_address: payload.ip_address ?? "",
        proxy_type: payload.proxy_type ?? null,
        location_country: payload.location_country ?? null,
        location_city: payload.location_city ?? null,
        provider: payload.provider ?? null,
        notes: payload.notes ?? null,
        is_active: payload.is_active ?? true,
      };
      if (payload.id) {
        const { error } = await supabase.from("planning_ips" as any).update(base).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("planning_ips" as any).insert(base);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-ips"] });
      toast.success("IP salvo");
    },
    onError: (e: any) => toast.error("Erro ao salvar IP", { description: e.message }),
  });
}

export function useDeletePlanningIp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planning_ips" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-ips"] });
      toast.success("IP removido");
    },
  });
}

export function useUpsertPlanningWallet() {
  const qc = useQueryClient();
  const { workspaceId, user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<PlanningWallet> & { id?: string }) => {
      if (!workspaceId || !user) throw new Error("Sem workspace");
      const base = {
        workspace_id: workspaceId,
        created_by: user.id,
        label: payload.label ?? "",
        asset: payload.asset ?? "",
        network: payload.network ?? null,
        address: payload.address ?? null,
        notes: payload.notes ?? null,
        is_active: payload.is_active ?? true,
      };
      if (payload.id) {
        const { error } = await supabase.from("planning_wallets" as any).update(base).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("planning_wallets" as any).insert(base);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-wallets"] });
      toast.success("Carteira salva");
    },
    onError: (e: any) => toast.error("Erro ao salvar carteira", { description: e.message }),
  });
}

export function useDeletePlanningWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planning_wallets" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-wallets"] });
      toast.success("Carteira removida");
    },
  });
}

export function useUpsertCampanha() {
  const qc = useQueryClient();
  const { workspaceId, user } = useAuth();
  return useMutation({
    mutationFn: async (payload: Partial<PlanningCampanha> & { id?: string }) => {
      if (!workspaceId || !user) throw new Error("Sem workspace");
      const base = {
        workspace_id: workspaceId,
        created_by: user.id,
        scheduled_date: payload.scheduled_date!,
        bookmaker_catalogo_id: payload.bookmaker_catalogo_id ?? null,
        bookmaker_nome: payload.bookmaker_nome ?? "",
        deposit_amount: payload.deposit_amount ?? 0,
        currency: payload.currency ?? "BRL",
        parceiro_id: payload.parceiro_id ?? null,
        parceiro_snapshot: payload.parceiro_snapshot ?? null,
        ip_id: payload.ip_id ?? null,
        wallet_id: payload.wallet_id ?? null,
        status: payload.status ?? "planned",
        notes: payload.notes ?? null,
      };
      if (payload.id) {
        const { error } = await supabase.from("planning_campanhas" as any).update(base).eq("id", payload.id);
        if (error) throw error;
        return payload.id;
      } else {
        const { data, error } = await supabase.from("planning_campanhas" as any).insert(base).select("id").single();
        if (error) throw error;
        return (data as any).id;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-campanhas"] });
    },
    onError: (e: any) => toast.error("Erro ao salvar campanha", { description: e.message }),
  });
}

export function useDeleteCampanha() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planning_campanhas" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-campanhas"] });
      toast.success("Campanha removida");
    },
  });
}
