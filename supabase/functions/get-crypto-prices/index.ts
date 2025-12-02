import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mapeamento de símbolos de criptomoedas para pares da Binance
const BINANCE_SYMBOL_MAP: Record<string, string> = {
  'USDT': 'USDTUSD',
  'USDC': 'USDCUSDT',
  'BTC': 'BTCUSDT',
  'ETH': 'ETHUSDT',
  'BNB': 'BNBUSDT',
  'TRX': 'TRXUSDT',
  'SOL': 'SOLUSDT',
  'MATIC': 'MATICUSDT',
  'ADA': 'ADAUSDT',
  'DOT': 'DOTUSDT',
  'AVAX': 'AVAXUSDT',
  'LINK': 'LINKUSDT',
  'UNI': 'UNIUSDT',
  'LTC': 'LTCUSDT',
  'XRP': 'XRPUSDT',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { symbols } = await req.json();
    
    if (!symbols || !Array.isArray(symbols)) {
      return new Response(
        JSON.stringify({ error: 'Symbols array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching prices for symbols:', symbols);

    // Mapear símbolos para pares da Binance
    const binanceSymbols = symbols
      .map(s => BINANCE_SYMBOL_MAP[s])
      .filter(Boolean);

    if (binanceSymbols.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid symbols provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Buscar preços da Binance
    const symbolsParam = JSON.stringify(binanceSymbols);
    const binanceUrl = `https://api.binance.com/api/v3/ticker/price`;
    
    console.log('Calling Binance API with symbols:', binanceSymbols);

    const response = await fetch(binanceUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbols: binanceSymbols
      })
    });

    if (!response.ok) {
      console.error('Binance API error:', response.status, await response.text());
      throw new Error(`Binance API returned status ${response.status}`);
    }

    const binanceData = await response.json();
    console.log('Binance response:', binanceData);

    // Transformar resposta para formato mais amigável
    const prices: Record<string, number> = {};
    
    for (const item of binanceData) {
      // Encontrar o símbolo original
      const originalSymbol = Object.keys(BINANCE_SYMBOL_MAP).find(
        key => BINANCE_SYMBOL_MAP[key] === item.symbol
      );
      
      if (originalSymbol) {
        prices[originalSymbol] = parseFloat(item.price);
      }
    }

    console.log('Formatted prices:', prices);

    return new Response(
      JSON.stringify({ prices }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in get-crypto-prices function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const errorDetails = error instanceof Error ? error.toString() : String(error);
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorDetails
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
