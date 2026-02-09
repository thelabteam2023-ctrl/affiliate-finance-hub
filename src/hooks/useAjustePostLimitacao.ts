/**
 * Hook para verificar elegibilidade e registrar Ajuste Pós-Limitação em vínculos.
 * 
 * Regras:
 * - Só disponível para vínculos com status "limitada"
 * - Só se a bookmaker já teve bônus em algum momento (project_bookmaker_link_bonuses)
 * - Só se ainda não foi registrado um ajuste pós-limitação (financial_events com metadata)
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

interface AjusteEligibility {
  bookmaker_id: string;
  eligible: boolean;
  had_bonus: boolean;
  already_registered: boolean;
}

/**
 * Verifica quais vínculos limitados são elegíveis para ajuste pós-limitação.
 * Retorna um Map de bookmaker_id -> eligibility.
 */
export function useAjustePostLimitacaoEligibility(
  projetoId: string | undefined,
  limitedBookmakerIds: string[]
) {
  return useQuery({
    queryKey: ["ajuste-pos-limitacao-eligibility", projetoId, limitedBookmakerIds],
    queryFn: async (): Promise<Record<string, AjusteEligibility>> => {
      if (!projetoId || limitedBookmakerIds.length === 0) return {};

      // 1. Check which bookmakers ever had a bonus in this project
      const { data: bonusData } = await supabase
        .from("project_bookmaker_link_bonuses")
        .select("bookmaker_id")
        .eq("project_id", projetoId)
        .in("bookmaker_id", limitedBookmakerIds);

      const hadBonusSet = new Set((bonusData || []).map((b: any) => b.bookmaker_id));

      // 2. Check which bookmakers already have an ajuste pós-limitação registered
      // We look for financial_events with metadata containing tipo_ajuste = AJUSTE_POS_LIMITACAO
      const { data: existingAjustes } = await supabase
        .from("financial_events")
        .select("bookmaker_id, metadata")
        .in("bookmaker_id", limitedBookmakerIds)
        .eq("tipo_evento", "AJUSTE")
        .not("metadata", "is", null);

      const alreadyRegisteredSet = new Set<string>();
      (existingAjustes || []).forEach((evt: any) => {
        try {
          const meta = typeof evt.metadata === "string" ? JSON.parse(evt.metadata) : evt.metadata;
          if (meta?.tipo_ajuste === "AJUSTE_POS_LIMITACAO") {
            alreadyRegisteredSet.add(evt.bookmaker_id);
          }
        } catch {
          // ignore parse errors
        }
      });

      // 3. Build eligibility map
      const result: Record<string, AjusteEligibility> = {};
      for (const id of limitedBookmakerIds) {
        const hadBonus = hadBonusSet.has(id);
        const alreadyRegistered = alreadyRegisteredSet.has(id);
        result[id] = {
          bookmaker_id: id,
          eligible: hadBonus && !alreadyRegistered,
          had_bonus: hadBonus,
          already_registered: alreadyRegistered,
        };
      }

      return result;
    },
    enabled: !!projetoId && limitedBookmakerIds.length > 0,
    staleTime: 30 * 1000,
  });
}

interface RegistrarAjusteParams {
  bookmakerId: string;
  bookmakerNome: string;
  moeda: string;
  saldoLimitacao: number;
  saldoFinal: number;
  dataAjuste: string; // YYYY-MM-DD
  workspaceId: string;
}

/**
 * Mutation para registrar o ajuste pós-limitação como financial_event.
 */
export function useRegistrarAjustePostLimitacao(projetoId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: RegistrarAjusteParams) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const ajuste = params.saldoFinal - params.saldoLimitacao;
      if (ajuste === 0) throw new Error("Ajuste não pode ser zero");

      const idempotencyKey = `ajuste_pos_limitacao_${params.bookmakerId}_${Date.now()}`;

      const metadata: Record<string, Json> = {
        tipo_ajuste: "AJUSTE_POS_LIMITACAO" as Json,
        saldo_no_momento_limitacao: params.saldoLimitacao as unknown as Json,
        saldo_final: params.saldoFinal as unknown as Json,
        data_encerramento: params.dataAjuste as Json,
        bookmaker_nome: params.bookmakerNome as Json,
        projeto_id: projetoId as Json,
        motivo: "Ajuste pós-limitação de conta com histórico de bônus" as Json,
      };

      const { error } = await supabase.from("financial_events").insert({
        bookmaker_id: params.bookmakerId,
        workspace_id: params.workspaceId,
        tipo_evento: "AJUSTE",
        tipo_uso: "NORMAL",
        origem: "AJUSTE",
        valor: ajuste,
        moeda: params.moeda,
        idempotency_key: idempotencyKey,
        descricao: `Ajuste pós-limitação: ${ajuste > 0 ? "lucro" : "perda"} de ${Math.abs(ajuste).toFixed(2)} ${params.moeda}`,
        metadata: metadata as unknown as Json,
        created_by: user.id,
      });

      if (error) throw error;
      return { ajuste, moeda: params.moeda };
    },
    onSuccess: ({ ajuste, moeda }) => {
      toast.success(
        `Ajuste pós-limitação registrado: ${ajuste > 0 ? "+" : ""}${ajuste.toFixed(2)} ${moeda}`
      );
      // Invalidate eligibility + saldos + KPIs + bonus performance
      queryClient.invalidateQueries({ queryKey: ["ajuste-pos-limitacao-eligibility"] });
      queryClient.invalidateQueries({ queryKey: ["projeto-vinculos", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["bookmaker-saldos", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["saldo-operavel-rpc", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["projeto-resultado", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["projeto-breakdowns", projetoId] });
      queryClient.invalidateQueries({ queryKey: ["bonus-ajustes-pos-limitacao"] });
      queryClient.invalidateQueries({ queryKey: ["bonus-bets-summary"] });
      queryClient.invalidateQueries({ queryKey: ["bonus-bets-juice"] });
    },
    onError: (error: any) => {
      toast.error("Erro ao registrar ajuste: " + error.message);
    },
  });
}
