/**
 * MOTOR DE RECONCILIAÇÃO DO LUCRO REALIZADO
 *
 * Decompõe o Lucro Realizado em componentes economicamente distintos, para que
 * o usuário entenda por que "Operacional Teórico" pode não ser igual a
 * "Lucro Realizado" sem que isso seja um bug.
 *
 *   Lucro Operacional            → resultado das estratégias, congelado na cotação
 *                                  da operação (`cotacao_snapshot`). NUNCA muda
 *                                  porque a cotação de hoje mudou.
 *   Resultado Cambial            → reavaliação do resultado em moeda estrangeira
 *                                  entre a cotação da operação e a cotação atual.
 *                                  Separado em REALIZADO (já sacado/convertido) e
 *                                  NÃO REALIZADO (posição ainda aberta na casa).
 *   Outros Result. Financeiros   → diferenças de recebimento na conciliação
 *                                  (mesma moeda: crédito extra ou taxa de trânsito).
 *   ─────────────────────────────────────────────────────────────────────────
 *   Lucro Realizado              → fluxo financeiro efetivo (saques − depósitos)
 *
 * Nada aqui escreve no banco. É exclusivamente camada de cálculo/apresentação.
 */

import { classificarDiferencaConciliacao } from "./classificarDiferencaConciliacao";

export interface EventoDiferencaLedger {
  tipo_transacao: string;
  valor: number;
  moeda: string;
  /** Moeda da casa/carteira contraparte do movimento */
  moedaContraparte?: string | null;
}

export interface SaldoMoeda {
  moeda: string;
  saldo: number;
}

export interface ReconciliacaoInput {
  /** Lucro operacional consolidado com a cotação congelada da operação */
  operacionalHistorico: number;
  /** Resultado operacional por moeda de origem (não consolidado) */
  operacionalPorMoeda: Record<string, number>;
  /** Eventos GANHO_CAMBIAL / PERDA_CAMBIAL do projeto */
  eventosDiferenca: EventoDiferencaLedger[];
  /** Saldo atual das casas, por moeda (para medir exposição ainda aberta) */
  saldosPorMoeda: SaldoMoeda[];
  /** Lucro Realizado efetivo do fluxo financeiro (recuperado − aportado) */
  lucroRealizadoFluxo: number;
  moedaConsolidacao: string;
  /** Conversor pela Cotação de Trabalho atual do projeto */
  convertToConsolidation: (valor: number, moedaOrigem: string) => number;
  /**
   * Fluxo líquido NATIVO por moeda (saques − depósitos). Quando o projeto aporta
   * em uma moeda e recupera em outra, houve conversão de capital: a diferença
   * resultante é resultado cambial de conversão, não resíduo inexplicado.
   */
  fluxoPorMoeda?: Record<string, number>;
}

export interface ReconciliacaoResultado {
  operacional: number;
  cambialRealizado: number;
  cambialNaoRealizado: number;
  /** Câmbio decorrente de conversão de capital entre moedas no fluxo financeiro */
  cambialConversao: number;
  cambialTotal: number;
  outrosFinanceiros: number;
  /** Soma dos componentes explicados */
  somaComponentes: number;
  /** Lucro Realizado efetivo (fluxo) */
  lucroRealizado: number;
  /** Diferença ainda não explicada (deve ser ~0) */
  residuo: number;
  /** true quando o resíduo é desprezível (< 1 centavo) */
  reconciliado: boolean;
}

const USD_PEGGED = ["USD", "USDT", "USDC"];

function mesmaMoeda(a: string, b: string): boolean {
  if (a === b) return true;
  return USD_PEGGED.includes(a) && USD_PEGGED.includes(b);
}

export function calcularReconciliacaoResultado(
  input: ReconciliacaoInput
): ReconciliacaoResultado {
  const {
    operacionalHistorico,
    operacionalPorMoeda,
    eventosDiferenca,
    saldosPorMoeda,
    lucroRealizadoFluxo,
    moedaConsolidacao,
    convertToConsolidation,
  } = input;

  const dest = (moedaConsolidacao || "BRL").toUpperCase();

  // 1) Reavaliação cambial: mesmo resultado operacional, avaliado à cotação de hoje.
  //    Só moedas diferentes da consolidação produzem variação.
  let operacionalAtual = 0;
  const deltaPorMoeda: { moeda: string; peso: number }[] = [];

  for (const [moedaRaw, valorRaw] of Object.entries(operacionalPorMoeda || {})) {
    const moeda = (moedaRaw || "BRL").toUpperCase();
    const valor = Number(valorRaw) || 0;
    const convertido = mesmaMoeda(moeda, dest) ? valor : convertToConsolidation(valor, moeda);
    operacionalAtual += convertido;
    if (!mesmaMoeda(moeda, dest)) {
      deltaPorMoeda.push({ moeda, peso: Math.abs(convertido) });
    }
  }

  const cambialTotal = operacionalAtual - operacionalHistorico;

  // 2) Separação realizado × não realizado.
  //    A parcela ainda mantida em moeda estrangeira (saldo na casa) é marcação
  //    NÃO REALIZADA; o restante já foi convertido/sacado → REALIZADO.
  const saldoPorMoedaMap = new Map<string, number>();
  (saldosPorMoeda || []).forEach((s) => {
    const m = (s.moeda || "BRL").toUpperCase();
    saldoPorMoedaMap.set(m, (saldoPorMoedaMap.get(m) || 0) + (Number(s.saldo) || 0));
  });

  const pesoTotal = deltaPorMoeda.reduce((acc, d) => acc + d.peso, 0);
  let cambialNaoRealizado = 0;

  if (pesoTotal > 0) {
    for (const d of deltaPorMoeda) {
      const parcela = cambialTotal * (d.peso / pesoTotal);
      const saldoAberto = Math.max(0, saldoPorMoedaMap.get(d.moeda) || 0);
      const exposicaoOperacional = Math.abs(Number(operacionalPorMoeda[d.moeda]) || 0);
      const fracaoAberta =
        exposicaoOperacional > 0 ? Math.min(1, saldoAberto / exposicaoOperacional) : 0;
      cambialNaoRealizado += parcela * fracaoAberta;
    }
  }

  const cambialRealizado = cambialTotal - cambialNaoRealizado;

  // 3) Outros resultados financeiros: diferenças de recebimento (mesma moeda).
  let outrosFinanceiros = 0;
  for (const ev of eventosDiferenca || []) {
    const natureza = classificarDiferencaConciliacao({
      moeda: ev.moeda,
      moedaContraparte: ev.moedaContraparte,
    });
    const sinal = ev.tipo_transacao === "PERDA_CAMBIAL" ? -1 : 1;
    const valorConsolidado = mesmaMoeda((ev.moeda || "BRL").toUpperCase(), dest)
      ? Number(ev.valor) || 0
      : convertToConsolidation(Number(ev.valor) || 0, ev.moeda || "BRL");

    if (natureza === "DIFERENCA_RECEBIMENTO") {
      outrosFinanceiros += sinal * valorConsolidado;
    } else {
      // Câmbio de fato realizado na conciliação (troca de moeda).
      outrosFinanceiros += 0;
    }
  }

  // Eventos de diferença com troca real de moeda entram no resultado cambial realizado.
  let cambialDeConciliacao = 0;
  for (const ev of eventosDiferenca || []) {
    const natureza = classificarDiferencaConciliacao({
      moeda: ev.moeda,
      moedaContraparte: ev.moedaContraparte,
    });
    if (natureza !== "RESULTADO_CAMBIAL") continue;
    const sinal = ev.tipo_transacao === "PERDA_CAMBIAL" ? -1 : 1;
    const valorConsolidado = mesmaMoeda((ev.moeda || "BRL").toUpperCase(), dest)
      ? Number(ev.valor) || 0
      : convertToConsolidation(Number(ev.valor) || 0, ev.moeda || "BRL");
    cambialDeConciliacao += sinal * valorConsolidado;
  }

  const cambialRealizadoTotal = cambialRealizado + cambialDeConciliacao;
  const cambialConsolidado = cambialRealizadoTotal + cambialNaoRealizado;

  const somaComponentes =
    operacionalHistorico + cambialConsolidado + outrosFinanceiros;
  const residuo = lucroRealizadoFluxo - somaComponentes;

  return {
    operacional: operacionalHistorico,
    cambialRealizado: cambialRealizadoTotal,
    cambialNaoRealizado,
    cambialTotal: cambialConsolidado,
    outrosFinanceiros,
    somaComponentes,
    lucroRealizado: lucroRealizadoFluxo,
    residuo,
    reconciliado: Math.abs(residuo) < 0.01,
  };
}
