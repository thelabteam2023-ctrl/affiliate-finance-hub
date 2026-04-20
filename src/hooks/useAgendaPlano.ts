import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { gerarAgenda, AgendaItem, CelulaParaAgendar } from "@/lib/agenda-engine";

const KEY = "distribuicao-plano-agenda";

export interface AgendaRow {
  id: string;
  workspace_id: string;
  plano_id: string;
  celula_id: string;
  scheduled_date: string;
  ordem_dia: number;
  status: string;
}

export function useAgendaPlano(planoId: string | null) {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: [KEY, planoId, workspaceId],
    queryFn: async (): Promise<AgendaRow[]> => {
      if (!planoId || !workspaceId) return [];
      const { data, error } = await (supabase as any)
        .from("distribuicao_plano_agenda")
        .select("*")
        .eq("plano_id", planoId)
        .eq("workspace_id", workspaceId)
        .order("scheduled_date")
        .order("ordem_dia");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!planoId && !!workspaceId,
    staleTime: 30_000,
  });
}

export function useGerarAgendaMutation() {
  const { workspaceId } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      planoId: string;
      celulas: CelulaParaAgendar[];
      startDate: string;
      metaDiariaUsd: number | null;
      toUsd: (valor: number, moeda: string) => number;
    }) => {
      if (!workspaceId) throw new Error("Workspace não encontrado");

      const result = gerarAgenda(params.celulas, {
        startDate: params.startDate,
        metaDiariaUsd: params.metaDiariaUsd,
        toUsd: params.toUsd,
      });

      // limpa agenda anterior do plano
      const { error: delErr } = await (supabase as any)
        .from("distribuicao_plano_agenda")
        .delete()
        .eq("plano_id", params.planoId)
        .eq("workspace_id", workspaceId);
      if (delErr) throw delErr;

      if (result.agenda.length > 0) {
        const rows = result.agenda.map((a: AgendaItem) => ({
          workspace_id: workspaceId,
          plano_id: params.planoId,
          celula_id: a.celula_id,
          scheduled_date: a.scheduled_date,
          ordem_dia: a.ordem_dia,
          status: "pendente",
        }));
        const { error: insErr } = await (supabase as any)
          .from("distribuicao_plano_agenda")
          .insert(rows);
        if (insErr) throw insErr;
      }

      return result;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: [KEY] });
      const msgs = [
        `${result.agenda.length} depósitos agendados`,
        result.backlog.length > 0 && `${result.backlog.length} no backlog (sob demanda)`,
      ].filter(Boolean);
      toast.success(msgs.join(" • "));
      if (result.warnings.length > 0) {
        toast.warning(result.warnings[0]);
      }
    },
    onError: (e: any) => toast.error(e.message || "Erro ao gerar agenda"),
  });
}
