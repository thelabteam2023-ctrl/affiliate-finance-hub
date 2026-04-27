import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Célula da distribuição com dados úteis para arrastar para o calendário.
 * Trazemos info do catálogo (nome/logo/moeda) e do membro do grupo (depósito sugerido)
 * para que o item da sidebar já carregue tudo que o calendário precisa.
 */
export interface CelulaDisponivel {
  id: string; // celula_id
  plano_id: string;
  plano_grupo_id: string;
  bookmaker_catalogo_id: string;
  parceiro_id: string | null;
  perfil_planejamento_id: string | null;
  ip_slot: string | null;
  ordem: number;
  agendada_em: string | null;
  campanha_id: string | null;
  // joined
  bookmaker_nome: string;
  bookmaker_logo: string | null;
  moeda: string;
  deposito_sugerido: number;
  grupo_id: string;
  grupo_nome: string;
  grupo_cor: string;
  // Índice do CPF dentro do grupo do plano (1-based) — "CPF 1", "CPF 2"...
  cpf_index: number | null;
}

/**
 * Lista as células de um plano de distribuição enriquecidas com:
 *  - nome/logo/moeda da casa
 *  - depósito sugerido configurado no grupo
 *  - dados do grupo
 *
 * Use no calendário (sidebar "Casas disponíveis") para deixar o usuário arrastar
 * a célula exata (já com CPF + casa + grupo) para o dia desejado.
 */
export function usePlanoCelulasDisponiveis(planoId: string | null) {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: ["plano-celulas-disponiveis", planoId, workspaceId],
    queryFn: async (): Promise<CelulaDisponivel[]> => {
      if (!planoId || !workspaceId) return [];

      // 0) plano (precisamos do parceiro_ids para ordenar CPF 1, CPF 2...)
      const { data: plano } = await (supabase as any)
        .from("distribuicao_planos")
        .select("parceiro_ids")
        .eq("id", planoId)
        .maybeSingle();
      const parceiroIdsPlano: string[] = plano?.parceiro_ids ?? [];

      // 1) células do plano
      const { data: celulas, error: cErr } = await (supabase as any)
        .from("distribuicao_plano_celulas")
        .select("*")
        .eq("plano_id", planoId)
        .eq("workspace_id", workspaceId)
        .order("ordem");
      if (cErr) throw cErr;
      if (!celulas?.length) return [];

      // 2) grupos do plano (para mapear plano_grupo_id -> grupo_id real + casas_por_cpf)
      const { data: planoGrupos } = await (supabase as any)
        .from("distribuicao_plano_grupos")
        .select("id, grupo_id, casas_por_cpf")
        .eq("plano_id", planoId);
      const planoGrupoMap = new Map<string, string>();
      const planoGrupoCasasPorCpfMap = new Map<string, number | null>();
      (planoGrupos ?? []).forEach((pg: any) => {
        planoGrupoMap.set(pg.id, pg.grupo_id);
        planoGrupoCasasPorCpfMap.set(pg.id, pg.casas_por_cpf ?? null);
      });

      const grupoIds = Array.from(new Set(planoGrupoMap.values()));
      const catalogoIds = Array.from(
        new Set(celulas.map((c: any) => c.bookmaker_catalogo_id as string))
      );

      // 3) catálogo + grupos + membros (depósito sugerido)
      const [catRes, gruposRes, membrosRes] = await Promise.all([
        supabase
          .from("bookmakers_catalogo")
          .select("id, nome, logo_url, moeda_padrao")
          .in("id", catalogoIds as string[]),
        (supabase as any)
          .from("bookmaker_grupos")
          .select("id, nome, cor")
          .in("id", grupoIds.length ? grupoIds : ["00000000-0000-0000-0000-000000000000"]),
        (supabase as any)
          .from("bookmaker_grupo_membros")
          .select("grupo_id, bookmaker_catalogo_id, deposito_sugerido, deposito_moeda")
          .in("grupo_id", grupoIds.length ? grupoIds : ["00000000-0000-0000-0000-000000000000"]),
      ]);

      const catMap = new Map<string, any>();
      (catRes.data ?? []).forEach((c: any) => catMap.set(c.id, c));

      const grupoMap = new Map<string, any>();
      (gruposRes.data ?? []).forEach((g: any) => grupoMap.set(g.id, g));

      const membroMap = new Map<string, { sugerido: number; moeda: string | null }>();
      (membrosRes.data ?? []).forEach((m: any) =>
        membroMap.set(`${m.grupo_id}::${m.bookmaker_catalogo_id}`, {
          sugerido: Number(m.deposito_sugerido) || 0,
          moeda: m.deposito_moeda,
        })
      );

      // Calcula índice do CPF dentro de cada plano_grupo.
      // Planos com perfis genéricos não têm parceiro_id; nesses casos o dono real
      // da célula é perfil_planejamento_id. Antes isso fazia tudo cair como CPF 1.
      const ownerKey = (c: any) => c.perfil_planejamento_id ?? c.parceiro_id ?? null;

      const ownerPlanoIndex = new Map<string, number>();
      parceiroIdsPlano.forEach((pid, idx) => ownerPlanoIndex.set(pid, idx + 1));
      [...celulas]
        .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .forEach((c: any) => {
          const owner = ownerKey(c);
          if (owner && !ownerPlanoIndex.has(owner)) {
            ownerPlanoIndex.set(owner, ownerPlanoIndex.size + 1);
          }
        });

      const cpfIndexFallbackMap = new Map<string, number>(); // key: celula.id -> idx
      const celulasPorGrupo = new Map<string, any[]>();
      [...celulas]
        .sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0))
        .forEach((c: any) => {
          const arr = celulasPorGrupo.get(c.plano_grupo_id) ?? [];
          arr.push(c);
          celulasPorGrupo.set(c.plano_grupo_id, arr);
        });

      celulasPorGrupo.forEach((cells, planoGrupoId) => {
        const casasPorCpf = planoGrupoCasasPorCpfMap.get(planoGrupoId);
        const seenOwners = new Map<string, number>();
        let counter = 0;
        cells.forEach((c: any, idx: number) => {
          let cpfIdx: number;
          const owner = ownerKey(c);
          if (owner) {
            const fromPlano = ownerPlanoIndex.get(owner);
            if (fromPlano) {
              cpfIdx = fromPlano;
            } else if (seenOwners.has(owner)) {
              cpfIdx = seenOwners.get(owner)!;
            } else {
              counter += 1;
              seenOwners.set(owner, counter);
              cpfIdx = counter;
            }
          } else if (casasPorCpf && casasPorCpf > 0) {
            cpfIdx = Math.floor(idx / casasPorCpf) + 1;
          } else {
            const nCpfs = ownerPlanoIndex.size || 1;
            const porCpf = Math.max(1, Math.ceil(cells.length / nCpfs));
            cpfIdx = Math.floor(idx / porCpf) + 1;
          }
          cpfIndexFallbackMap.set(c.id, cpfIdx);
        });
      });

      return celulas.map((c: any) => {
        const grupoId = planoGrupoMap.get(c.plano_grupo_id) ?? "";
        const cat = catMap.get(c.bookmaker_catalogo_id);
        const grp = grupoMap.get(grupoId);
        const memb = membroMap.get(`${grupoId}::${c.bookmaker_catalogo_id}`);
        const cpfIndex = cpfIndexFallbackMap.get(c.id) ?? null;
        return {
          id: c.id,
          plano_id: c.plano_id,
          plano_grupo_id: c.plano_grupo_id,
          bookmaker_catalogo_id: c.bookmaker_catalogo_id,
          parceiro_id: c.parceiro_id,
          perfil_planejamento_id: c.perfil_planejamento_id,
          ip_slot: c.ip_slot,
          ordem: c.ordem,
          agendada_em: c.agendada_em ?? null,
          campanha_id: c.campanha_id ?? null,
          bookmaker_nome: cat?.nome ?? "—",
          bookmaker_logo: cat?.logo_url ?? null,
          moeda: memb?.moeda || cat?.moeda_padrao || "BRL",
          deposito_sugerido: memb?.sugerido ?? 0,
          grupo_id: grupoId,
          grupo_nome: grp?.nome ?? "Grupo",
          grupo_cor: grp?.cor ?? "#6366f1",
          cpf_index: cpfIndex,
        } as CelulaDisponivel;
      });
    },
    enabled: !!planoId && !!workspaceId,
    staleTime: 15_000,
  });
}

/**
 * Marca uma célula como agendada vinculando-a à campanha criada no calendário.
 */
export async function marcarCelulaAgendada(celulaId: string, campanhaId: string) {
  const { error } = await (supabase as any)
    .from("distribuicao_plano_celulas")
    .update({ agendada_em: new Date().toISOString(), campanha_id: campanhaId })
    .eq("id", celulaId);
  if (error) throw error;
}

/**
 * Remove a marcação de agendada (ex: quando a campanha é apagada).
 */
export async function desmarcarCelulaAgendada(celulaId: string) {
  const { error } = await (supabase as any)
    .from("distribuicao_plano_celulas")
    .update({ agendada_em: null, campanha_id: null })
    .eq("id", celulaId);
  if (error) throw error;
}
