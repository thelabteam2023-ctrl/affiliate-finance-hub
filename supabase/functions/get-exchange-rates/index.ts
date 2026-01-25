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
 * Nova hierarquia: FastForex (primário) → PTAX (fallback para USD/EUR/GBP) → Hardcoded
 * 
 * Todas as moedas usam FastForex como fonte primária
 * USD, EUR, GBP têm PTAX como segunda opção de fallback
 * Fallback hardcoded é a terceira opção
 */
/**
 * Moedas suportadas com fallbacks atualizados (última atualização: 2026-01-22)
 * IMPORTANTE: Estes valores devem estar sincronizados com src/constants/exchangeRates.ts
 */
const CURRENCIES = {
  USD: { code: 'USD', fallback: 5.32, useDolarDia: true, hasPTAX: true },
  EUR: { code: 'EUR', fallback: 6.21, useDolarDia: false, hasPTAX: true },
  GBP: { code: 'GBP', fallback: 7.14, useDolarDia: false, hasPTAX: true },
  MYR: { code: 'MYR', fallback: 1.32, useDolarDia: false, hasPTAX: false },
  MXN: { code: 'MXN', fallback: 0.304, useDolarDia: false, hasPTAX: false },  // Atualizado de 0.26
  ARS: { code: 'ARS', fallback: 0.0037, useDolarDia: false, hasPTAX: false },
  COP: { code: 'COP', fallback: 0.00145, useDolarDia: false, hasPTAX: false },
} as const;

type CurrencyKey = keyof typeof CURRENCIES;

// TTL do cache: 30 minutos - refresh frequente dentro do limite do plano
const CACHE_TTL_MINUTES = 30;

/**
 * Cria cliente Supabase com service role para acessar o cache
 */
function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
}

/**
 * Busca cotações do cache no banco de dados
 */
async function getCachedRates(): Promise<Record<string, { rate: number; source: string; expires_at: string }>> {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('exchange_rate_cache')
    .select('currency_pair, rate, source, expires_at');
  
  if (error) {
    console.error('Erro ao buscar cache:', error);
    return {};
  }
  
  const cached: Record<string, { rate: number; source: string; expires_at: string }> = {};
  for (const row of data || []) {
    cached[row.currency_pair] = { 
      rate: Number(row.rate), 
      source: row.source,
      expires_at: row.expires_at,
    };
  }
  
  if (Object.keys(cached).length > 0) {
    console.log(`Cache encontrado: ${Object.keys(cached).join(', ')}`);
  }
  
  return cached;
}

/**
 * Salva cotações no cache do banco de dados
 */
async function saveCachedRates(rates: Record<string, { rate: number; source: string }>) {
  const supabase = getSupabaseClient();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MINUTES * 60 * 1000);
  
  const upserts = Object.entries(rates).map(([currencyPair, data]) => ({
    currency_pair: currencyPair,
    rate: data.rate,
    source: data.source,
    fetched_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    updated_at: now.toISOString(),
  }));
  
  const { error } = await supabase
    .from('exchange_rate_cache')
    .upsert(upserts, { onConflict: 'currency_pair' });
  
  if (error) {
    console.error('Erro ao salvar cache:', error);
  } else {
    console.log(`Cache salvo: ${Object.keys(rates).length} cotações (expira em ${CACHE_TTL_MINUTES}min)`);
  }
}

/**
 * Busca cotações via FastForex API para TODAS as moedas (fonte primária)
 */
async function fetchFastForexRates(): Promise<Record<string, number>> {
  const apiKey = Deno.env.get('FASTFOREX_API_KEY');
  
  if (!apiKey) {
    console.log('FastForex API key não configurada - tentando PTAX como fallback');
    return {};
  }

  try {
    // Buscar TODAS as moedas via FastForex (fonte primária unificada)
    const currencies = 'USD,EUR,GBP,MYR,MXN,ARS,COP';
    const url = `https://api.fastforex.io/fetch-multi?from=BRL&to=${currencies}&api_key=${apiKey}`;
    
    console.log('Buscando cotações FastForex (fonte primária)...');
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('FastForex erro:', response.status, errorText);
      return {};
    }

    const data = await response.json();

    if (data.error) {
      console.error('FastForex API error:', data.error);
      return {};
    }

    const rates: Record<string, number> = {};
    
    if (data.results) {
      for (const [currency, rate] of Object.entries(data.results)) {
        if (typeof rate === 'number' && rate > 0) {
          rates[`${currency}BRL`] = 1 / rate;
          console.log(`FastForex ${currency}/BRL: ${rates[`${currency}BRL`].toFixed(4)}`);
        }
      }
    }
    
    console.log(`FastForex: ${Object.keys(rates).length} cotações obtidas (fonte primária)`);
    return rates;

  } catch (error) {
    console.error('Erro ao buscar FastForex:', error);
    return {};
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching exchange rates');

    // 1. Verificar cache no banco de dados
    // IMPORTANTE: mesmo se o cache estiver expirado, ainda retornamos o último valor
    // para evitar cair em fallback hardcoded quando houver instabilidade momentânea.
    const cachedRates = await getCachedRates();
    const allCurrencies = Object.keys(CURRENCIES);
    const nowIso = new Date().toISOString();

    const currenciesToRefresh = allCurrencies.filter((c) => {
      const entry = cachedRates[`${c}BRL`];
      return !entry || entry.expires_at <= nowIso;
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

    // 2. FONTE PRIMÁRIA: FastForex para TODAS as moedas que precisam de refresh
    if (currenciesToRefresh.length > 0) {
      console.log('Buscando FastForex (fonte primária) para:', currenciesToRefresh.join(', '));
      const fastForexRates = await fetchFastForexRates();
      
      for (const currency of currenciesToRefresh) {
        const rateKey = `${currency}BRL`;
        if (fastForexRates[rateKey]) {
          rates[rateKey] = fastForexRates[rateKey];
          newRatesToCache[rateKey] = { rate: fastForexRates[rateKey], source: 'FASTFOREX' };
        }
      }
    }

    // 3. FALLBACK SECUNDÁRIO: PTAX para USD, EUR, GBP que ainda precisavam de refresh
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
           // Se FastForex já atualizou, não precisa tentar PTAX
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
      await saveCachedRates(newRatesToCache);
    }

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
