import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching USD/BRL exchange rate from Banco Central do Brasil');

    // Banco Central do Brasil - API oficial PTAX
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0].split('-').reverse().join('-'); // DD-MM-YYYY
    
    // Buscar cotação PTAX do BCB (última cotação disponível)
    const bcbUrl = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`;
    
    console.log('BCB URL:', bcbUrl);
    
    let usdBrl = null;
    
    // Tentar BCB primeiro
    try {
      const bcbResponse = await fetch(bcbUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (bcbResponse.ok) {
        const bcbData = await bcbResponse.json();
        console.log('BCB data:', JSON.stringify(bcbData));
        
        if (bcbData.value && bcbData.value.length > 0) {
          // Usar cotação de venda (mais próxima do mercado)
          usdBrl = bcbData.value[bcbData.value.length - 1].cotacaoVenda;
          console.log('BCB PTAX cotação venda:', usdBrl);
        }
      }
    } catch (bcbError) {
      console.error('BCB error:', bcbError);
    }

    // Se BCB não retornou, tentar dia anterior (mercado fechado aos fins de semana)
    if (!usdBrl) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0].split('-').reverse().join('-');
      
      const bcbUrlYesterday = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${yesterdayStr}'&$format=json`;
      
      try {
        const bcbResponse = await fetch(bcbUrlYesterday, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (bcbResponse.ok) {
          const bcbData = await bcbResponse.json();
          if (bcbData.value && bcbData.value.length > 0) {
            usdBrl = bcbData.value[bcbData.value.length - 1].cotacaoVenda;
            console.log('BCB PTAX cotação venda (ontem):', usdBrl);
          }
        }
      } catch (e) {
        console.error('BCB yesterday error:', e);
      }
    }

    // Se ainda não tem, buscar últimos 5 dias úteis
    if (!usdBrl) {
      const fiveDaysAgo = new Date(today);
      fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
      const startStr = fiveDaysAgo.toISOString().split('T')[0].split('-').reverse().join('-');
      
      const bcbUrlRange = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)?@dataInicial='${startStr}'&@dataFinalCotacao='${dateStr}'&$format=json&$orderby=dataHoraCotacao%20desc&$top=1`;
      
      try {
        const bcbResponse = await fetch(bcbUrlRange, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (bcbResponse.ok) {
          const bcbData = await bcbResponse.json();
          console.log('BCB range data:', JSON.stringify(bcbData));
          if (bcbData.value && bcbData.value.length > 0) {
            usdBrl = bcbData.value[0].cotacaoVenda;
            console.log('BCB PTAX cotação venda (range):', usdBrl);
          }
        }
      } catch (e) {
        console.error('BCB range error:', e);
      }
    }

    if (usdBrl) {
      return new Response(
        JSON.stringify({ 
          USDBRL: usdBrl,
          timestamp: new Date().toISOString(),
          source: 'Banco Central do Brasil (PTAX)'
        }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    throw new Error('Não foi possível obter cotação de nenhuma fonte');

  } catch (error) {
    console.error('Error in get-exchange-rates function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Fallback para cotação aproximada em caso de erro
    return new Response(
      JSON.stringify({ 
        USDBRL: 5.80, // Fallback aproximado mais realista
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
