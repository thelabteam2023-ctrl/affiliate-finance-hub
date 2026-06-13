import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCotacoes } from "@/hooks/useCotacoes";

export type CapitalDisputaSegmentId = "bookmakers" | "caixa-op" | "wallets" | "contas-parc";

export interface CapitalEmDisputaResult {
  bySegment: Record<CapitalDisputaSegmentId, number>;
  byEntity: {
    bookmaker: Record<string, number>;
    wallet: Record<string, number>;
    conta: Record<string, number>;
  };
  totalBRL: number;
  loading: boolean;
}

const EMPTY: CapitalEmDisputaResult = {
  bySegment: { bookmakers: 0, "caixa-op": 0, wallets: 0, "contas-parc": 0 },
  byEntity: { bookmaker: {}, wallet: {}, conta: {} },
  totalBRL: 0,
  loading: false,
};

export function useCapitalEmDisputa(): CapitalEmDisputaResult {
  const { workspaceId } = useAuth();
  const { convertToBRL } = useCotacoes();

  const query = useQuery({
    queryKey: ["capital-em-disputa", workspaceId],
    enabled: !!workspaceId,
    staleTime: 30_000,
    gcTime: 60_000,
    queryFn: async () => {
      const { data: ocorr, error } = await supabase
        .from("ocorrencias")
        .select("id, valor_risco, moeda, bookmaker_id, wallet_id, conta_bancaria_id")
        .eq("workspace_id", workspaceId!)
        .in("status", ["aberto", "em_andamento"]);

      if (error) throw error;
      const rows = ocorr ?? [];

      // Resolve contas bancárias → parceiro_id (para distinguir Caixa Op vs Contas Parceiros)
      const contaIds = Array.from(
        new Set(rows.map((r: any) => r.conta_bancaria_id).filter(Boolean))
      ) as string[];
      let contaParceiroMap: Record<string, string | null> = {};
      if (contaIds.length > 0) {
        const { data: contas } = await supabase
          .from("contas_bancarias")
          .select("id, parceiro_id")
          .in("id", contaIds);
        (contas ?? []).forEach((c: any) => {
          contaParceiroMap[c.id] = c.parceiro_id ?? null;
        });
      }

      return { rows, contaParceiroMap };
    },
  });

  if (!query.data) {
    return { ...EMPTY, loading: query.isLoading };
  }

  const bySegment: Record<CapitalDisputaSegmentId, number> = {
    bookmakers: 0,
    "caixa-op": 0,
    wallets: 0,
    "contas-parc": 0,
  };
  const byEntity = {
    bookmaker: {} as Record<string, number>,
    wallet: {} as Record<string, number>,
    conta: {} as Record<string, number>,
  };

  for (const r of query.data.rows as any[]) {
    const valor = Number(r.valor_risco ?? 0);
    if (!valor || valor <= 0) continue;
    const moeda = r.moeda || "BRL";
    const brl = convertToBRL(valor, moeda);
    if (!brl || brl <= 0) continue;

    if (r.bookmaker_id) {
      bySegment.bookmakers += brl;
      byEntity.bookmaker[r.bookmaker_id] = (byEntity.bookmaker[r.bookmaker_id] ?? 0) + brl;
    } else if (r.wallet_id) {
      bySegment.wallets += brl;
      byEntity.wallet[r.wallet_id] = (byEntity.wallet[r.wallet_id] ?? 0) + brl;
    } else if (r.conta_bancaria_id) {
      const parceiroId = query.data.contaParceiroMap[r.conta_bancaria_id];
      const seg: CapitalDisputaSegmentId = parceiroId ? "contas-parc" : "caixa-op";
      bySegment[seg] += brl;
      byEntity.conta[r.conta_bancaria_id] = (byEntity.conta[r.conta_bancaria_id] ?? 0) + brl;
    }
  }

  const totalBRL =
    bySegment.bookmakers + bySegment["caixa-op"] + bySegment.wallets + bySegment["contas-parc"];

  return { bySegment, byEntity, totalBRL, loading: false };
}