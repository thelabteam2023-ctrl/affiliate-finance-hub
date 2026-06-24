import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCaixaDataChangedListener } from "@/hooks/useInvalidateCaixaData";

const APORTE_TIPOS = ["APORTE", "APORTE_FINANCEIRO", "APORTE_DIRETO"];
const LIQUIDACAO_TIPOS = ["LIQUIDACAO"];

interface Row {
  tipo_transacao: string;
  valor: number | null;
  valor_confirmado: number | null;
  moeda: string | null;
  data_transacao: string;
  cotacao_origem_usd: number | null;
}

export interface PosicaoCapitalResult {
  aportesPeriodo: number;
  liquidacoesPeriodo: number;
  capitalLiquidoPeriodo: number;
  aportesAcumulado: number;
  liquidacoesAcumulado: number;
  capitalLiquidoAcumulado: number;
  /**
   * Capital próprio investido (acumulado) avaliado pela PTAX do DIA de cada
   * evento. Diferente de `capitalLiquidoAcumulado` (mark-to-market hoje), este
   * número não muda quando a cotação atual oscila — é o que o investidor
   * efetivamente colocou na operação em BRL na época.
   */
  capitalLiquidoHistoricoBRL: number;
  aportesHistoricoBRL: number;
  liquidacoesHistoricoBRL: number;
  loading: boolean;
  refresh: () => void;
}

interface Params {
  workspaceId: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  /** Converter um valor de moeda origem para a moeda de consolidação. */
  convert: (valor: number, moedaOrigem: string, moedaDestino: string) => number;
  moedaConsolidacao?: string;
}

/**
 * Fonte: cash_ledger, status CONFIRMADO.
 * Aportes = APORTE / APORTE_FINANCEIRO / APORTE_DIRETO.
 * Liquidações = LIQUIDACAO.
 *
 * Duas avaliações são produzidas:
 *  - Mark-to-market: usa a função `convert` injetada (PTAX/FastForex de HOJE)
 *    — para os totalizadores do toggle Acumulado/Período.
 *  - Histórico: usa a PTAX da DATA de cada transação. Para BRL é trivial
 *    (valor é o próprio BRL); para demais moedas usa
 *    `cotacao_origem_usd` da linha × USDBRL do dia (de `exchange_rate_history`).
 *    Esse é o capital que o investidor de fato colocou — não oscila com câmbio
 *    e é usado pela decomposição "Patrimônio = Capital histórico + Resultado
 *    realizado + Variação cambial não realizada".
 */
export function usePosicaoCapital({
  workspaceId,
  dataInicio,
  dataFim,
  convert,
  moedaConsolidacao = "BRL",
}: Params): PosicaoCapitalResult {
  const [rows, setRows] = useState<Row[]>([]);
  const [usdBrlByDay, setUsdBrlByDay] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!workspaceId) {
      setRows([]);
      setUsdBrlByDay({});
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cash_ledger")
        .select(
          "tipo_transacao, valor, valor_confirmado, moeda, data_transacao, cotacao_origem_usd"
        )
        .eq("workspace_id", workspaceId)
        .eq("status", "CONFIRMADO")
        .in("tipo_transacao", [...APORTE_TIPOS, ...LIQUIDACAO_TIPOS])
        .limit(20000);
      if (error) throw error;
      const fetched = (data as Row[]) || [];
      setRows(fetched);

      // Construir mapa dia→USDBRL a partir do histórico oficial (PTAX/FastForex).
      // Só precisamos para linhas em moeda diferente de BRL.
      const needsHistory = fetched.some(
        (r) => (r.moeda || "BRL").toUpperCase() !== "BRL"
      );
      if (needsHistory) {
        const { data: hist } = await supabase
          .from("exchange_rate_history")
          .select("rate, fetched_at")
          .eq("currency_pair", "USDBRL")
          .order("fetched_at", { ascending: true })
          .limit(50000);
        const map: Record<string, number> = {};
        (hist || []).forEach((h: any) => {
          const day = String(h.fetched_at).slice(0, 10);
          const r = Number(h.rate) || 0;
          if (r > 0) map[day] = r; // último do dia prevalece
        });
        setUsdBrlByDay(map);
      } else {
        setUsdBrlByDay({});
      }
    } catch (e) {
      console.error("[usePosicaoCapital] erro:", e);
      setRows([]);
      setUsdBrlByDay({});
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reatividade: qualquer mutação no Caixa Operacional (Aporte, Liquidação,
  // Transferência, etc.) dispara CAIXA_DATA_CHANGED_EVENT via
  // dispatchCaixaDataChanged(). Re-fetch imediato para manter a Posição de
  // Capital sincronizada sem precisar de F5.
  useCaixaDataChangedListener(fetchData);

  const inPeriodo = (date: string) => {
    if (!dataInicio && !dataFim) return true;
    const d = date.slice(0, 10);
    if (dataInicio && d < dataInicio) return false;
    if (dataFim && d > dataFim) return false;
    return true;
  };

  const toConsolidado = (r: Row) => {
    const valor = Number(r.valor_confirmado ?? r.valor ?? 0);
    const moeda = (r.moeda || "BRL").toUpperCase();
    if (!valor) return 0;
    return convert(valor, moeda, moedaConsolidacao);
  };

  /** USDBRL do dia mais próximo (mesmo dia, ou dia anterior mais recente). */
  const usdBrlOfDay = (day: string): number | null => {
    if (usdBrlByDay[day]) return usdBrlByDay[day];
    const days = Object.keys(usdBrlByDay).sort();
    // procura o anterior mais próximo
    let chosen: string | null = null;
    for (const d of days) {
      if (d <= day) chosen = d;
      else break;
    }
    return chosen ? usdBrlByDay[chosen] : null;
  };

  /**
   * Avaliação histórica em BRL — usa PTAX do dia da transação.
   * Se não houver histórico disponível (registro muito antigo), faz fallback
   * pro mark-to-market via `convert`.
   */
  const toHistoricoBRL = (r: Row): number => {
    const valor = Number(r.valor_confirmado ?? r.valor ?? 0);
    const moeda = (r.moeda || "BRL").toUpperCase();
    if (!valor) return 0;
    if (moeda === "BRL") return valor;
    const day = (r.data_transacao || "").slice(0, 10);
    const usdbrl = usdBrlOfDay(day);
    const cotOrigUsd = Number(r.cotacao_origem_usd) || 0;
    if (usdbrl && cotOrigUsd > 0) {
      // valor (moeda) → USD do dia → BRL do dia
      return valor * cotOrigUsd * usdbrl;
    }
    // Fallback: mark-to-market (taxa de hoje)
    return convert(valor, moeda, "BRL");
  };

  let aportesAcumulado = 0;
  let liquidacoesAcumulado = 0;
  let aportesPeriodo = 0;
  let liquidacoesPeriodo = 0;
  let aportesHistoricoBRL = 0;
  let liquidacoesHistoricoBRL = 0;

  for (const r of rows) {
    const v = toConsolidado(r);
    const vHist = toHistoricoBRL(r);
    const isAporte = APORTE_TIPOS.includes(r.tipo_transacao);
    const isLiq = LIQUIDACAO_TIPOS.includes(r.tipo_transacao);
    if (isAporte) {
      aportesAcumulado += v;
      aportesHistoricoBRL += vHist;
    }
    if (isLiq) {
      liquidacoesAcumulado += v;
      liquidacoesHistoricoBRL += vHist;
    }
    if (inPeriodo(r.data_transacao)) {
      if (isAporte) aportesPeriodo += v;
      if (isLiq) liquidacoesPeriodo += v;
    }
  }

  return {
    aportesPeriodo,
    liquidacoesPeriodo,
    capitalLiquidoPeriodo: aportesPeriodo - liquidacoesPeriodo,
    aportesAcumulado,
    liquidacoesAcumulado,
    capitalLiquidoAcumulado: aportesAcumulado - liquidacoesAcumulado,
    aportesHistoricoBRL,
    liquidacoesHistoricoBRL,
    capitalLiquidoHistoricoBRL: aportesHistoricoBRL - liquidacoesHistoricoBRL,
    loading,
    refresh: fetchData,
  };
}