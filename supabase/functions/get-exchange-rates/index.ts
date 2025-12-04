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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching USD/BRL exchange rate from Banco Central do Brasil');

    const today = new Date();
    let usdBrl = null;

    // Tentar últimos 5 dias úteis para garantir que pegamos uma cotação
    for (let i = 0; i < 5 && !usdBrl; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      const dateStr = formatDateBCB(checkDate);
      
      const bcbUrl = `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`;
      
      console.log(`Tentando BCB para ${dateStr}:`, bcbUrl);
      
      try {
        const bcbResponse = await fetch(bcbUrl, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        if (bcbResponse.ok) {
          const bcbData = await bcbResponse.json();
          console.log(`BCB data (${dateStr}):`, JSON.stringify(bcbData));
          
          if (bcbData.value && bcbData.value.length > 0) {
            // Usar última cotação de venda do dia
            usdBrl = bcbData.value[bcbData.value.length - 1].cotacaoVenda;
            console.log(`BCB PTAX cotação venda (${dateStr}): ${usdBrl}`);
          }
        }
      } catch (e) {
        console.error(`Erro BCB (${dateStr}):`, e);
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

    throw new Error('Não foi possível obter cotação do BCB');

  } catch (error) {
    console.error('Error in get-exchange-rates function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    return new Response(
      JSON.stringify({ 
        USDBRL: 5.31, // Fallback baseado na cotação atual
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
