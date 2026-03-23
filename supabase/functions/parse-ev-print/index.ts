import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();

    if (!imageBase64 || !imageBase64.startsWith("data:image/")) {
      return new Response(
        JSON.stringify({ error: "Imagem inválida. Cole um print válido (PNG, JPEG)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("[parse-ev-print] Processing image...", imageBase64.length, "chars");

    const systemPrompt = `Você é um especialista em interpretar prints de ferramentas de Value Betting (OddsNotifier, Bet365 Extended, RebelBetting, OddsBoom, etc) e interfaces de confirmação de aposta.

Sua tarefa é extrair os seguintes campos do print:

1. **odd_atual** (OBRIGATÓRIO): A odd oferecida pela casa de apostas. Pode aparecer como:
   - "Odds: 1.83"
   - "Odd oferecida: 2.75"
   - Número em destaque (geralmente verde) próximo ao topo
   - Campo "Odds" com valor numérico

2. **odd_justa** (OBRIGATÓRIO): A odd justa/real. Pode aparecer como:
   - "Fair odds: 1.758" ou "Fair odds 2.883"
   - "True odds: 1.694" ou "True odds Pinnacle @ 2.70"
   - "Odd justa: 2.43"
   - Derivada da probabilidade justa: odd_justa = 1 / (prob_justa / 100)

3. **ev_percent**: O valor esperado em %. Pode aparecer como:
   - "Value: 4.1%"
   - "+13.19% valor"
   - "Edge: 3.2%"
   - "Margin: 4.28%"

4. **stake**: O valor de stake. Pode aparecer como:
   - "Stake BRL: 15"
   - "Stake: 300"

5. **probabilidade_justa**: Probabilidade justa em %. Pode aparecer como:
   - "Prob: 56.9%"
   - "Prob. justa: 41.2%"
   - "Prob 34.7%"

6. **evento**: Nome do evento (ex: "Corentin Moutet vs Jannik Sinner")

7. **mercado**: Tipo de mercado detectado:
   - Over/Under → "Total"
   - AH, Asian handicap → "Handicap Asiático"
   - To Win, Para ganhar, Match Winner, Vencedor → "Vencedor da Partida"
   - 1X2, Resultado Final → "Resultado Final"

8. **selecao**: A seleção específica (ex: "Over 8.5", "Falcons -1.5", "Tsitsipas vence")

9. **bookmaker**: Nome da casa (ex: "Bet365", "Pinnacle")

10. **linha**: Linha numérica se houver (ex: 8.5, -1.5, 2.5)

11. **limite**: Limite em BRL se visível (ex: "Limit: 4459 BRL" → 4459)

REGRAS CRÍTICAS:
- Se encontrar "True odds Pinnacle @ X.XX", o valor X.XX é a odd justa
- Se encontrar "Fair odds X.XX", esse é a odd justa
- Se não encontrar odd_justa explicitamente mas tiver probabilidade justa, calcule: odd_justa = 1 / (prob_justa / 100)
- Se não encontrar EV explicitamente mas tiver odd_atual e odd_justa, calcule: ev = (odd_atual / odd_justa - 1) * 100
- Números negativos em contexto de seleção (ex: -1.5) são linhas de handicap, NÃO odds
- Odds são SEMPRE > 1.0

Retorne APENAS um JSON válido com os campos encontrados. Use null para campos não detectados.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: "Extraia os dados deste print de ferramenta de Value Betting. Retorne APENAS o JSON." },
              { type: "image_url", image_url: { url: imageBase64 } }
            ]
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[parse-ev-print] AI error:", response.status, errorText);
      
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

      return new Response(
        JSON.stringify({ error: `Erro ao processar imagem (código ${response.status}).` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) {
      return new Response(
        JSON.stringify({ error: "Não foi possível interpretar o print." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[parse-ev-print] Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Resposta da IA não é um JSON válido." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Post-process: derive missing values
    const oddAtual = parseFloat(parsed.odd_atual) || null;
    const oddJusta = parseFloat(parsed.odd_justa) || null;
    const probJusta = parseFloat(parsed.probabilidade_justa) || null;
    let evPercent = parseFloat(parsed.ev_percent) || null;
    let derivedOddJusta = oddJusta;

    // If no odd_justa but have prob_justa, derive it
    if (!derivedOddJusta && probJusta && probJusta > 0) {
      derivedOddJusta = Math.round((1 / (probJusta / 100)) * 1000) / 1000;
    }

    // If no EV but have both odds, calculate
    if (!evPercent && oddAtual && derivedOddJusta && derivedOddJusta > 0) {
      evPercent = Math.round((oddAtual / derivedOddJusta - 1) * 100 * 100) / 100;
    }

    const result = {
      odd_atual: oddAtual,
      odd_justa: derivedOddJusta,
      ev_percent: evPercent,
      stake: parseFloat(parsed.stake) || null,
      probabilidade_justa: probJusta,
      evento: parsed.evento || null,
      mercado: parsed.mercado || null,
      selecao: parsed.selecao || null,
      bookmaker: parsed.bookmaker || null,
      linha: parseFloat(parsed.linha) || null,
      limite: parseFloat(parsed.limite) || null,
    };

    console.log("[parse-ev-print] Result:", JSON.stringify(result));

    return new Response(
      JSON.stringify({ success: true, data: result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[parse-ev-print] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
