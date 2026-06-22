import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const APORTE_TIPOS = ["APORTE", "APORTE_FINANCEIRO", "APORTE_DIRETO"];
const LIQUIDACAO_TIPOS = ["LIQUIDACAO"];

interface Row {
  tipo_transacao: string;
  valor: number | null;
  valor_confirmado: number | null;
  moeda: string | null;
  data_transacao: string;
}

export interface PosicaoCapitalResult {
  aportesPeriodo: number;
  liquidacoesPeriodo: number;
  capitalLiquidoPeriodo: number;
  aportesAcumulado: number;
  liquidacoesAcumulado: number;
  capitalLiquidoAcumulado: number;
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
 * Tudo consolidado via Cotação de Trabalho (função `convert` injetada).
 */
export function usePosicaoCapital({
  workspaceId,
  dataInicio,
  dataFim,
  convert,
  moedaConsolidacao = "BRL",
}: Params): PosicaoCapitalResult {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!workspaceId) {
      setRows([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cash_ledger")
        .select("tipo_transacao, valor, valor_confirmado, moeda, data_transacao")
        .eq("workspace_id", workspaceId)
        .eq("status", "CONFIRMADO")
        .in("tipo_transacao", [...APORTE_TIPOS, ...LIQUIDACAO_TIPOS])
        .limit(20000);
      if (error) throw error;
      setRows((data as Row[]) || []);
    } catch (e) {
      console.error("[usePosicaoCapital] erro:", e);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  let aportesAcumulado = 0;
  let liquidacoesAcumulado = 0;
  let aportesPeriodo = 0;
  let liquidacoesPeriodo = 0;

  for (const r of rows) {
    const v = toConsolidado(r);
    const isAporte = APORTE_TIPOS.includes(r.tipo_transacao);
    const isLiq = LIQUIDACAO_TIPOS.includes(r.tipo_transacao);
    if (isAporte) aportesAcumulado += v;
    if (isLiq) liquidacoesAcumulado += v;
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
    loading,
    refresh: fetchData,
  };
}