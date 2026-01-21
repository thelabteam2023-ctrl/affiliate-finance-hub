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

/**
 * Moedas suportadas pelo sistema
 * 
 * IMPORTANTE: O Banco Central do Brasil (BCB) publica PTAX apenas para:
 * - USD, EUR, GBP, JPY, CHF, CAD, AUD, e algumas outras moedas principais
 * 
 * Moedas que NÃO TÊM PTAX no BCB (requerem cotação de trabalho manual):
 * - MYR (Ringgit Malaio) - Não negociada diretamente pelo BCB
 * - MXN (Peso Mexicano) - Não negociada diretamente pelo BCB
 * - ARS (Peso Argentino) - Não negociada diretamente pelo BCB
 * - COP (Peso Colombiano) - Não negociada diretamente pelo BCB
 * 
 * Para essas moedas, o sistema usa a cotação de trabalho definida no projeto.
 */
const CURRENCIES = {
  USD: { code: 'USD', fallback: null, useDolarDia: true, hasPTAX: true },
  EUR: { code: 'EUR', fallback: 6.10, useDolarDia: false, hasPTAX: true },
  GBP: { code: 'GBP', fallback: 7.10, useDolarDia: false, hasPTAX: true },
  // Moedas sem PTAX no BCB - usarão cotação de trabalho
  MYR: { code: 'MYR', fallback: null, useDolarDia: false, hasPTAX: false },
  MXN: { code: 'MXN', fallback: null, useDolarDia: false, hasPTAX: false },
  ARS: { code: 'ARS', fallback: null, useDolarDia: false, hasPTAX: false },
  COP: { code: 'COP', fallback: null, useDolarDia: false, hasPTAX: false },
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

    // Lista de moedas que têm PTAX disponível no BCB
    const ptaxCurrencies = Object.entries(CURRENCIES)
      .filter(([_, config]) => config.hasPTAX)
      .map(([key, config]) => ({ key, config }));

    // Lista de moedas SEM PTAX (precisam de cotação manual)
    const noPtaxCurrencies = Object.entries(CURRENCIES)
      .filter(([_, config]) => !config.hasPTAX)
      .map(([key]) => key);

    if (noPtaxCurrencies.length > 0) {
      console.log(`Moedas sem PTAX no BCB (requerem cotação manual): ${noPtaxCurrencies.join(', ')}`);
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
        // Moeda SEM PTAX no BCB - retornar null para usar cotação de trabalho
        finalRates[rateKey] = null;
        sources[key] = 'SEM_PTAX_BCB';
      }
    }

    // Identificar moedas que precisam de cotação de trabalho
    const currenciesNeedingWorkRate = Object.entries(CURRENCIES)
      .filter(([_, config]) => !config.hasPTAX)
      .map(([key]) => key);

    // Identificar moedas PTAX que falharam
    const ptaxFailed = Object.entries(CURRENCIES)
      .filter(([key, config]) => config.hasPTAX && !rates[`${key}BRL`])
      .map(([key]) => key);

    console.log(`Resumo: PTAX obtidas para ${Object.keys(rates).filter(k => rates[k]).length} moedas`);
    if (currenciesNeedingWorkRate.length > 0) {
      console.log(`Moedas sem PTAX (usar cotação de trabalho): ${currenciesNeedingWorkRate.join(', ')}`);
    }

    return new Response(
      JSON.stringify({ 
        ...finalRates,
        timestamp: new Date().toISOString(),
        source: rates.USDBRL ? 'Banco Central do Brasil (PTAX)' : 'fallback',
        sources, // Detalhe por moeda
        currenciesNeedingWorkRate,
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
    
    // Em caso de erro total, retornar nulls para usar cotação de trabalho
    const fallbackRates: Record<string, number | null> = {};
    const sources: Record<string, string> = {};
    
    for (const [key, config] of Object.entries(CURRENCIES)) {
      fallbackRates[`${key}BRL`] = config.hasPTAX ? config.fallback : null;
      sources[key] = config.hasPTAX ? 'FALLBACK_ERRO' : 'SEM_PTAX_BCB';
    }
    
    return new Response(
      JSON.stringify({ 
        ...fallbackRates,
        timestamp: new Date().toISOString(),
        source: 'fallback',
        sources,
        error: errorMessage,
        currenciesNeedingWorkRate: Object.entries(CURRENCIES)
          .filter(([_, config]) => !config.hasPTAX)
          .map(([key]) => key)
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
