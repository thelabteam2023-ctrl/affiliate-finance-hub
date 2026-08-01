import { useCallback } from "react";
import { SupportedCurrency, CURRENCY_SYMBOLS, isCryptoCurrency } from "@/types/currency";

/**
 * Hook utilitário para formatação de valores multi-moeda
 * Usa o tipo de moeda correto baseado em tipo_moeda e moeda do registro
 */

export interface CurrencyFormatOptions {
  showSymbol?: boolean;
  decimals?: number;
  compact?: boolean;
}

export interface TransacaoMoeda {
  tipo_moeda?: string;
  moeda?: string;
  valor: number;
  valor_usd?: number | null;
}

/**
 * Pernas de uma movimentação CRYPTO.
 *
 * REGRA: a cripto é apenas o MEIO de transferência. O impacto financeiro real
 * é sempre o valor na moeda operacional (moeda da casa / conta fiat envolvida).
 * Por isso o valor "efetivo" prioriza SEMPRE a perna FIAT (moeda_origem ou
 * moeda_destino ou `moeda`), caindo para USD (snapshot `valor_usd`) apenas
 * quando as duas pontas são cripto.
 */
export interface CryptoLegs {
  /** Moeda operacional (fiat) da operação */
  moedaFiat: string;
  /** Valor na moeda operacional */
  valorFiat: number;
  /** true quando o valor fiat veio do snapshot USD (sem perna fiat explícita) */
  fiatFromUsdSnapshot: boolean;
  /** Quantidade da cripto movimentada */
  qtdCoin: number | null;
  coin: string | null;
  /** Cotação aplicada no momento da operação (fiat por unidade de coin) */
  cotacao: number | null;
}

type LedgerLike = TransacaoMoeda & {
  coin?: string | null;
  qtd_coin?: number | null;
  cotacao?: number | null;
  valor_usd_referencia?: number | null;
  moeda_origem?: string | null;
  valor_origem?: number | null;
  moeda_destino?: string | null;
  valor_destino?: number | null;
};

function isFiat(m?: string | null): boolean {
  return !!m && !isCryptoCurrency(m);
}

export function getCryptoLegs(tx: LedgerLike): CryptoLegs {
  const coin = (tx.coin || null) as string | null;

  // 1) Perna FIAT — prioridade origem > destino > moeda base
  let moedaFiat: string | null = null;
  let valorFiat: number | null = null;
  if (isFiat(tx.moeda_origem) && tx.valor_origem != null) {
    moedaFiat = tx.moeda_origem!;
    valorFiat = Number(tx.valor_origem);
  } else if (isFiat(tx.moeda_destino) && tx.valor_destino != null) {
    moedaFiat = tx.moeda_destino!;
    valorFiat = Number(tx.valor_destino);
  } else if (isFiat(tx.moeda)) {
    moedaFiat = tx.moeda!;
    valorFiat = Number(tx.valor ?? 0);
  }

  let fiatFromUsdSnapshot = false;
  if (moedaFiat == null || valorFiat == null || !Number.isFinite(valorFiat)) {
    // 2) Fallback: snapshot em USD (cripto → cripto)
    moedaFiat = "USD";
    valorFiat = Number(tx.valor_usd ?? tx.valor_usd_referencia ?? tx.valor ?? 0);
    fiatFromUsdSnapshot = true;
  }

  // 3) Quantidade da cripto
  let qtdCoin: number | null = tx.qtd_coin != null ? Number(tx.qtd_coin) : null;
  if (qtdCoin == null) {
    if (coin && tx.moeda_destino === coin && tx.valor_destino != null) qtdCoin = Number(tx.valor_destino);
    else if (coin && tx.moeda_origem === coin && tx.valor_origem != null) qtdCoin = Number(tx.valor_origem);
    else if (coin && tx.moeda === coin) qtdCoin = Number(tx.valor ?? 0);
  }

  // 4) Cotação aplicada (fiat por unidade de coin)
  let cotacao: number | null = tx.cotacao != null ? Number(tx.cotacao) : null;
  if ((cotacao == null || !Number.isFinite(cotacao) || cotacao <= 0) && qtdCoin && valorFiat) {
    cotacao = Math.abs(valorFiat) / Math.abs(qtdCoin);
  }

  return {
    moedaFiat,
    valorFiat: Number(valorFiat) || 0,
    fiatFromUsdSnapshot,
    qtdCoin: qtdCoin != null && Number.isFinite(qtdCoin) ? qtdCoin : null,
    coin,
    cotacao: cotacao != null && Number.isFinite(cotacao) && cotacao > 0 ? cotacao : null,
  };
}

/**
 * Retorna o valor correto baseado no tipo de moeda
 * CRYPTO usa valor_usd (dolarizado), FIAT usa valor direto
 */
export function getValorEfetivo(transacao: LedgerLike): number {
  if (transacao.tipo_moeda === "CRYPTO") {
    return getCryptoLegs(transacao).valorFiat;
  }
  return transacao.valor;
}

/**
 * Retorna a moeda efetiva da transação
 * CRYPTO com conversão cross-currency = moeda destino, senão USD
 * FIAT = moeda original (geralmente BRL)
 */
export function getMoedaEfetiva(transacao: LedgerLike): string {
  if (transacao.tipo_moeda === "CRYPTO") {
    return getCryptoLegs(transacao).moedaFiat;
  }
  return transacao.moeda || "BRL";
}

/**
 * Formata um valor com a moeda correta
 */
export function formatCurrencyDynamic(
  valor: number,
  moeda: string = "BRL",
  options?: CurrencyFormatOptions
): string {
  const { showSymbol = true, decimals = 2, compact = false } = options || {};
  // Normalize floating-point noise
  const safeValor = Math.abs(valor) < 0.005 ? 0 : valor;
  
  const symbol = CURRENCY_SYMBOLS[moeda as SupportedCurrency] || moeda;
  
  let formatted: string;
  
  if (compact && Math.abs(safeValor) >= 1000) {
    if (Math.abs(safeValor) >= 1000000) {
      formatted = (safeValor / 1000000).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + "M";
    } else {
      formatted = (safeValor / 1000).toLocaleString("pt-BR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + "K";
    }
  } else {
    formatted = safeValor.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  
  return showSymbol ? `${symbol} ${formatted}` : formatted;
}

/**
 * Interface para saldos separados por tipo de moeda
 */
export interface SaldosSeparados {
  brl: number;
  usd: number; // Inclui CRYPTO convertido para USD
  total_brl_estimado: number; // BRL + USD convertido (para exibição)
}

/**
 * Agrupa transações por tipo de moeda e calcula saldos separados
 */
export function calcularSaldosSeparados(
  transacoes: TransacaoMoeda[],
  cotacaoUSD: number = 5.0
): SaldosSeparados {
  let totalBRL = 0;
  let totalUSD = 0;

  transacoes.forEach((t) => {
    if (t.tipo_moeda === "CRYPTO") {
      // CRYPTO é contabilizado em USD
      totalUSD += t.valor_usd ?? 0;
    } else {
      // FIAT é contabilizado na moeda original
      if (t.moeda === "USD") {
        totalUSD += t.valor;
      } else {
        // BRL ou outras moedas FIAT
        totalBRL += t.valor;
      }
    }
  });

  return {
    brl: totalBRL,
    usd: totalUSD,
    total_brl_estimado: totalBRL + (totalUSD * cotacaoUSD),
  };
}

/**
 * Hook para usar formatação multi-moeda em componentes
 */
export function useMultiCurrencyFormat() {
  const formatValue = useCallback(
    (valor: number, moeda: string = "BRL", options?: CurrencyFormatOptions) => {
      return formatCurrencyDynamic(valor, moeda, options);
    },
    []
  );

  const formatTransacao = useCallback(
    (transacao: TransacaoMoeda, options?: CurrencyFormatOptions) => {
      const valor = getValorEfetivo(transacao);
      const moeda = getMoedaEfetiva(transacao);
      return formatCurrencyDynamic(valor, moeda, options);
    },
    []
  );

  const getTransacaoInfo = useCallback((transacao: TransacaoMoeda) => {
    return {
      valor: getValorEfetivo(transacao),
      moeda: getMoedaEfetiva(transacao),
      isCrypto: transacao.tipo_moeda === "CRYPTO",
    };
  }, []);

  return {
    formatValue,
    formatTransacao,
    getTransacaoInfo,
    calcularSaldosSeparados,
  };
}
