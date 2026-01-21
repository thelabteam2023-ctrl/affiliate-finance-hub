import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

// Moedas suportadas com seus códigos ISO e fallbacks
const CURRENCIES = {
  USD: { code: 'USD', fallback: null, useDolarDia: true },
  EUR: { code: 'EUR', fallback: 6.10, useDolarDia: false },
  GBP: { code: 'GBP', fallback: 7.10, useDolarDia: false },
  MYR: { code: 'MYR', fallback: 1.20, useDolarDia: false }, // Ringgit Malaio
  MXN: { code: 'MXN', fallback: 0.26, useDolarDia: false }, // Peso Mexicano
  ARS: { code: 'ARS', fallback: 0.005, useDolarDia: false }, // Peso Argentino
  COP: { code: 'COP', fallback: 0.0013, useDolarDia: false }, // Peso Colombiano
} as const;

type CurrencyKey = keyof typeof CURRENCIES;

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

    // Tentar últimos 5 dias úteis para garantir que pegamos uma cotação
    for (let i = 0; i < 5; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = formatDateBCB(checkDate);
      
      console.log(`Tentando BCB para ${dateStr}`);

      // Buscar cotações para cada moeda
      for (const [key, config] of Object.entries(CURRENCIES)) {
        const rateKey = `${key}BRL`;
        
        // Pular se já temos essa cotação
        if (rates[rateKey]) continue;

        try {
          let url: string;
          
          if (config.useDolarDia) {
            // USD usa endpoint específico CotacaoDolarDia
            url = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`;
          } else {
            // Outras moedas usam CotacaoMoedaPeriodo
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

      // Verificar se já temos todas as cotações principais (USD, EUR, GBP)
      const mainRatesFetched = rates.USDBRL && rates.EURBRL && rates.GBPBRL;
      const allRatesFetched = Object.values(rates).every(r => r !== null);
      
      if (allRatesFetched) {
        console.log('Todas as cotações obtidas com sucesso');
        break;
      }
      
      // Continuar tentando dias anteriores se não temos as principais
      if (mainRatesFetched && i >= 2) {
        console.log('Cotações principais obtidas, usando fallback para moedas secundárias');
        break;
      }
    }

    // Aplicar fallbacks se necessário
    const finalRates: Record<string, number | null> = {};
    
    for (const [key, config] of Object.entries(CURRENCIES)) {
      const rateKey = `${key}BRL`;
      finalRates[rateKey] = rates[rateKey] ?? config.fallback;
    }

    // Verificar quais cotações falharam
    const failedCurrencies = Object.entries(rates)
      .filter(([_, v]) => v === null)
      .map(([k]) => k.replace('BRL', ''));
    
    const partial = failedCurrencies.length > 0;
    if (partial) {
      console.log(`Cotações com fallback: ${failedCurrencies.join(', ')}`);
    }

    return new Response(
      JSON.stringify({ 
        ...finalRates,
        timestamp: new Date().toISOString(),
        source: rates.USDBRL ? 'Banco Central do Brasil (PTAX)' : 'fallback',
        partial,
        failedCurrencies: partial ? failedCurrencies : undefined
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in get-exchange-rates function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Retornar todos os fallbacks em caso de erro
    const fallbackRates: Record<string, number | null> = {};
    for (const [key, config] of Object.entries(CURRENCIES)) {
      fallbackRates[`${key}BRL`] = config.fallback;
    }
    
    return new Response(
      JSON.stringify({ 
        ...fallbackRates,
        timestamp: new Date().toISOString(),
        source: 'fallback',
        error: errorMessage
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
