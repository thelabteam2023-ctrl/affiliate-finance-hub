import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

// ──────────────────────── TIPOS ────────────────────────

export interface PlanningIp {
  id: string;
  workspace_id: string;
  bookmaker_catalogo_id: string | null;
  perfil_planejamento_id: string | null;
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

export interface PlanningPerfil {
  id: string;
  workspace_id: string;
  parceiro_id: string | null;
  label_custom: string | null;
  nome_generico: string | null;
  cor: string;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  parceiro?: ParceiroLite | null;
}

/** Paleta padrão para perfis genéricos — cores HSL que funcionam em dark mode */
export const PERFIL_CORES: string[] = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#8b5cf6", // violet
  "#ef4444", // red
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
  "#3b82f6", // blue
  "#a855f7", // purple
];

export function pickPerfilCor(index: number): string {
  return PERFIL_CORES[index % PERFIL_CORES.length];
}

/** Nome de exibição de um perfil — prioriza label_custom > parceiro.nome > nome_generico */
export function perfilDisplayName(p: Pick<PlanningPerfil, "label_custom" | "nome_generico"> & { parceiro?: { nome: string } | null }): string {
  return p.label_custom?.trim() || p.parceiro?.nome || p.nome_generico || "—";
}

export function getPerfilCpfSlot(p: Pick<PlanningPerfil, "nome_generico" | "label_custom">): number | null {
  const source = `${p.nome_generico ?? ""} ${p.label_custom ?? ""}`;
  const match = source.match(/CPF\s*#?\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function orderPlanningPerfis<T extends Pick<PlanningPerfil, "id" | "nome_generico" | "label_custom" | "created_at">>(perfis: T[]): T[] {
  const explicitSlots = new Map<string, number>();
  const usedSlots = new Set<number>();
  perfis.forEach((p) => {
    const slot = getPerfilCpfSlot(p);
    if (slot && slot > 0) {
      explicitSlots.set(p.id, slot);
      usedSlots.add(slot);
    }
  });

  const fallbackSlots = new Map<string, number>();
  let cursor = 1;
  [...perfis]
    .filter((p) => !explicitSlots.has(p.id))
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))
    .forEach((p) => {
      while (usedSlots.has(cursor)) cursor += 1;
      fallbackSlots.set(p.id, cursor);
      usedSlots.add(cursor);
    });

  return [...perfis].sort((a, b) => {
    const slotA = explicitSlots.get(a.id) ?? fallbackSlots.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const slotB = explicitSlots.get(b.id) ?? fallbackSlots.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (slotA !== slotB) return slotA - slotB;
    return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  });
}

export function planningPerfilCpfIndex(perfis: Pick<PlanningPerfil, "id" | "nome_generico" | "label_custom" | "created_at">[], perfilId: string): number | null {
  const idx = orderPlanningPerfis(perfis).findIndex((p) => p.id === perfilId);
  return idx >= 0 ? idx + 1 : null;
}

export interface BookmakerCatalogo {
  id: string;
  nome: string;
  logo_url: string | null;
  moeda_padrao: string;
  status: "REGULAMENTADA" | "NAO_REGULAMENTADA";
  visibility: "WORKSPACE_PRIVATE" | "GLOBAL_REGULATED" | "GLOBAL_RESTRICTED";
}

export interface PlanningCasa {
  id: string;
  workspace_id: string;
  bookmaker_catalogo_id: string;
  label_custom: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // joined
  casa?: BookmakerCatalogo | null;
}

export interface PlanningCasaPermitidaPerfil {
  id: string;
  workspace_id: string;
  perfil_planejamento_id: string | null;
  parceiro_id: string | null;
  bookmaker_catalogo_id: string;
  ordem: number;
  casa?: Pick<BookmakerCatalogo, "id" | "nome" | "logo_url" | "moeda_padrao" | "status"> | null;
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
        .neq("is_caixa_operacional", true)
        .order("nome");
      if (error) throw error;
      return (data ?? []) as ParceiroLite[];
    },
  });
}

// Lista de perfis pré-selecionados pelo workspace para uso no planejamento
export function usePlanningPerfis() {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: ["planning-perfis", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planning_perfis" as any)
        .select("id, workspace_id, parceiro_id, label_custom, nome_generico, cor, is_active, notes, created_at, updated_at, parceiro:parceiros(id, nome, email, endereco, cidade)")
        .eq("workspace_id", workspaceId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as PlanningPerfil[];
    },
  });
}

export function useAddPlanningPerfis() {
  const qc = useQueryClient();
  const { workspaceId, user } = useAuth();
  return useMutation({
    mutationFn: async (parceiroIds: string[]) => {
      if (!workspaceId || !user) throw new Error("Sem workspace");
      if (parceiroIds.length === 0) return;
      const rows = parceiroIds.map(pid => ({
        workspace_id: workspaceId,
        parceiro_id: pid,
        created_by: user.id,
        is_active: true,
      }));
      const { error } = await supabase
        .from("planning_perfis" as any)
        .upsert(rows, { onConflict: "workspace_id,parceiro_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-perfis"] });
      toast.success("Perfis adicionados");
    },
    onError: (e: any) => toast.error("Erro ao adicionar perfis", { description: e.message }),
  });
}

export function useUpdatePlanningPerfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: string;
      label_custom?: string | null;
      is_active?: boolean;
      notes?: string | null;
      cor?: string;
      nome_generico?: string | null;
      parceiro_id?: string | null;
    }) => {
      const update: any = {};
      if (payload.label_custom !== undefined) update.label_custom = payload.label_custom;
      if (payload.is_active !== undefined) update.is_active = payload.is_active;
      if (payload.notes !== undefined) update.notes = payload.notes;
      if (payload.cor !== undefined) update.cor = payload.cor;
      if (payload.nome_generico !== undefined) update.nome_generico = payload.nome_generico;
      if (payload.parceiro_id !== undefined) update.parceiro_id = payload.parceiro_id;
      const { error } = await supabase.from("planning_perfis" as any).update(update).eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-perfis"] });
    },
    onError: (e: any) => toast.error("Erro ao atualizar perfil", { description: e.message }),
  });
}

/** Cria N perfis genéricos (sem parceiro real) com nomes "CPF #N" e cores rotativas */
export function useAddPlanningPerfisGenericos() {
  const qc = useQueryClient();
  const { workspaceId, user } = useAuth();
  return useMutation({
    mutationFn: async (params: { quantidade: number; prefixo?: string }) => {
      if (!workspaceId || !user) throw new Error("Sem workspace");
      const qtd = Math.max(1, Math.min(50, Math.floor(params.quantidade)));

      // Descobre o próximo índice numérico para evitar duplicar nomes
      const { data: existentes } = await supabase
        .from("planning_perfis" as any)
        .select("nome_generico, cor")
        .eq("workspace_id", workspaceId);
      const usedNumbers = new Set<number>();
      const existentesArr = ((existentes ?? []) as unknown) as Array<{ nome_generico: string | null; cor: string | null }>;
      const prefixo = (params.prefixo ?? "CPF").trim() || "CPF";
      const re = new RegExp(`^${prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*#(\\d+)$`, "i");
      existentesArr.forEach((p) => {
        const m = p.nome_generico?.match(re);
        if (m) usedNumbers.add(Number(m[1]));
      });

      const rows: any[] = [];
      const totalExistentes = existentesArr.length;
      let cursor = 1;
      for (let i = 0; i < qtd; i++) {
        while (usedNumbers.has(cursor)) cursor++;
        rows.push({
          workspace_id: workspaceId,
          parceiro_id: null,
          nome_generico: `${prefixo} #${cursor}`,
          cor: pickPerfilCor(totalExistentes + i),
          created_by: user.id,
          is_active: true,
        });
        usedNumbers.add(cursor);
      }

      const { error } = await supabase.from("planning_perfis" as any).insert(rows);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["planning-perfis"] });
      toast.success(`${vars.quantidade} perfil(is) criado(s)`);
    },
    onError: (e: any) => toast.error("Erro ao criar perfis", { description: e.message }),
  });
}

export function useDeletePlanningPerfil() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planning_perfis" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-perfis"] });
      toast.success("Perfil removido da lista");
    },
  });
}

export function useBookmakersCatalogo() {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: ["planning-bookmakers-catalogo", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      // RLS já filtra por workspace (GLOBAL_REGULATED visível a todos +
      // WORKSPACE_PRIVATE/GLOBAL_RESTRICTED via bookmaker_workspace_access).
      const { data, error } = await supabase
        .from("bookmakers_catalogo")
        .select("id, nome, logo_url, moeda_padrao, status, visibility")
        .in("status", ["REGULAMENTADA", "NAO_REGULAMENTADA"])
        .order("nome");
      if (error) throw error;
      return (data ?? []) as BookmakerCatalogo[];
    },
  });
}

// Mutations para casas privadas do workspace (visibility = WORKSPACE_PRIVATE)
export function useUpsertWorkspaceBookmaker() {
  const qc = useQueryClient();
  const { workspaceId, user } = useAuth();
  return useMutation({
    mutationFn: async (payload: {
      id?: string;
      nome: string;
      status: "REGULAMENTADA" | "NAO_REGULAMENTADA";
      moeda_padrao: string;
      logo_url?: string | null;
    }) => {
      if (!workspaceId || !user) throw new Error("Sem workspace");
      if (payload.id) {
        const { error } = await supabase
          .from("bookmakers_catalogo")
          .update({
            nome: payload.nome,
            status: payload.status,
            moeda_padrao: payload.moeda_padrao,
            logo_url: payload.logo_url ?? null,
          })
          .eq("id", payload.id);
        if (error) throw error;
      } else {
        // Cria a casa como WORKSPACE_PRIVATE e concede acesso ao workspace atual
        const { data: created, error } = await supabase
          .from("bookmakers_catalogo")
          .insert({
            nome: payload.nome,
            status: payload.status,
            moeda_padrao: payload.moeda_padrao,
            logo_url: payload.logo_url ?? null,
            visibility: "WORKSPACE_PRIVATE",
            user_id: user.id,
            operacional: "ATIVA",
          })
          .select("id")
          .single();
        if (error) throw error;
        // Garante acesso explícito do workspace
        await supabase.from("bookmaker_workspace_access").insert({
          bookmaker_catalogo_id: (created as any).id,
          workspace_id: workspaceId,
          granted_by: user.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-bookmakers-catalogo"] });
      qc.invalidateQueries({ queryKey: ["workspace-bookmakers-catalog"] });
      toast.success("Casa salva");
    },
    onError: (e: any) => toast.error("Erro ao salvar casa", { description: e.message }),
  });
}

export function useDeleteWorkspaceBookmaker() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      // Apenas casas WORKSPACE_PRIVATE deste workspace podem ser deletadas (RLS protege).
      const { error } = await supabase.from("bookmakers_catalogo").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-bookmakers-catalogo"] });
      qc.invalidateQueries({ queryKey: ["workspace-bookmakers-catalog"] });
      toast.success("Casa removida");
    },
    onError: (e: any) => toast.error("Erro ao remover", { description: e.message }),
  });
}

// ─────────── Lista pré-selecionada de casas para o Planejamento ───────────

export function usePlanningCasas() {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: ["planning-casas", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("planning_casas" as any)
        .select("id, workspace_id, bookmaker_catalogo_id, label_custom, is_active, notes, created_at, updated_at, casa:bookmakers_catalogo(id, nome, logo_url, moeda_padrao, status, visibility)")
        .eq("workspace_id", workspaceId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as PlanningCasa[];
    },
  });
}

export function usePlanningCasasPermitidasPorPerfil() {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: ["planning-casas-permitidas-perfil", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("distribuicao_plano_celulas")
        .select("id, workspace_id, perfil_planejamento_id, parceiro_id, bookmaker_catalogo_id, ordem, casa:bookmakers_catalogo(id, nome, logo_url, moeda_padrao, status)")
        .eq("workspace_id", workspaceId!)
        .order("ordem");
      if (error) throw error;
      return (data ?? []) as unknown as PlanningCasaPermitidaPerfil[];
    },
    staleTime: 15_000,
  });
}

export function useAddPlanningCasas() {
  const qc = useQueryClient();
  const { workspaceId, user } = useAuth();
  return useMutation({
    mutationFn: async (bookmakerIds: string[]) => {
      if (!workspaceId || !user) throw new Error("Sem workspace");
      if (bookmakerIds.length === 0) return;
      const rows = bookmakerIds.map(bid => ({
        workspace_id: workspaceId,
        bookmaker_catalogo_id: bid,
        created_by: user.id,
        is_active: true,
      }));
      const { error } = await supabase
        .from("planning_casas" as any)
        .upsert(rows, { onConflict: "workspace_id,bookmaker_catalogo_id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-casas"] });
      toast.success("Casas adicionadas");
    },
    onError: (e: any) => toast.error("Erro ao adicionar casas", { description: e.message }),
  });
}

export function useUpdatePlanningCasa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: string; label_custom?: string | null; is_active?: boolean; notes?: string | null }) => {
      const update: any = {};
      if (payload.label_custom !== undefined) update.label_custom = payload.label_custom;
      if (payload.is_active !== undefined) update.is_active = payload.is_active;
      if (payload.notes !== undefined) update.notes = payload.notes;
      const { error } = await supabase.from("planning_casas" as any).update(update).eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-casas"] });
    },
    onError: (e: any) => toast.error("Erro ao atualizar casa", { description: e.message }),
  });
}

export function useDeletePlanningCasa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planning_casas" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-casas"] });
      toast.success("Casa removida da lista");
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
        bookmaker_catalogo_id: payload.bookmaker_catalogo_id ?? null,
        perfil_planejamento_id: payload.perfil_planejamento_id ?? null,
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
      const base: any = {
        workspace_id: workspaceId,
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

        // Sincroniza a célula do assistente de plano vinculada a esta campanha.
        // Se a casa/perfil for alterada manualmente pelo calendário, o plano deixa
        // de apontar para a casa antiga e passa a representar a substituição real.
        const celulaUpdate: any = {
          bookmaker_catalogo_id: base.bookmaker_catalogo_id,
          parceiro_id: base.parceiro_id,
        };
        const { error: celulaError } = await (supabase as any)
          .from("distribuicao_plano_celulas")
          .update(celulaUpdate)
          .eq("workspace_id", workspaceId)
          .eq("campanha_id", payload.id);
        if (celulaError) throw celulaError;

        return payload.id;
      } else {
        const { data, error } = await supabase
          .from("planning_campanhas" as any)
          .insert({ ...base, created_by: user.id })
          .select("id")
          .single();
        if (error) throw error;
        return (data as any).id;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["planning-campanhas"] });
      qc.invalidateQueries({ queryKey: ["plano-celulas-disponiveis"] });
      qc.invalidateQueries({ queryKey: ["plano-celulas-agendadas"] });
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
