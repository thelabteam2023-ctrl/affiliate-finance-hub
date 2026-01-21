import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
 * 
 * PTAX disponível no BCB: USD, EUR, GBP
 * 
 * Moedas via FastForex (sem PTAX no BCB):
 * - MYR (Ringgit Malaio)
 * - MXN (Peso Mexicano)
 * - ARS (Peso Argentino)
 * - COP (Peso Colombiano)
 */
const CURRENCIES = {
  USD: { code: 'USD', fallback: null, useDolarDia: true, hasPTAX: true },
  EUR: { code: 'EUR', fallback: 6.10, useDolarDia: false, hasPTAX: true },
  GBP: { code: 'GBP', fallback: 7.10, useDolarDia: false, hasPTAX: true },
  // Moedas via FastForex
  MYR: { code: 'MYR', fallback: 1.20, useDolarDia: false, hasPTAX: false },
  MXN: { code: 'MXN', fallback: 0.26, useDolarDia: false, hasPTAX: false },
  ARS: { code: 'ARS', fallback: 0.005, useDolarDia: false, hasPTAX: false },
  COP: { code: 'COP', fallback: 0.0013, useDolarDia: false, hasPTAX: false },
} as const;

type CurrencyKey = keyof typeof CURRENCIES;

// Cache em memória (válido por instância da edge function)
let cachedFastForexRates: Record<string, number> | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 horas de cache

/**
 * Busca cotações via FastForex API
 * Converte de X/BRL para usar nas conversões
 */
async function fetchFastForexRates(): Promise<Record<string, number>> {
  const apiKey = Deno.env.get('FASTFOREX_API_KEY');
  
  if (!apiKey) {
    console.log('FastForex API key não configurada - usando fallback');
    return {};
  }

  // Verificar cache em memória
  const now = Date.now();
  if (cachedFastForexRates && (now - cacheTimestamp) < CACHE_TTL_MS) {
    console.log('Usando cache FastForex em memória');
    return cachedFastForexRates;
  }

  try {
    // Buscar cotação de BRL vs outras moedas
    // FastForex retorna: 1 BRL = X moedas estrangeiras
    // Precisamos inverter para: 1 moeda estrangeira = X BRL
    const currencies = 'MYR,MXN,ARS,COP,USD';
    const url = `https://api.fastforex.io/fetch-multi?from=BRL&to=${currencies}&api_key=${apiKey}`;
    
    console.log('Buscando cotações FastForex...');
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('FastForex erro:', response.status, errorText);
      return {};
    }

    const data = await response.json();
    console.log('FastForex resposta:', JSON.stringify(data));

    if (data.error) {
      console.error('FastForex API error:', data.error);
      return {};
    }

    const rates: Record<string, number> = {};
    
    // Precisamos inverter as taxas
    // FastForex retorna: 1 BRL = 0.18 USD (por exemplo)
    // Precisamos: 1 USD = 5.55 BRL
    if (data.results) {
      for (const [currency, rate] of Object.entries(data.results)) {
        if (typeof rate === 'number' && rate > 0) {
          // Inverter: 1/rate = quantos BRL por 1 unidade da moeda
          rates[`${currency}BRL`] = 1 / rate;
          console.log(`FastForex ${currency}/BRL: ${rates[`${currency}BRL`].toFixed(4)}`);
        }
      }
    }

    // Atualizar cache em memória
    cachedFastForexRates = rates;
    cacheTimestamp = now;
    
    console.log(`FastForex: ${Object.keys(rates).length} cotações obtidas`);
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
    console.log('Fetching exchange rates from Banco Central do Brasil');

    const today = new Date();
    const rates: Record<string, number | null> = {};
    
    // Inicializar todas as moedas como null
    Object.keys(CURRENCIES).forEach(key => {
      rates[`${key}BRL`] = null;
    });

    // Lista de moedas que têm PTAX disponível no BCB
    const ptaxCurrencies = Object.entries(CURRENCIES)
      .filter(([_, config]) => config.hasPTAX)
      .map(([key, config]) => ({ key, config }));

    // Lista de moedas via FastForex
    const fastForexCurrencies = Object.entries(CURRENCIES)
      .filter(([_, config]) => !config.hasPTAX)
      .map(([key]) => key);

    if (fastForexCurrencies.length > 0) {
      console.log(`Moedas via FastForex: ${fastForexCurrencies.join(', ')}`);
    }

    // Tentar últimos 5 dias úteis para garantir que pegamos uma cotação
    for (let i = 0; i < 5; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = formatDateBCB(checkDate);
      
      console.log(`Tentando BCB para ${dateStr}`);

      // Buscar cotações apenas para moedas com PTAX
      for (const { key, config } of ptaxCurrencies) {
        const rateKey = `${key}BRL`;
        
        // Pular se já temos essa cotação
        if (rates[rateKey]) continue;

        try {
          let url: string;
          
          if (config.useDolarDia) {
            // USD usa endpoint específico CotacaoDolarDia
            url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`;
          } else {
            // EUR e GBP usam CotacaoMoedaPeriodo
            url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='${config.code}'&@dataInicial='${dateStr}'&@dataFinalCotacao='${dateStr}'&$format=json`;
          }

          const response = await fetch(url);
          
          if (response.ok) {
            const data = await response.json();
            if (data.value && data.value.length > 0) {
              rates[rateKey] = data.value[data.value.length - 1].cotacaoVenda;
              console.log(`${key}/BRL (${dateStr}): ${rates[rateKey]}`);
            }
          }
        } catch (e) {
          console.error(`Erro BCB ${key} (${dateStr}):`, e);
        }
      }

      // Verificar se já temos todas as cotações PTAX
      const allPtaxFetched = ptaxCurrencies.every(({ key }) => rates[`${key}BRL`] !== null);
      
      if (allPtaxFetched) {
        console.log('Todas as cotações PTAX obtidas com sucesso');
        break;
      }
    }

    // Buscar cotações FastForex para moedas sem PTAX
    const fastForexRates = await fetchFastForexRates();
    
    // Preparar resposta final
    const finalRates: Record<string, number | null> = {};
    const sources: Record<string, string> = {};
    
    for (const [key, config] of Object.entries(CURRENCIES)) {
      const rateKey = `${key}BRL`;
      
      if (config.hasPTAX) {
        // Moeda com PTAX disponível
        if (rates[rateKey]) {
          finalRates[rateKey] = rates[rateKey];
          sources[key] = 'PTAX';
        } else if (config.fallback) {
          finalRates[rateKey] = config.fallback;
          sources[key] = 'FALLBACK_PTAX_INDISPONIVEL';
        } else {
          finalRates[rateKey] = null;
          sources[key] = 'INDISPONIVEL';
        }
      } else {
        // Moeda via FastForex
        if (fastForexRates[rateKey]) {
          finalRates[rateKey] = fastForexRates[rateKey];
          sources[key] = 'FASTFOREX';
        } else if (config.fallback) {
          // Fallback para cotação de trabalho
          finalRates[rateKey] = config.fallback;
          sources[key] = 'FALLBACK_FASTFOREX';
        } else {
          finalRates[rateKey] = null;
          sources[key] = 'SEM_COTACAO';
        }
      }
    }

    // Identificar moedas que precisam de cotação de trabalho (quando FastForex falhou)
    const currenciesNeedingWorkRate = Object.entries(sources)
      .filter(([_, source]) => source === 'FALLBACK_FASTFOREX' || source === 'SEM_COTACAO')
      .map(([key]) => key);

    // Identificar moedas PTAX que falharam
    const ptaxFailed = Object.entries(CURRENCIES)
      .filter(([key, config]) => config.hasPTAX && !rates[`${key}BRL`])
      .map(([key]) => key);

    const ptaxCount = Object.entries(sources).filter(([_, s]) => s === 'PTAX').length;
    const fastForexCount = Object.entries(sources).filter(([_, s]) => s === 'FASTFOREX').length;
    
    console.log(`Resumo: PTAX=${ptaxCount}, FastForex=${fastForexCount}`);
    if (currenciesNeedingWorkRate.length > 0) {
      console.log(`Moedas usando fallback: ${currenciesNeedingWorkRate.join(', ')}`);
    }

    return new Response(
      JSON.stringify({ 
        ...finalRates,
        timestamp: new Date().toISOString(),
        source: 'multi-source',
        sources, // Detalhe por moeda
        currenciesNeedingWorkRate: currenciesNeedingWorkRate.length > 0 ? currenciesNeedingWorkRate : undefined,
        ptaxFailed: ptaxFailed.length > 0 ? ptaxFailed : undefined
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in get-exchange-rates function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Em caso de erro total, retornar fallbacks
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
