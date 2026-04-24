import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-workspace-id',
};

// Formata data para MM-DD-YYYY (formato do BCB)
function formatDateBCB(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
}

/**
 * Moedas suportadas pelo sistema
 * Hierarquia: Binance (primário) → PTAX (fallback para USD/EUR/GBP) → Hardcoded
 * 
 * Binance fornece pares USDT: USDTBRL, USDTMXN, USDTARS, USDTCOP
 * MYR não tem par direto na Binance, usa derivação ou fallback
 * USD, EUR, GBP têm PTAX como segunda opção de fallback
 */
const CURRENCIES = {
  USD: { code: 'USD', fallback: 5.32, useDolarDia: true, hasPTAX: true, binancePair: 'USDTBRL' },
  EUR: { code: 'EUR', fallback: 6.21, useDolarDia: false, hasPTAX: true, binancePair: null },
  GBP: { code: 'GBP', fallback: 7.14, useDolarDia: false, hasPTAX: true, binancePair: null },
  MYR: { code: 'MYR', fallback: 1.262, useDolarDia: false, hasPTAX: false, binancePair: null },
  MXN: { code: 'MXN', fallback: 0.29, useDolarDia: false, hasPTAX: false, binancePair: 'USDTMXN' },
  ARS: { code: 'ARS', fallback: 0.0034, useDolarDia: false, hasPTAX: false, binancePair: 'USDTARS' },
  COP: { code: 'COP', fallback: 0.00138, useDolarDia: false, hasPTAX: false, binancePair: 'USDTCOP' },
} as const;

type CurrencyKey = keyof typeof CURRENCIES;

// TTL do cache: 30 minutos
const CACHE_TTL_MINUTES = 30;

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

type CachedRate = {
  rate: number;
  source: string;
  expires_at: string;
  fetched_at?: string;
  failure_count?: number;
};

async function getCachedRates(): Promise<Record<string, CachedRate>> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('exchange_rate_cache')
    .select('currency_pair, rate, source, fetched_at, expires_at, failure_count');
  
  if (error) {
    console.error('Erro ao buscar cache:', error);
    return {};
  }
  
  const cached: Record<string, CachedRate> = {};
  for (const row of data || []) {
    cached[row.currency_pair] = { 
      rate: Number(row.rate), 
      source: row.source,
      fetched_at: row.fetched_at,
      expires_at: row.expires_at,
      failure_count: Number(row.failure_count || 0),
    };
  }
  
  if (Object.keys(cached).length > 0) {
    console.log(`Cache encontrado: ${Object.keys(cached).join(', ')}`);
  }
  
  return cached;
}

function getCacheStatus(lastSuccessAt: Date): string {
  const ageHours = (Date.now() - lastSuccessAt.getTime()) / (60 * 60 * 1000);
  if (ageHours > 24) return 'critical';
  if (ageHours > 12) return 'degraded';
  if (ageHours > 2) return 'stale';
  return 'active';
}

async function saveCachedRates(rates: Record<string, { rate: number; source: string }>, refreshReason: string) {
  const supabase = getSupabaseClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MINUTES * 60 * 1000);
  
  const upserts = Object.entries(rates).map(([currencyPair, data]) => ({
    currency_pair: currencyPair,
    rate: data.rate,
    source: data.source,
    fetched_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    status: 'active',
    failure_count: 0,
    last_success_at: now.toISOString(),
    last_error_at: null,
    last_error_message: null,
    updated_at: now.toISOString(),
  }));

  const historyRows = Object.entries(rates).map(([currencyPair, data]) => ({
    currency_pair: currencyPair,
    rate: data.rate,
    source: data.source,
    fetched_at: now.toISOString(),
    refresh_reason: refreshReason,
    is_fallback: data.source.includes('FALLBACK'),
  }));
  
  const { error } = await supabase
    .from('exchange_rate_cache')
    .upsert(upserts, { onConflict: 'currency_pair' });
  
  if (error) {
    console.error('Erro ao salvar cache:', error);
  } else {
    console.log(`Cache salvo: ${Object.keys(rates).length} cotações (expira em ${CACHE_TTL_MINUTES}min)`);
  }

  const { error: historyError } = await supabase
    .from('exchange_rate_history')
    .insert(historyRows);

  if (historyError) {
    console.error('Erro ao salvar histórico de cotações:', historyError);
  }
}

async function markRefreshFailures(currencyPairs: string[], cachedRates: Record<string, CachedRate>, message: string) {
  if (currencyPairs.length === 0) return;

  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  await Promise.all(currencyPairs.map(async (currencyPair) => {
    const cached = cachedRates[currencyPair];
    if (!cached) return;

    const lastSuccess = cached.fetched_at ? new Date(cached.fetched_at) : new Date();
    const { error } = await supabase
      .from('exchange_rate_cache')
      .update({
        status: getCacheStatus(lastSuccess),
        failure_count: (cached.failure_count || 0) + 1,
        last_error_at: nowIso,
        last_error_message: message,
      })
      .eq('currency_pair', currencyPair);

    if (error) console.error(`Erro ao marcar falha em ${currencyPair}:`, error);
  }));
}

/**
 * Busca cotações via Binance (pares USDT)
 * Retorna taxas MOEDA/BRL derivadas de USDTBRL e USDTMOEDA
 */
async function fetchBinanceRates(): Promise<Record<string, number>> {
  try {
    // Buscar todos os pares de preço da Binance
    const url = 'https://api.binance.com/api/v3/ticker/price';
    console.log('Buscando cotações Binance (fonte primária)...');
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error('Binance erro:', response.status);
      return {};
    }

    const data = await response.json();
    
    // Indexar por símbolo
    const priceMap: Record<string, number> = {};
    for (const item of data) {
      priceMap[item.symbol] = parseFloat(item.price);
    }

    const rates: Record<string, number> = {};
    
    // USDTBRL é a base para derivar todas as outras
    const usdtBrl = priceMap['USDTBRL'];
    if (!usdtBrl || usdtBrl <= 0) {
      console.error('Binance: USDTBRL não encontrado');
      return {};
    }

    // USD/BRL = USDTBRL (USDT ≈ USD)
    rates['USDBRL'] = usdtBrl;
    console.log(`Binance USD/BRL: ${usdtBrl.toFixed(4)}`);

    // Para moedas com par USDT na Binance, derivar via cross-rate
    // MXN/BRL = USDTBRL / USDTMXN
    const crossPairs: Record<string, string> = {
      MXN: 'USDTMXN',
      ARS: 'USDTARS',
      COP: 'USDTCOP',
    };

    for (const [currency, pair] of Object.entries(crossPairs)) {
      const usdtRate = priceMap[pair];
      if (usdtRate && usdtRate > 0) {
        const crossRate = usdtBrl / usdtRate;
        rates[`${currency}BRL`] = crossRate;
        console.log(`Binance ${currency}/BRL: ${crossRate.toFixed(6)} (via ${pair}=${usdtRate})`);
      }
    }

    // EUR e GBP: Binance tem EURUSDT e GBPUSDT (invertidos: 1 EUR = X USDT)
    const eurUsdt = priceMap['EURUSDT'];
    if (eurUsdt && eurUsdt > 0) {
      rates['EURBRL'] = eurUsdt * usdtBrl;
      console.log(`Binance EUR/BRL: ${rates['EURBRL'].toFixed(4)} (via EURUSDT=${eurUsdt})`);
    }

    const gbpUsdt = priceMap['GBPUSDT'];
    if (gbpUsdt && gbpUsdt > 0) {
      rates['GBPBRL'] = gbpUsdt * usdtBrl;
      console.log(`Binance GBP/BRL: ${rates['GBPBRL'].toFixed(4)} (via GBPUSDT=${gbpUsdt})`);
    }

    console.log(`Binance: ${Object.keys(rates).length} cotações obtidas`);
    return rates;

  } catch (error) {
    console.error('Erro ao buscar Binance:', error);
    return {};
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching exchange rates');

    const requestBody = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const refreshReason = typeof requestBody?.reason === 'string' ? requestBody.reason : 'on_demand';
    const forceRefresh = requestBody?.forceRefresh === true;

    // 1. Verificar cache no banco de dados
    const cachedRates = await getCachedRates();
    const allCurrencies = Object.keys(CURRENCIES);
    const nowIso = new Date().toISOString();

    const currenciesToRefresh = allCurrencies.filter((c) => {
      const entry = cachedRates[`${c}BRL`];
      return forceRefresh || !entry || entry.expires_at <= nowIso;
    });
    
    // Se temos todas as moedas em cache válido, retornar direto
    if (currenciesToRefresh.length === 0) {
      console.log('Todas as cotações em cache válido');
      const finalRates: Record<string, number | null> = {};
      const sources: Record<string, string> = {};
      
      for (const [key] of Object.entries(CURRENCIES)) {
        const rateKey = `${key}BRL`;
        const cachedData = cachedRates[rateKey];
        finalRates[rateKey] = cachedData?.rate ?? null;
        sources[key] = cachedData ? cachedData.source + '_CACHE' : 'CACHE';
      }
      
      return new Response(
        JSON.stringify({ 
          ...finalRates,
          timestamp: new Date().toISOString(),
          source: 'cache',
          sources,
          fromCache: true
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log(`Moedas para refresh (expiradas/ausentes): ${currenciesToRefresh.join(', ')}`);

    const today = new Date();
    const rates: Record<string, number | null> = {};
    const newRatesToCache: Record<string, { rate: number; source: string }> = {};
    
    // Usar cache existente (mesmo expirado) como base
    for (const [key, data] of Object.entries(cachedRates)) {
      rates[key] = data.rate;
    }

    // 2. FONTE PRIMÁRIA: Binance para TODAS as moedas que precisam de refresh
    if (currenciesToRefresh.length > 0) {
      console.log('Buscando Binance (fonte primária) para:', currenciesToRefresh.join(', '));
      const binanceRates = await fetchBinanceRates();
      
      for (const currency of currenciesToRefresh) {
        const rateKey = `${currency}BRL`;
        if (binanceRates[rateKey]) {
          rates[rateKey] = binanceRates[rateKey];
          newRatesToCache[rateKey] = { rate: binanceRates[rateKey], source: 'BINANCE' };
        }
      }
    }

    // 3. FALLBACK SECUNDÁRIO: PTAX para USD, EUR, GBP que ainda faltam
    const ptaxCurrencies = Object.entries(CURRENCIES)
      .filter(([key, config]) => config.hasPTAX && currenciesToRefresh.includes(key) && !newRatesToCache[`${key}BRL`])
      .map(([key, config]) => ({ key, config }));

    if (ptaxCurrencies.length > 0) {
      console.log('Buscando PTAX (fallback) para:', ptaxCurrencies.map(p => p.key).join(', '));
      
      for (let i = 0; i < 5; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = formatDateBCB(checkDate);
        
        for (const { key, config } of ptaxCurrencies) {
           const rateKey = `${key}BRL`;
           if (newRatesToCache[rateKey]) continue;

          try {
            let url: string;
            
            if (config.useDolarDia) {
              url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`;
            } else {
              url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='${config.code}'&@dataInicial='${dateStr}'&@dataFinalCotacao='${dateStr}'&$format=json`;
            }

            const response = await fetch(url);
            
            if (response.ok) {
              const data = await response.json();
              if (data.value && data.value.length > 0) {
                const rate = data.value[data.value.length - 1].cotacaoVenda;
                 rates[rateKey] = rate;
                 newRatesToCache[rateKey] = { rate, source: 'PTAX_FALLBACK' };
                console.log(`PTAX (fallback) ${key}/BRL: ${rate}`);
              }
            }
          } catch (e) {
            console.error(`Erro BCB ${key}:`, e);
          }
        }

        const allPtaxFetched = ptaxCurrencies.every(({ key }) => rates[`${key}BRL`] !== null && rates[`${key}BRL`] !== undefined);
        if (allPtaxFetched) break;
      }
    }

    // 4. Salvar novas cotações no cache
    if (Object.keys(newRatesToCache).length > 0) {
      await saveCachedRates(newRatesToCache, refreshReason);
    }

    const unresolvedPairs = currenciesToRefresh
      .map((currency) => `${currency}BRL`)
      .filter((rateKey) => !newRatesToCache[rateKey] && cachedRates[rateKey]);
    await markRefreshFailures(unresolvedPairs, cachedRates, 'Fontes externas indisponíveis; mantendo última cotação válida conhecida.');

    // 5. Preparar resposta final
    const finalRates: Record<string, number | null> = {};
    const sources: Record<string, string> = {};
    
     for (const [key, config] of Object.entries(CURRENCIES)) {
      const rateKey = `${key}BRL`;

      if (rates[rateKey]) {
        finalRates[rateKey] = rates[rateKey];
        if (newRatesToCache[rateKey]) {
          sources[key] = newRatesToCache[rateKey].source;
        } else if (cachedRates[rateKey]) {
          sources[key] = cachedRates[rateKey].source + '_CACHE';
        } else {
          sources[key] = 'INDISPONIVEL';
        }
      } else if (config.fallback) {
        finalRates[rateKey] = config.fallback;
        sources[key] = 'FALLBACK';
      } else {
        finalRates[rateKey] = null;
        sources[key] = 'INDISPONIVEL';
      }
    }

    const cacheCount = Object.entries(sources).filter(([_, s]) => s.includes('CACHE')).length;
    const freshCount = Object.keys(newRatesToCache).length;
    console.log(`Resumo: ${cacheCount} do cache, ${freshCount} novas`);

    return new Response(
      JSON.stringify({ 
        ...finalRates,
        timestamp: new Date().toISOString(),
        source: 'multi-source',
        sources,
        fromCache: cacheCount > 0,
        freshFetched: freshCount
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in get-exchange-rates function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    const fallbackRates: Record<string, number | null> = {};
    const sources: Record<string, string> = {};
    
    for (const [key, config] of Object.entries(CURRENCIES)) {
      fallbackRates[`${key}BRL`] = config.fallback;
      sources[key] = 'FALLBACK_ERRO';
    }
    
    return new Response(
      JSON.stringify({ 
        ...fallbackRates,
        timestamp: new Date().toISOString(),
        source: 'fallback',
        sources,
        error: errorMessage
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
