import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-workspace-id',
};

// ================================================================
// STABLECOINS: USDT e USDC são sempre 1:1 com USD
// Não consultar API para evitar spreads de mercado (ex: 1.0003)
// que causam diferenças falsas de -$0.03 nos depósitos
// ================================================================
const STABLECOINS: Record<string, number> = {
  'USDT': 1.0,
  'USDC': 1.0,
};

// Mapeamento de símbolos de criptomoedas para pares da Binance
// Apenas criptomoedas voláteis precisam de cotação real
const BINANCE_SYMBOL_MAP: Record<string, string> = {
  // Stablecoins removidas - sempre usam valor fixo 1.0
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

// Fallback prices for when Binance API is unavailable
const FALLBACK_PRICES: Record<string, number> = {
  'USDT': 1.0,
  'USDC': 1.0,
  'BTC': 100000,
  'ETH': 3500,
  'BNB': 600,
  'TRX': 0.25,
  'SOL': 180,
  'MATIC': 0.5,
  'ADA': 0.8,
  'DOT': 7,
  'AVAX': 35,
  'LINK': 15,
  'UNI': 12,
  'LTC': 100,
  'XRP': 2.5,
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

    // ================================================================
    // IMPORTANTE: Stablecoins SEMPRE usam valor fixo 1.0
    // Não consultar API para evitar spreads (ex: 1.0003 → -$0.03)
    // ================================================================
    const prices: Record<string, number> = {};
    const symbolsToFetch: string[] = [];
    
    for (const symbol of symbols) {
      if (STABLECOINS[symbol] !== undefined) {
        // Stablecoin: usar valor fixo 1.0 (SEM consultar API)
        prices[symbol] = STABLECOINS[symbol];
        console.log(`[STABLECOIN] ${symbol} = ${STABLECOINS[symbol]} (fixed, no API)`);
      } else if (BINANCE_SYMBOL_MAP[symbol]) {
        // Crypto volátil: precisa buscar da API
        symbolsToFetch.push(symbol);
      }
    }

    // Mapear símbolos para pares da Binance (apenas cryptos voláteis)
    const binanceSymbols = symbolsToFetch
      .map(s => BINANCE_SYMBOL_MAP[s])
      .filter(Boolean);

    if (binanceSymbols.length === 0) {
      // Retornar apenas stablecoins (nenhuma crypto volátil solicitada)
      console.log('Only stablecoins requested, returning fixed values');
      return new Response(
        JSON.stringify({ prices, source: 'stablecoins_fixed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    try {
      // Buscar todos os preços da Binance (endpoint público sem limite)
      const binanceUrl = `https://api.binance.com/api/v3/ticker/price`;
      
      console.log('Fetching all prices from Binance API (native fetch)');

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

      const response = await fetch(binanceUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Binance API error:', response.status, errorText);
        throw new Error(`Binance API returned status ${response.status}`);
      }

      const binanceData = await response.json();
      console.log('Fetched', binanceData.length, 'prices from Binance');

      // Transformar resposta para formato mais amigável
      for (const item of binanceData) {
        // Encontrar o símbolo original que corresponde ao símbolo da Binance
        const originalSymbol = Object.keys(BINANCE_SYMBOL_MAP).find(
          key => BINANCE_SYMBOL_MAP[key] === item.symbol
        );
        
        if (originalSymbol && binanceSymbols.includes(item.symbol)) {
          prices[originalSymbol] = parseFloat(item.price);
        }
      }

      console.log('Formatted prices:', prices);

      return new Response(
        JSON.stringify({ prices, source: 'binance' }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

    } catch (binanceError) {
      // Binance failed, use fallback prices
      console.error('Binance API failed, using fallback prices:', binanceError);
      
      for (const symbol of symbols) {
        if (FALLBACK_PRICES[symbol] && !prices[symbol]) {
          prices[symbol] = FALLBACK_PRICES[symbol];
        }
      }

      console.log('Using fallback prices:', prices);

      return new Response(
        JSON.stringify({ prices, source: 'fallback' }),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

  } catch (error) {
    console.error('Error in get-crypto-prices function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    
    // Even on error, return fallback prices to not block the UI
    const fallbackPrices: Record<string, number> = {
      'USDT': 1.0,
      'USDC': 1.0,
    };

    return new Response(
      JSON.stringify({ 
        prices: fallbackPrices,
        source: 'error_fallback',
        error: errorMessage
      }),
      { 
        status: 200, // Return 200 with fallback instead of 500
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
