import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCotacoes } from "@/hooks/useCotacoes";
import { useCapitalEmDisputa, type CapitalDisputaSegmentId } from "@/hooks/useCapitalEmDisputa";

export type ExposicaoSegmentId = CapitalDisputaSegmentId | "perdas" | "irrecuperavel";

export interface OcorrenciaDetalhe {
  id: string;
  titulo: string;
  tipo: string;
  sub_motivo: string | null;
  status: string;
  data_ocorrencia: string | null;
  valor: number; // em BRL
  moeda: string;
  valor_original: number;
  bookmaker_nome?: string | null;
  conta_titular?: string | null;
  conta_banco?: string | null;
  wallet_label?: string | null;
  parceiro_nome?: string | null;
}

export interface PerdaDetalhe {
  id: string;
  fonte: "ledger" | "ocorrencia";
  data: string;
  valor: number;
  moeda: string;
  descricao: string;
  origem_label?: string | null;
  origem_titular?: string | null;
}

export interface IrrecuperavelDetalhe {
  id: string;
  bookmaker_nome: string;
  projeto_nome: string | null;
  parceiro_nome: string | null;
  moeda: string;
  valor: number; // BRL
  valor_original: number;
}

export interface ExposicaoFinanceira {
  loading: boolean;
  totalEmDisputa: number;
  totalPerdasPeriodo: number;
  totalIrrecuperavel: number;
  totalConsolidado: number;
  countPerdas: number;
  countIrrecuperavel: number;
  bySegmentDisputa: Record<CapitalDisputaSegmentId, number>;
  detalhes: {
    disputaBookmakers: OcorrenciaDetalhe[];
    disputaContasParceiros: OcorrenciaDetalhe[];
    disputaWallets: OcorrenciaDetalhe[];
    disputaCaixa: OcorrenciaDetalhe[];
    perdas: PerdaDetalhe[];
    irrecuperavel: IrrecuperavelDetalhe[];
  };
}

const EMPTY: ExposicaoFinanceira = {
  loading: false,
  totalEmDisputa: 0,
  totalPerdasPeriodo: 0,
  totalIrrecuperavel: 0,
  totalConsolidado: 0,
  countPerdas: 0,
  countIrrecuperavel: 0,
  bySegmentDisputa: { bookmakers: 0, "caixa-op": 0, wallets: 0, "contas-parc": 0 },
  detalhes: {
    disputaBookmakers: [],
    disputaContasParceiros: [],
    disputaWallets: [],
    disputaCaixa: [],
    perdas: [],
    irrecuperavel: [],
  },
};

interface Params {
  dataInicio: string | null;
  dataFim: string | null;
}

export function useExposicaoFinanceira({ dataInicio, dataFim }: Params): ExposicaoFinanceira {
  const { workspaceId } = useAuth();
  const { convertToBRL } = useCotacoes();
  const disputa = useCapitalEmDisputa();

  const inicioISO = dataInicio || "1900-01-01";
  const fimISO = dataFim || new Date().toISOString().slice(0, 10);

  const query = useQuery({
    queryKey: ["exposicao-financeira", workspaceId, inicioISO, fimISO],
    enabled: !!workspaceId,
    staleTime: 30_000,
    queryFn: async () => {
      // Em paralelo: ocorrências (em aberto + perdas resolvidas no período) + bookmakers irrecuperáveis + cash_ledger perdas
      const [ocorrAbertasRes, ocorrPerdasRes, bookmakersRes, ledgerPerdasRes] = await Promise.all([
        supabase
          .from("ocorrencias")
          .select(
            "id, titulo, tipo, sub_motivo, status, data_ocorrencia, valor_risco, moeda, bookmaker_id, conta_bancaria_id, wallet_id, parceiro_id"
          )
          .eq("workspace_id", workspaceId!)
          .in("status", ["aberto", "em_andamento", "aguardando_terceiro"]),
        supabase
          .from("ocorrencias")
          .select(
            "id, titulo, tipo, sub_motivo, status, data_ocorrencia, resolved_at, valor_perda, perda_registrada_ledger, moeda, bookmaker_id, conta_bancaria_id, wallet_id, parceiro_id"
          )
          .eq("workspace_id", workspaceId!)
          .in("resultado_financeiro", ["perda_confirmada", "perda_parcial"])
          .gte("resolved_at", `${inicioISO}T00:00:00`)
          .lte("resolved_at", `${fimISO}T23:59:59`),
        supabase
          .from("bookmakers")
          .select("id, saldo_irrecuperavel, moeda, projeto_id, parceiro_id, bookmaker_catalogo_id, projetos(nome), bookmakers_catalogo(nome)")
          .eq("workspace_id", workspaceId!)
          .gt("saldo_irrecuperavel", 0),
        supabase
          .from("cash_ledger")
          .select("id, valor, moeda, data_transacao, descricao, origem_tipo, origem_bookmaker_id, origem_conta_bancaria_id, origem_wallet_id")
          .eq("workspace_id", workspaceId!)
          .eq("status", "CONFIRMADO")
          .eq("tipo_transacao", "PERDA_OPERACIONAL")
          .gte("data_transacao", inicioISO)
          .lte("data_transacao", fimISO),
      ]);

      // Coleta IDs para enriquecer
      const allOcorr = [...(ocorrAbertasRes.data ?? []), ...(ocorrPerdasRes.data ?? [])];
      const allLedger = ledgerPerdasRes.data ?? [];

      const bookmakerIds = new Set<string>();
      const contaIds = new Set<string>();
      const walletIds = new Set<string>();
      const parceiroIds = new Set<string>();

      for (const o of allOcorr) {
        if (o.bookmaker_id) bookmakerIds.add(o.bookmaker_id);
        if (o.conta_bancaria_id) contaIds.add(o.conta_bancaria_id);
        if (o.wallet_id) walletIds.add(o.wallet_id);
        if (o.parceiro_id) parceiroIds.add(o.parceiro_id);
      }
      for (const l of allLedger) {
        if (l.origem_bookmaker_id) bookmakerIds.add(l.origem_bookmaker_id);
        if (l.origem_conta_bancaria_id) contaIds.add(l.origem_conta_bancaria_id);
        if (l.origem_wallet_id) walletIds.add(l.origem_wallet_id);
      }

      const [bmInfoRes, contasInfoRes, walletsInfoRes, parceirosInfoRes] = await Promise.all([
        bookmakerIds.size
          ? supabase
              .from("bookmakers")
              .select("id, parceiro_id, bookmakers_catalogo(nome)")
              .in("id", Array.from(bookmakerIds))
          : Promise.resolve({ data: [] as any[] }),
        contaIds.size
          ? supabase
              .from("contas_bancarias")
              .select("id, titular, banco, parceiro_id")
              .in("id", Array.from(contaIds))
          : Promise.resolve({ data: [] as any[] }),
        walletIds.size
          ? supabase
              .from("wallets_crypto")
              .select("id, exchange, coin, parceiro_id")
              .in("id", Array.from(walletIds))
          : Promise.resolve({ data: [] as any[] }),
        parceiroIds.size
          ? supabase.from("parceiros").select("id, nome").in("id", Array.from(parceiroIds))
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const bmMap: Record<string, { nome: string; parceiro_id: string | null }> = {};
      (bmInfoRes.data ?? []).forEach((b: any) => {
        bmMap[b.id] = { nome: b.bookmakers_catalogo?.nome ?? "Bookmaker", parceiro_id: b.parceiro_id ?? null };
      });
      const contaMap: Record<string, { titular: string; banco: string; parceiro_id: string | null }> = {};
      (contasInfoRes.data ?? []).forEach((c: any) => {
        contaMap[c.id] = { titular: c.titular ?? "—", banco: c.banco ?? "—", parceiro_id: c.parceiro_id ?? null };
      });
      const walletMap: Record<string, { exchange: string; coin: string; parceiro_id: string | null }> = {};
      (walletsInfoRes.data ?? []).forEach((w: any) => {
        walletMap[w.id] = { exchange: w.exchange ?? "—", coin: w.coin ?? "—", parceiro_id: w.parceiro_id ?? null };
      });
      const parceiroMap: Record<string, string> = {};
      (parceirosInfoRes.data ?? []).forEach((p: any) => {
        parceiroMap[p.id] = p.nome ?? "—";
      });

      // Para o card de irrecuperável, precisamos do titular do parceiro
      const bmIrrecParceiroIds = Array.from(
        new Set((bookmakersRes.data ?? []).map((b: any) => b.parceiro_id).filter(Boolean))
      );
      const parceirosIrrecRes = bmIrrecParceiroIds.length
        ? await supabase.from("parceiros").select("id, nome").in("id", bmIrrecParceiroIds as string[])
        : { data: [] as any[] };
      const parceiroIrrecMap: Record<string, string> = {};
      (parceirosIrrecRes.data ?? []).forEach((p: any) => (parceiroIrrecMap[p.id] = p.nome ?? "—"));

      return {
        ocorrAbertas: ocorrAbertasRes.data ?? [],
        ocorrPerdas: ocorrPerdasRes.data ?? [],
        bookmakersIrrec: bookmakersRes.data ?? [],
        ledgerPerdas: allLedger,
        bmMap,
        contaMap,
        walletMap,
        parceiroMap,
        parceiroIrrecMap,
      };
    },
  });

  return useMemo<ExposicaoFinanceira>(() => {
    if (!query.data || disputa.loading) {
      return { ...EMPTY, loading: query.isLoading || disputa.loading };
    }
    const { ocorrAbertas, ocorrPerdas, bookmakersIrrec, ledgerPerdas, bmMap, contaMap, walletMap, parceiroMap, parceiroIrrecMap } = query.data;

    const detalhes: ExposicaoFinanceira["detalhes"] = {
      disputaBookmakers: [],
      disputaContasParceiros: [],
      disputaWallets: [],
      disputaCaixa: [],
      perdas: [],
      irrecuperavel: [],
    };

    // Disputas
    for (const o of ocorrAbertas as any[]) {
      const valorOrig = Number(o.valor_risco ?? 0);
      if (valorOrig <= 0) continue;
      const valor = convertToBRL(valorOrig, o.moeda || "BRL");
      if (valor <= 0) continue;
      const base: OcorrenciaDetalhe = {
        id: o.id,
        titulo: o.titulo ?? "(sem título)",
        tipo: o.tipo,
        sub_motivo: o.sub_motivo,
        status: o.status,
        data_ocorrencia: o.data_ocorrencia,
        valor,
        moeda: o.moeda || "BRL",
        valor_original: valorOrig,
        parceiro_nome: o.parceiro_id ? parceiroMap[o.parceiro_id] : null,
      };
      if (o.bookmaker_id) {
        const bm = bmMap[o.bookmaker_id];
        detalhes.disputaBookmakers.push({
          ...base,
          bookmaker_nome: bm?.nome ?? "Bookmaker",
          parceiro_nome: bm?.parceiro_id ? parceiroMap[bm.parceiro_id] : base.parceiro_nome,
        });
      } else if (o.wallet_id) {
        const w = walletMap[o.wallet_id];
        detalhes.disputaWallets.push({
          ...base,
          wallet_label: w ? `${w.exchange} · ${w.coin}` : "Wallet",
          parceiro_nome: w?.parceiro_id ? parceiroMap[w.parceiro_id] : base.parceiro_nome,
        });
      } else if (o.conta_bancaria_id) {
        const c = contaMap[o.conta_bancaria_id];
        const bucket = c?.parceiro_id ? detalhes.disputaContasParceiros : detalhes.disputaCaixa;
        bucket.push({
          ...base,
          conta_titular: c?.titular,
          conta_banco: c?.banco,
          parceiro_nome: c?.parceiro_id ? parceiroMap[c.parceiro_id] : base.parceiro_nome,
        });
      }
    }

    // Perdas: ledger
    for (const l of ledgerPerdas as any[]) {
      const valor = convertToBRL(Number(l.valor || 0), l.moeda || "BRL");
      if (valor <= 0) continue;
      let label: string | null = null;
      let titular: string | null = null;
      if (l.origem_bookmaker_id && bmMap[l.origem_bookmaker_id]) {
        label = bmMap[l.origem_bookmaker_id].nome;
        const pid = bmMap[l.origem_bookmaker_id].parceiro_id;
        titular = pid ? parceiroMap[pid] : null;
      } else if (l.origem_conta_bancaria_id && contaMap[l.origem_conta_bancaria_id]) {
        const c = contaMap[l.origem_conta_bancaria_id];
        label = c.banco;
        titular = c.titular;
      } else if (l.origem_wallet_id && walletMap[l.origem_wallet_id]) {
        const w = walletMap[l.origem_wallet_id];
        label = `${w.exchange} · ${w.coin}`;
      }
      detalhes.perdas.push({
        id: l.id,
        fonte: "ledger",
        data: l.data_transacao,
        valor,
        moeda: l.moeda || "BRL",
        descricao: l.descricao || "Perda operacional",
        origem_label: label,
        origem_titular: titular,
      });
    }
    // Perdas: ocorrências (apenas as que ainda NÃO viraram ledger, p/ evitar dupla contagem)
    for (const o of ocorrPerdas as any[]) {
      if (o.perda_registrada_ledger) continue;
      const valorOrig = Number(o.valor_perda ?? 0);
      if (valorOrig <= 0) continue;
      const valor = convertToBRL(valorOrig, o.moeda || "BRL");
      if (valor <= 0) continue;
      let label: string | null = null;
      let titular: string | null = null;
      if (o.bookmaker_id && bmMap[o.bookmaker_id]) {
        label = bmMap[o.bookmaker_id].nome;
        const pid = bmMap[o.bookmaker_id].parceiro_id;
        titular = pid ? parceiroMap[pid] : null;
      } else if (o.conta_bancaria_id && contaMap[o.conta_bancaria_id]) {
        const c = contaMap[o.conta_bancaria_id];
        label = c.banco;
        titular = c.titular;
      } else if (o.wallet_id && walletMap[o.wallet_id]) {
        const w = walletMap[o.wallet_id];
        label = `${w.exchange} · ${w.coin}`;
      }
      detalhes.perdas.push({
        id: o.id,
        fonte: "ocorrencia",
        data: o.resolved_at?.slice(0, 10) || o.data_ocorrencia,
        valor,
        moeda: o.moeda || "BRL",
        descricao: o.titulo || "Ocorrência com perda",
        origem_label: label,
        origem_titular: titular,
      });
    }

    // Irrecuperável (estoque atual em casas)
    for (const b of bookmakersIrrec as any[]) {
      const valorOrig = Number(b.saldo_irrecuperavel || 0);
      if (valorOrig <= 0) continue;
      const valor = convertToBRL(valorOrig, b.moeda || "BRL");
      detalhes.irrecuperavel.push({
        id: b.id,
        bookmaker_nome: b.bookmakers_catalogo?.nome ?? "Bookmaker",
        projeto_nome: b.projetos?.nome ?? null,
        parceiro_nome: b.parceiro_id ? parceiroIrrecMap[b.parceiro_id] ?? null : null,
        moeda: b.moeda || "BRL",
        valor,
        valor_original: valorOrig,
      });
    }

    const totalPerdasPeriodo = detalhes.perdas.reduce((a, p) => a + p.valor, 0);
    const totalIrrecuperavel = detalhes.irrecuperavel.reduce((a, i) => a + i.valor, 0);
    const totalEmDisputa = disputa.totalBRL;

    return {
      loading: false,
      totalEmDisputa,
      totalPerdasPeriodo,
      totalIrrecuperavel,
      totalConsolidado: totalEmDisputa + totalPerdasPeriodo + totalIrrecuperavel,
      countPerdas: detalhes.perdas.length,
      countIrrecuperavel: detalhes.irrecuperavel.length,
      bySegmentDisputa: disputa.bySegment,
      detalhes,
    };
  }, [query.data, query.isLoading, disputa, convertToBRL]);
}