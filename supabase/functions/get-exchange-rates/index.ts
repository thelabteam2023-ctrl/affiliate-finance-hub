import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

// Busca cotação de uma moeda específica no BCB
async function fetchBCBRate(currencyCode: number, dateStr: string): Promise<number | null> {
  try {
    // API do BCB para cotações de moedas
    // Códigos: USD=220, EUR=978, GBP=540
    const bcbUrl = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaDia(moeda=@moeda,dataCotacao=@dataCotacao)?@moeda='${currencyCode}'&@dataCotacao='${dateStr}'&$format=json`;
    
    const response = await fetch(bcbUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.value && data.value.length > 0) {
        return data.value[data.value.length - 1].cotacaoVenda;
      }
    }
  } catch (e) {
    console.error(`Erro ao buscar cotação BCB para código ${currencyCode}:`, e);
  }
  return null;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching exchange rates from Banco Central do Brasil');

    const today = new Date();
    const rates: Record<string, number | null> = {
      USDBRL: null,
      EURBRL: null,
      GBPBRL: null,
    };

    // Tentar últimos 5 dias úteis para garantir que pegamos uma cotação
    for (let i = 0; i < 5; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = formatDateBCB(checkDate);
      
      console.log(`Tentando BCB para ${dateStr}`);

      // Buscar USD/BRL usando a API PTAX (mais confiável)
      if (!rates.USDBRL) {
        try {
          const bcbUrl = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`;
          
          const bcbResponse = await fetch(bcbUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (bcbResponse.ok) {
            const bcbData = await bcbResponse.json();
            if (bcbData.value && bcbData.value.length > 0) {
              rates.USDBRL = bcbData.value[bcbData.value.length - 1].cotacaoVenda;
              console.log(`USD/BRL (${dateStr}): ${rates.USDBRL}`);
            }
          }
        } catch (e) {
          console.error(`Erro BCB USD (${dateStr}):`, e);
        }
      }

      // Buscar EUR/BRL e GBP/BRL usando API de moedas do BCB
      if (!rates.EURBRL || !rates.GBPBRL) {
        try {
          // Usar API alternativa do BCB para outras moedas
          const moedaUrl = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='EUR'&@dataInicial='${dateStr}'&@dataFinalCotacao='${dateStr}'&$format=json`;
          
          const eurResponse = await fetch(moedaUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (eurResponse.ok && !rates.EURBRL) {
            const eurData = await eurResponse.json();
            if (eurData.value && eurData.value.length > 0) {
              rates.EURBRL = eurData.value[eurData.value.length - 1].cotacaoVenda;
              console.log(`EUR/BRL (${dateStr}): ${rates.EURBRL}`);
            }
          }
        } catch (e) {
          console.error(`Erro BCB EUR (${dateStr}):`, e);
        }

        try {
          const gbpUrl = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@moeda='GBP'&@dataInicial='${dateStr}'&@dataFinalCotacao='${dateStr}'&$format=json`;
          
          const gbpResponse = await fetch(gbpUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (gbpResponse.ok && !rates.GBPBRL) {
            const gbpData = await gbpResponse.json();
            if (gbpData.value && gbpData.value.length > 0) {
              rates.GBPBRL = gbpData.value[gbpData.value.length - 1].cotacaoVenda;
              console.log(`GBP/BRL (${dateStr}): ${rates.GBPBRL}`);
            }
          }
        } catch (e) {
          console.error(`Erro BCB GBP (${dateStr}):`, e);
        }
      }

      // Se conseguimos todas as cotações, parar
      if (rates.USDBRL && rates.EURBRL && rates.GBPBRL) {
        break;
      }
    }

    // Aplicar fallbacks se necessário
    const finalRates = {
      USDBRL: rates.USDBRL ?? 5.31,
      EURBRL: rates.EURBRL ?? 5.75,
      GBPBRL: rates.GBPBRL ?? 6.70,
    };

    return new Response(
      JSON.stringify({ 
        ...finalRates,
        timestamp: new Date().toISOString(),
        source: rates.USDBRL ? 'Banco Central do Brasil (PTAX)' : 'fallback',
        partial: !rates.USDBRL || !rates.EURBRL || !rates.GBPBRL
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in get-exchange-rates function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    return new Response(
      JSON.stringify({ 
        USDBRL: 5.31,
        EURBRL: 5.75,
        GBPBRL: 6.70,
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