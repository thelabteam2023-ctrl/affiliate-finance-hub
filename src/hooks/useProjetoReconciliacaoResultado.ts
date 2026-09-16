import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCotacoes } from "@/hooks/useCotacoes";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { useProjetoRecuperacaoCapital } from "@/hooks/useProjetoRecuperacaoCapital";
import { fetchProjetosLucroCanonico } from "@/services/fetchProjetosLucroCanonico";
import {
  calcularReconciliacaoResultado,
  type ReconciliacaoResultado,
  type EventoDiferencaLedger,
} from "@/lib/ledger/reconciliacaoResultado";

/**
 * Reconciliação do Lucro Realizado em componentes explicáveis:
 * Operacional + Resultado Cambial + Outros Resultados Financeiros = Lucro Realizado.
 *
 * Somente leitura. Não altera ledger nem dados históricos.
 */
export function useProjetoReconciliacaoResultado(projetoId: string | undefined) {
  const {
    cotacaoUSD,
    cotacaoEUR,
    cotacaoGBP,
    cotacaoMYR,
    cotacaoMXN,
    cotacaoARS,
    cotacaoCOP,
  } = useCotacoes();
  const { convertToConsolidation, moedaConsolidacao } = useProjetoCurrency(projetoId || "");
  const { data: recuperacao, isLoading: loadingRecuperacao } =
    useProjetoRecuperacaoCapital(projetoId);

  const { data: canonico, isLoading: loadingCanonico } = useQuery({
    queryKey: ["projeto-lucro-canonico-reconciliacao", projetoId, cotacaoUSD],
    queryFn: async () => {
      const res = await fetchProjetosLucroCanonico({
        projetoIds: [projetoId!],
        cotacoesOficiais: {
          USD: cotacaoUSD,
          EUR: cotacaoEUR,
          GBP: cotacaoGBP,
          MYR: cotacaoMYR,
          MXN: cotacaoMXN,
          ARS: cotacaoARS,
          COP: cotacaoCOP,
        },
      });
      return res[projetoId!] || null;
    },
    enabled: !!projetoId && cotacaoUSD > 0,
    staleTime: 30_000,
  });

  const { data: ledgerFx, isLoading: loadingFx } = useQuery({
    queryKey: ["projeto-reconciliacao-fx", projetoId],
    queryFn: async () => {
      const [eventos, casas] = await Promise.all([
        supabase
          .from("cash_ledger")
          .select("valor, moeda, tipo_transacao, origem_bookmaker_id, destino_bookmaker_id")
          .in("tipo_transacao", ["GANHO_CAMBIAL", "PERDA_CAMBIAL"])
          .eq("status", "CONFIRMADO")
          .eq("projeto_id_snapshot", projetoId!)
          .is("reversed_at", null)
          .limit(10000),
        supabase
          .from("bookmakers")
          .select("id, moeda, saldo_atual")
          .eq("projeto_id", projetoId!)
          .limit(10000),
      ]);

      const casasMap = new Map<string, string>();
      const saldos: { moeda: string; saldo: number }[] = [];
      (casas.data || []).forEach((b: any) => {
        casasMap.set(b.id, (b.moeda || "BRL").toUpperCase());
        saldos.push({
          moeda: (b.moeda || "BRL").toUpperCase(),
          saldo: Number(b.saldo_atual) || 0,
        });
      });

      const eventosDiferenca: EventoDiferencaLedger[] = (eventos.data || []).map((e: any) => ({
        tipo_transacao: e.tipo_transacao,
        valor: Number(e.valor) || 0,
        moeda: (e.moeda || "BRL").toUpperCase(),
        moedaContraparte:
          casasMap.get(e.destino_bookmaker_id) || casasMap.get(e.origem_bookmaker_id) || null,
      }));

      return { eventosDiferenca, saldos };
    },
    enabled: !!projetoId,
    staleTime: 30_000,
  });

  const data = useMemo<ReconciliacaoResultado | null>(() => {
    if (!canonico || !ledgerFx || !recuperacao) return null;
    return calcularReconciliacaoResultado({
      operacionalHistorico: canonico.consolidado,
      operacionalPorMoeda: canonico.porMoeda,
      eventosDiferenca: ledgerFx.eventosDiferenca,
      saldosPorMoeda: ledgerFx.saldos,
      lucroRealizadoFluxo: recuperacao.recuperado - recuperacao.investido,
      moedaConsolidacao,
      convertToConsolidation,
    });
  }, [canonico, ledgerFx, recuperacao, moedaConsolidacao, convertToConsolidation]);

  return {
    data,
    isLoading: loadingCanonico || loadingFx || loadingRecuperacao,
  };
}
