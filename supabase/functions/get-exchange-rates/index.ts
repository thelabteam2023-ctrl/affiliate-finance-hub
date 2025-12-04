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
    console.log('Fetching USD/BRL exchange rate from AwesomeAPI');

    // AwesomeAPI - API gratuita brasileira para cotações
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      }
    });

    if (!response.ok) {
      console.error('AwesomeAPI error:', response.status, await response.text());
      throw new Error(`AwesomeAPI returned status ${response.status}`);
    }

    const data = await response.json();
    console.log('Exchange rate data:', data);

    const usdBrl = parseFloat(data.USDBRL.bid);

    return new Response(
      JSON.stringify({ 
        USDBRL: usdBrl,
        timestamp: new Date().toISOString(),
        source: 'AwesomeAPI'
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in get-exchange-rates function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Fallback para cotação aproximada em caso de erro
    return new Response(
      JSON.stringify({ 
        USDBRL: 6.0, // Fallback aproximado
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
