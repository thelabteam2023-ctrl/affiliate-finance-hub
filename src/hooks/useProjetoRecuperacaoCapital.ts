import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";

/**
 * Recuperação de Capital — paridade 1:1 com a seção "Break Even" do
 * ProjetoFinancialMetricsCard.
 *
 * - Capital Investido = depósitos confirmados (DEPOSITO + DEPOSITO_VIRTUAL),
 *   consolidados via Cotação Oficial (mesma função usada no card de
 *   Indicadores Financeiros, garantindo paridade absoluta).
 * - Capital Recuperado = saques confirmados (SAQUE + SAQUE_VIRTUAL),
 *   priorizando `valor_confirmado` quando disponível.
 *
 * SEMPRE acumulado total do projeto — não respeita filtros de período.
 */

interface DepositoRow {
  valor: number;
  moeda: string;
  tipo_transacao: string;
  origem_tipo: string | null;
}

interface SaqueRow {
  valor: number;
  valor_confirmado: number | null;
  moeda: string;
  tipo_moeda: string | null;
  tipo_transacao: string;
}

async function fetchRecuperacaoRaw(projetoId: string) {
  const [depositos, saques] = await Promise.all([
    supabase
      .from("cash_ledger")
      .select("valor, moeda, tipo_transacao, origem_tipo")
      .in("tipo_transacao", ["DEPOSITO", "DEPOSITO_VIRTUAL"])
      .eq("status", "CONFIRMADO")
      .eq("projeto_id_snapshot", projetoId)
      .limit(10000),
    supabase
      .from("cash_ledger")
      .select("valor, valor_confirmado, moeda, tipo_moeda, tipo_transacao")
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
  const { convertToConsolidationOficial } = useProjetoCurrency(projetoId || "");

  const { data, isLoading } = useQuery({
    queryKey: ["projeto-recuperacao-capital", projetoId],
    queryFn: () => fetchRecuperacaoRaw(projetoId!),
    enabled: !!projetoId,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const result = useMemo<RecuperacaoCapital | null>(() => {
    if (!data) return null;

    const investido = data.depositos.reduce(
      (acc, d) => acc + convertToConsolidationOficial(d.valor, d.moeda),
      0
    );
    const recuperado = data.saques.reduce(
      (acc, s) => acc + convertToConsolidationOficial(s.valor_confirmado ?? s.valor, s.moeda),
      0
    );

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
  }, [data, convertToConsolidationOficial]);

  return { data: result, isLoading };
}