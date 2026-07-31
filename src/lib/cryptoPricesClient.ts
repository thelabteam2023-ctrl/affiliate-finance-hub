/**
 * Cliente resiliente de cotações cripto (Binance via edge function `get-crypto-prices`).
 *
 * PROBLEMA QUE RESOLVE:
 * Cada consumidor (CaixaTransacaoDialog, SaldosParceirosSheet, ExchangeRatesContext)
 * chamava `supabase.functions.invoke("get-crypto-prices")` diretamente, sem retry,
 * sem cache compartilhado e sem reaproveitar a última cotação válida. Qualquer falha
 * transitória (rede, cold start da função, aba em background, refresh de sessão)
 * virava um toast vermelho — mesmo com cotações válidas de segundos atrás.
 *
 * ESTRATÉGIA DE RESILIÊNCIA:
 * 1. Retry automático com backoff exponencial (padrão: 3 tentativas).
 * 2. Cache em memória da ÚLTIMA cotação válida por símbolo (com idade).
 * 3. Degradação graciosa: em falha, devolve o cache com `stale: true` em vez de vazio.
 * 4. Deduplicação: chamadas concorrentes para o mesmo conjunto reaproveitam a promise.
 * 5. Log estruturado de cada falha para diagnóstico posterior.
 */

import { supabase } from "@/integrations/supabase/client";

export interface CryptoPricesResult {
  prices: Record<string, number>;
  /** true = veio do cache local porque a API falhou */
  stale: boolean;
  /** Idade do dado em ms (0 quando fresco) */
  ageMs: number;
  /** Falhou E não havia cache algum para reaproveitar */
  failedWithoutCache: boolean;
  error?: string;
}

interface CacheEntry {
  price: number;
  fetchedAt: number;
}

const priceCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<CryptoPricesResult>>();

/** Histórico curto de falhas — usado para diagnóstico no console/DevTools. */
export const cryptoPricesDiagnostics: Array<{
  at: string;
  symbols: string[];
  attempt: number;
  error: string;
}> = [];

const MAX_DIAGNOSTICS = 20;

function recordFailure(symbols: string[], attempt: number, error: unknown) {
  const entry = {
    at: new Date().toISOString(),
    symbols,
    attempt,
    error: error instanceof Error ? error.message : String(error),
  };
  cryptoPricesDiagnostics.unshift(entry);
  if (cryptoPricesDiagnostics.length > MAX_DIAGNOSTICS) cryptoPricesDiagnostics.pop();
  console.warn("[cryptoPricesClient] falha na cotação cripto", entry);
}

function readCache(symbols: string[]): { prices: Record<string, number>; ageMs: number; hits: number } {
  const prices: Record<string, number> = {};
  let oldest = 0;
  let hits = 0;
  const now = Date.now();
  for (const symbol of symbols) {
    const cached = priceCache.get(symbol);
    if (cached) {
      prices[symbol] = cached.price;
      hits += 1;
      oldest = Math.max(oldest, now - cached.fetchedAt);
    }
  }
  return { prices, ageMs: oldest, hits };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface FetchCryptoPricesOptions {
  /** Número total de tentativas (default 3). */
  retries?: number;
  /** Delay base do backoff em ms (default 600). */
  backoffMs?: number;
}

/**
 * Busca cotações cripto com retry + fallback para a última cotação válida.
 * NUNCA lança: sempre devolve um resultado descrevendo o estado real dos dados.
 */
export async function fetchCryptoPricesResilient(
  symbols: string[],
  options: FetchCryptoPricesOptions = {}
): Promise<CryptoPricesResult> {
  const uniqueSymbols = [...new Set(symbols)].filter(Boolean).sort();
  if (uniqueSymbols.length === 0) {
    return { prices: {}, stale: false, ageMs: 0, failedWithoutCache: false };
  }

  const key = uniqueSymbols.join(",");
  const existing = inflight.get(key);
  if (existing) return existing;

  const { retries = 3, backoffMs = 600 } = options;

  const run = (async (): Promise<CryptoPricesResult> => {
    let lastError: unknown = null;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const { data, error } = await supabase.functions.invoke("get-crypto-prices", {
          body: { symbols: uniqueSymbols },
        });

        if (error) throw error;
        if (!data?.prices || typeof data.prices !== "object") {
          throw new Error("Resposta sem campo `prices`");
        }

        const now = Date.now();
        const prices: Record<string, number> = {};
        for (const [symbol, value] of Object.entries(data.prices as Record<string, unknown>)) {
          const price = Number(value);
          if (Number.isFinite(price) && price > 0) {
            prices[symbol] = price;
            priceCache.set(symbol, { price, fetchedAt: now });
          }
        }

        return { prices, stale: false, ageMs: 0, failedWithoutCache: false };
      } catch (err) {
        lastError = err;
        recordFailure(uniqueSymbols, attempt, err);
        if (attempt < retries) {
          await sleep(backoffMs * Math.pow(2, attempt - 1));
        }
      }
    }

    // Todas as tentativas falharam → reaproveitar última cotação válida
    const cache = readCache(uniqueSymbols);
    const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);

    if (cache.hits > 0) {
      console.warn(
        `[cryptoPricesClient] usando última cotação válida (${Math.round(cache.ageMs / 1000)}s de idade)`
      );
      return {
        prices: cache.prices,
        stale: true,
        ageMs: cache.ageMs,
        failedWithoutCache: false,
        error: errorMessage,
      };
    }

    return { prices: {}, stale: true, ageMs: 0, failedWithoutCache: true, error: errorMessage };
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

/** Última cotação conhecida de um símbolo (ou null). */
export function getCachedCryptoPrice(symbol: string): number | null {
  return priceCache.get(symbol)?.price ?? null;
}
