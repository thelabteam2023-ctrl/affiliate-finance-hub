import { useMemo } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

interface LedgerEntry {
  valor: number;
  valor_confirmado?: number | null;
  moeda: string;
}

interface FinancialMetricsRaw {
  bookmakerSaldos: { saldo_atual: number; moeda: string }[];
  depositos: LedgerEntry[];
  saques: LedgerEntry[];
  saquesPendentes: LedgerEntry[];
  reconciliation: {
    cashbackManual: { valor: number; moeda: string }[];
    cashbackEstorno: { valor: number; moeda: string }[];
    girosGratis: { valor: number; moeda: string }[];
    ajusteSaldo: { valor: number; moeda: string; ajuste_direcao?: string | null }[];
    perdaOperacional: { valor: number; moeda: string }[];
    perdaCambial: { valor: number; moeda: string }[];
    ganhoCambial: { valor: number; moeda: string }[];
  };
  breakEvenTimeline: {
    valor: number;
    valor_confirmado?: number | null;
    moeda: string;
    data_transacao: string;
    tipo_transacao: string;
  }[];
  bonusGanhos: { bonus_amount: number; currency: string }[];
}

export interface FinancialMetricsComputed {
  depositosTotal: number;
  saquesRecebidos: number;
  saquesPendentes: number;
  saldoCasas: number;
  lucroRealizado: number;
  cashbackLiquido: number;
  girosGratis: number;
  ajustes: number;
  ganhoConfirmacao: number;
  ganhoFx: number;
  perdaOp: number;
  perdaFx: number;
  bonusGanhos: number;
  resultadoExtras: number;
  breakEvenDate: string | null;
  breakEvenDays: number | null;
}

async function fetchFinancialMetricsRaw(projetoId: string): Promise<FinancialMetricsRaw> {
  const { data: bookmakers } = await supabase
    .from("bookmakers")
    .select("saldo_atual, moeda")
    .eq("projeto_id", projetoId);

  const [depositos, saques, saquesPend, cashbackM, cashbackE, giros, ajustes, perdasOp, perdasFx, ganhosFx, timelineData, bonusGanhosData] = await Promise.all([
    supabase.from("cash_ledger").select("valor, moeda")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
      .eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, valor_confirmado, moeda")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "PENDENTE").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "CASHBACK_MANUAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "CASHBACK_ESTORNO").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "GIRO_GRATIS").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda, ajuste_direcao")
      .eq("tipo_transacao", "AJUSTE_SALDO").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "PERDA_OPERACIONAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "PERDA_CAMBIAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase.from("cash_ledger").select("valor, moeda")
      .eq("tipo_transacao", "GANHO_CAMBIAL").eq("status", "CONFIRMADO").eq("projeto_id_snapshot", projetoId),
    supabase
      .from("cash_ledger")
      .select("valor, valor_confirmado, moeda, data_transacao, tipo_transacao")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL", "SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .order("data_transacao", { ascending: true }),
    supabase
      .from("project_bookmaker_link_bonuses")
      .select("bonus_amount, currency")
      .eq("project_id", projetoId)
      .in("status", ["credited", "finalized"]),
  ]);

  return {
    bookmakerSaldos: (bookmakers || []).map((b) => ({
      saldo_atual: b.saldo_atual || 0,
      moeda: b.moeda || "BRL",
    })),
    depositos: (depositos.data || []) as LedgerEntry[],
    saques: (saques.data || []) as LedgerEntry[],
    saquesPendentes: (saquesPend.data || []) as LedgerEntry[],
    reconciliation: {
      cashbackManual: (cashbackM.data || []) as { valor: number; moeda: string }[],
      cashbackEstorno: (cashbackE.data || []) as { valor: number; moeda: string }[],
      girosGratis: (giros.data || []) as { valor: number; moeda: string }[],
      ajusteSaldo: (ajustes.data || []) as { valor: number; moeda: string; ajuste_direcao?: string | null }[],
      perdaOperacional: (perdasOp.data || []) as { valor: number; moeda: string }[],
      perdaCambial: (perdasFx.data || []) as { valor: number; moeda: string }[],
      ganhoCambial: (ganhosFx.data || []) as { valor: number; moeda: string }[],
    },
    breakEvenTimeline: (timelineData.data || []) as {
      valor: number;
      valor_confirmado?: number | null;
      moeda: string;
      data_transacao: string;
      tipo_transacao: string;
    }[],
    bonusGanhos: (bonusGanhosData.data || []) as { bonus_amount: number; currency: string }[],
  };
}

export function useFinancialMetrics(projetoId: string) {
  const { formatCurrency, convertToConsolidationOficial } = useProjetoCurrency(projetoId);

  const { data: rawMetrics, isLoading } = useQuery({
    queryKey: ["projeto-financial-metrics", projetoId],
    queryFn: () => fetchFinancialMetricsRaw(projetoId),
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const metrics = useMemo<FinancialMetricsComputed | null>(() => {
    if (!rawMetrics) return null;

    const saldoCasas = rawMetrics.bookmakerSaldos.reduce(
      (acc, b) => acc + convertToConsolidationOficial(b.saldo_atual, b.moeda),
      0
    );
    const depositosTotal = rawMetrics.depositos.reduce(
      (acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda),
      0
    );
    const saquesRecebidos = rawMetrics.saques.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor_confirmado ?? s.valor, s.moeda),
      0
    );
    const saquesPendentes = rawMetrics.saquesPendentes.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor, s.moeda),
      0
    );

    const ganhoConfirmacao = rawMetrics.saques.reduce((acc, s) => {
      if (s.valor_confirmado != null && s.valor_confirmado !== s.valor) {
        return acc + convertToConsolidationOficial(s.valor_confirmado - s.valor, s.moeda);
      }
      return acc;
    }, 0);

    const sumConvert = (arr: { valor: number; moeda: string }[]) =>
      arr.reduce((acc, e) => acc + convertToConsolidationOficial(e.valor, e.moeda), 0);

    const r = rawMetrics.reconciliation;
    const cashbackLiquido = sumConvert(r.cashbackManual) - sumConvert(r.cashbackEstorno);
    const girosGratis = sumConvert(r.girosGratis);
    const ajustes = r.ajusteSaldo.reduce((acc, e) => {
      const sinal = e.ajuste_direcao === "SAIDA" ? -1 : 1;
      return acc + convertToConsolidationOficial(e.valor * sinal, e.moeda);
    }, 0);
    const perdaOp = sumConvert(r.perdaOperacional);
    const perdaFx = sumConvert(r.perdaCambial);
    const ganhoFx = sumConvert(r.ganhoCambial);

    const bonusGanhos = rawMetrics.bonusGanhos.reduce(
      (acc, b) => acc + convertToConsolidationOficial(b.bonus_amount, b.currency || "BRL"),
      0
    );

    const lucroRealizado = saquesRecebidos - depositosTotal;
    const resultadoExtras = bonusGanhos + cashbackLiquido + girosGratis + ajustes + ganhoConfirmacao + ganhoFx - perdaOp - perdaFx;

    let cumulativeFlow = 0;
    let breakEvenDate: string | null = null;
    let firstTransactionDate: string | null = null;

    for (const entry of rawMetrics.breakEvenTimeline || []) {
      if (!firstTransactionDate) firstTransactionDate = entry.data_transacao;
      const isSaque = entry.tipo_transacao === "SAQUE" || entry.tipo_transacao === "SAQUE_VIRTUAL";
      const valor = isSaque
        ? convertToConsolidationOficial(entry.valor_confirmado ?? entry.valor, entry.moeda)
        : convertToConsolidationOficial(entry.valor, entry.moeda);

      cumulativeFlow += isSaque ? valor : -valor;
      if (cumulativeFlow >= 0 && !breakEvenDate) breakEvenDate = entry.data_transacao;
      if (cumulativeFlow < 0) breakEvenDate = null;
    }

    const breakEvenDays = breakEvenDate && firstTransactionDate
      ? differenceInDays(parseISO(breakEvenDate), parseISO(firstTransactionDate))
      : null;

    return {
      depositosTotal,
      saquesRecebidos,
      saquesPendentes,
      saldoCasas,
      lucroRealizado,
      cashbackLiquido,
      girosGratis,
      ajustes,
      ganhoConfirmacao,
      ganhoFx,
      perdaOp,
      perdaFx,
      bonusGanhos,
      resultadoExtras,
      breakEvenDate,
      breakEvenDays,
    };
  }, [rawMetrics, convertToConsolidationOficial]);

  return { metrics, isLoading, formatCurrency };
}
