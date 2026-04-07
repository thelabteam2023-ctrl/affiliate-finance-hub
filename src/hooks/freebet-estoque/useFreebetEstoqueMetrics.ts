import { useMemo } from "react";
import { usePromotionalCurrencyConversion } from "@/hooks/usePromotionalCurrencyConversion";
import type { FreebetRecebidaCompleta, BookmakerEstoque, EstoqueMetrics } from "./types";

export function useFreebetEstoqueMetrics(
  projetoId: string,
  freebets: FreebetRecebidaCompleta[],
  bookmakersEstoque: BookmakerEstoque[]
) {
  const { converterParaConsolidacao, config: currencyConfig } = usePromotionalCurrencyConversion(projetoId);

  const metrics = useMemo((): EstoqueMetrics => {
    const saldoPorMoedaMap = new Map<string, number>();
    const recebidoPorMoedaMap = new Map<string, number>();

    const saldoDisponivel = bookmakersEstoque.reduce((acc, bk) => {
      saldoPorMoedaMap.set(bk.moeda, (saldoPorMoedaMap.get(bk.moeda) || 0) + bk.saldo_nominal);
      return acc + converterParaConsolidacao(bk.saldo_nominal, bk.moeda);
    }, 0);

    const freebetsLiberadas = freebets.filter(fb => fb.status === "LIBERADA");

    const totalRecebido = freebetsLiberadas.reduce((acc, fb) => {
      recebidoPorMoedaMap.set(fb.moeda, (recebidoPorMoedaMap.get(fb.moeda) || 0) + fb.valor);
      return acc + converterParaConsolidacao(fb.valor, fb.moeda);
    }, 0);

    const totalUtilizado = freebetsLiberadas
      .filter(fb => fb.utilizada && fb.aposta_id)
      .reduce((acc, fb) => acc + converterParaConsolidacao(fb.valor, fb.moeda), 0);

    const proximasExpirar = freebets.filter(fb =>
      fb.diasParaExpirar !== null && fb.diasParaExpirar <= 7 && fb.diasParaExpirar > 0 && !fb.utilizada
    ).length;

    const casasComFreebet = bookmakersEstoque.length;

    const saldoPorMoeda = Array.from(saldoPorMoedaMap.entries())
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) > 0.01);

    const recebidoPorMoeda = Array.from(recebidoPorMoedaMap.entries())
      .map(([moeda, valor]) => ({ moeda, valor }))
      .filter(item => Math.abs(item.valor) > 0.01);

    return {
      saldoDisponivel,
      totalRecebido,
      totalUtilizado,
      proximasExpirar,
      casasComFreebet,
      moedaConsolidacao: currencyConfig.moedaConsolidacao,
      saldoPorMoeda,
      recebidoPorMoeda,
    };
  }, [freebets, bookmakersEstoque, converterParaConsolidacao, currencyConfig.moedaConsolidacao]);

  return {
    metrics,
    moedaConsolidacao: currencyConfig.moedaConsolidacao,
    cotacaoInfo: {
      fonte: currencyConfig.fonte,
      taxa: currencyConfig.cotacaoAtual,
      disponivel: currencyConfig.disponivel,
    },
  };
}
