import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ParsedField {
  value: string | null;
  confidence: "high" | "medium" | "low" | "none";
}

interface ParsedBetSlip {
  mandante: ParsedField;
  visitante: ParsedField;
  dataHora: ParsedField;
  esporte: ParsedField;
  mercado: ParsedField;
  selecao: ParsedField;
}

const SPORTS_LIST = [
  "Futebol", "Basquete", "Tênis", "Baseball", "Hockey", 
  "Futebol Americano", "Vôlei", "MMA/UFC", "League of Legends", 
  "Counter-Strike", "Dota 2", "eFootball"
];

const MARKETS_KEYWORDS = {
  "Moneyline / 1X2": ["1x2", "moneyline", "match winner", "vencedor"],
  "Over (Gols)": ["over", "acima", "mais de"],
  "Under (Gols)": ["under", "abaixo", "menos de"],
  "Handicap Asiático": ["handicap asiático", "asian handicap", "ah"],
  "Handicap Europeu": ["handicap europeu", "european handicap", "eh"],
  "Ambas Marcam (BTTS)": ["btts", "ambas marcam", "both teams to score", "gol gol"],
  "Resultado Exato": ["resultado exato", "correct score", "placar exato"],
  "Dupla Chance": ["dupla chance", "double chance"],
  "Draw No Bet": ["draw no bet", "dnb", "empate anula"],
  "Total de Cantos": ["cantos", "corners", "escanteios"]
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, imageUrl } = await req.json();

    if (!imageBase64 && !imageUrl) {
      return new Response(
        JSON.stringify({ error: "Image data is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Prepare image content for the AI
    const imageContent = imageUrl 
      ? { type: "image_url", image_url: { url: imageUrl } }
      : { type: "image_url", image_url: { url: imageBase64 } };

    console.log("Processing betting slip image...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Você é um especialista em ler boletins de apostas esportivas. Sua tarefa é extrair informações do print de um boletim de aposta.

REGRAS IMPORTANTES:
1. NUNCA extraia valores financeiros (odd, stake, retorno, valor apostado)
2. Extraia APENAS informações de contexto: times, data, esporte, mercado, seleção
3. Se não tiver certeza sobre um campo, retorne null para o valor
4. Para eventos esportivos, procure por padrões como "Time A x Time B", "Time A vs Time B", "Time A - Time B"
5. Identifique o mandante (primeiro time) e visitante (segundo time)
6. Reconheça mercados comuns: 1X2, Over/Under, Handicap, BTTS, etc.
7. Identifique o esporte a partir de indicadores visuais ou textuais
8. Para a seleção, extraia o que foi apostado (ex: "Over 2.5", "Time A", "1")

Esportes reconhecidos: ${SPORTS_LIST.join(", ")}

Mercados comuns e suas palavras-chave:
${Object.entries(MARKETS_KEYWORDS).map(([market, keywords]) => `- ${market}: ${keywords.join(", ")}`).join("\n")}

FORMATO DE RESPOSTA (JSON estrito):
{
  "mandante": { "value": "NOME DO TIME MANDANTE ou null", "confidence": "high|medium|low|none" },
  "visitante": { "value": "NOME DO TIME VISITANTE ou null", "confidence": "high|medium|low|none" },
  "dataHora": { "value": "YYYY-MM-DDTHH:mm ou null", "confidence": "high|medium|low|none" },
  "esporte": { "value": "NOME DO ESPORTE DA LISTA ou null", "confidence": "high|medium|low|none" },
  "mercado": { "value": "NOME DO MERCADO ou null", "confidence": "high|medium|low|none" },
  "selecao": { "value": "TEXTO DA SELEÇÃO ou null", "confidence": "high|medium|low|none" }
}

Nível de confiança:
- "high": texto claramente visível e inequívoco
- "medium": texto visível mas pode ter interpretação ambígua
- "low": texto parcialmente visível ou muito incerto
- "none": não foi possível detectar`
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Analise este print de boletim de aposta e extraia as informações de contexto. Retorne APENAS o JSON, sem explicações adicionais." },
              imageContent
            ]
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA insuficientes." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("AI Response:", content);

    // Parse the JSON response
    let parsedData: ParsedBetSlip;
    try {
      parsedData = JSON.parse(content);
    } catch (e) {
      console.error("Failed to parse AI response:", e);
      // Return empty result if parsing fails
      parsedData = {
        mandante: { value: null, confidence: "none" },
        visitante: { value: null, confidence: "none" },
        dataHora: { value: null, confidence: "none" },
        esporte: { value: null, confidence: "none" },
        mercado: { value: null, confidence: "none" },
        selecao: { value: null, confidence: "none" }
      };
    }

    // Normalize team names to uppercase
    if (parsedData.mandante?.value) {
      parsedData.mandante.value = parsedData.mandante.value.toUpperCase();
    }
    if (parsedData.visitante?.value) {
      parsedData.visitante.value = parsedData.visitante.value.toUpperCase();
    }

    console.log("Parsed data:", JSON.stringify(parsedData));

    return new Response(
      JSON.stringify({ success: true, data: parsedData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error parsing betting slip:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
