import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

/**
 * Recuperação de Capital — paridade 1:1 com "Depósitos" e "Saques" do Extrato.
 *
 * Regra canônica (memory: analytics-snapshot-conversion-hierarchy):
 *   1º valor_usd_referencia (snapshot congelado no dia da transação)
 *   2º Cotação de Trabalho do projeto (fallback p/ registros antigos sem snapshot)
 *
 * Filtros (memory: virtual-deposit-origin-classification):
 *   - Depósitos efetivos = DEPOSITO real + DEPOSITO_VIRTUAL (origem_tipo='MIGRACAO')
 *   - Exclui BASELINE e NULL (residuais de vinculação — não são capital real).
 *   - Saques usam valor_confirmado quando disponível.
 *
 * SEMPRE acumulado total do projeto — não respeita filtros de período.
 */

interface DepositoRow {
  valor: number;
  valor_usd_referencia: number | null;
  moeda: string;
  tipo_transacao: string;
  origem_tipo: string | null;
}

interface SaqueRow {
  valor: number;
  valor_confirmado: number | null;
  valor_usd_referencia: number | null;
  moeda: string;
  tipo_moeda: string | null;
  tipo_transacao: string;
  origem_tipo: string | null;
}

async function fetchRecuperacaoRaw(projetoId: string) {
  const [depositos, saques] = await Promise.all([
    supabase
      .from("cash_ledger")
      .select("valor, valor_usd_referencia, moeda, tipo_transacao, origem_tipo")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .limit(10000),
    supabase
      .from("cash_ledger")
      .select("valor, valor_confirmado, valor_usd_referencia, moeda, tipo_moeda, tipo_transacao, origem_tipo")
      .in("tipo_transacao", ["SAQUE", "SAQUE_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .limit(10000),
  ]);

  return {
    depositos: (depositos.data || []) as DepositoRow[],
    saques: (saques.data || []) as SaqueRow[],
  };
}

export interface RecuperacaoCapital {
  investido: number;
  recuperado: number;
  percentual: number; // 0..100, capado
  percentualBruto: number; // sem cap (para badge "acima do capital")
  pendente: number; // 0 quando recuperado >= investido
  excedente: number; // 0 quando recuperado <= investido
  status: "vazio" | "em_recuperacao" | "recuperado" | "acima";
}

export function useProjetoRecuperacaoCapital(projetoId: string | undefined) {
  const { convertToConsolidation, moedaConsolidacao } = useProjetoCurrency(projetoId || "");

  const { data, isLoading } = useQuery({
    queryKey: ["projeto-recuperacao-capital", projetoId],
    queryFn: () => fetchRecuperacaoRaw(projetoId!),
    enabled: !!projetoId,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const result = useMemo<RecuperacaoCapital | null>(() => {
    if (!data) return null;

    // Snapshot USD → moeda de consolidação via Cotação de Trabalho.
    const snapToConsolidacao = (snapUsd: number): number => {
      if (!snapUsd) return 0;
      if (moedaConsolidacao === "USD") return snapUsd;
      return convertToConsolidation(snapUsd, "USD");
    };

    const resolveSnap = (valor: number, snap: number | null, moeda: string): number => {
      const s = Number(snap ?? 0);
      if (s > 0) return snapToConsolidacao(s);
      return convertToConsolidation(valor, moeda);
    };

    // Depósitos efetivos: exclui BASELINE e NULL (não são capital real).
    const investido = data.depositos.reduce((acc, d) => {
      const isBaseline =
        d.tipo_transacao === "DEPOSITO_VIRTUAL" &&
        (d.origem_tipo === "BASELINE" || d.origem_tipo == null);
      if (isBaseline) return acc;
      return acc + resolveSnap(Number(d.valor || 0), d.valor_usd_referencia, d.moeda || "BRL");
    }, 0);

    // Saques efetivos: exclui SAQUE_VIRTUAL não-MIGRACAO (raros, apenas histórico).
    const recuperado = data.saques.reduce((acc, s) => {
      if (s.tipo_transacao === "SAQUE_VIRTUAL" && s.origem_tipo !== "MIGRACAO") return acc;
      const valorBase = Number(s.valor_confirmado ?? s.valor ?? 0);
      return acc + resolveSnap(valorBase, s.valor_usd_referencia, s.moeda || "BRL");
    }, 0);

    const percentualBruto = investido > 0 ? (recuperado / investido) * 100 : 0;
    const percentual = Math.min(100, Math.max(0, percentualBruto));
    const pendente = Math.max(0, investido - recuperado);
    const excedente = Math.max(0, recuperado - investido);

    let status: RecuperacaoCapital["status"];
    if (investido <= 0.005) status = "vazio";
    else if (recuperado >= investido && excedente > 0.005) status = "acima";
    else if (percentualBruto >= 100) status = "recuperado";
    else status = "em_recuperacao";

    return { investido, recuperado, percentual, percentualBruto, pendente, excedente, status };
  }, [data, convertToConsolidation, moedaConsolidacao]);

  return { data: result, isLoading };
}