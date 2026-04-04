import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withMiddleware, corsHeaders, type AuthResult } from "../_shared/middleware.ts";

serve(async (req) => {
  return withMiddleware(req, 'parse-ev-print', async (auth, req) => {
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

    const systemPrompt = `Você é um especialista em interpretar prints de ferramentas de Value Betting (OddsNotifier, Bet365 Extended, RebelBetting, OddsBoom, etc).

Sua tarefa é extrair os seguintes campos do print:

1. **odd_atual** (OBRIGATÓRIO): A odd oferecida pela casa de apostas. Aparece como "Odds: 1.83", número em destaque verde, etc.

2. **true_odds_pinnacle**: A odd real APENAS da Pinnacle. Aparece como:
   - "True odds Pinnacle @ 1.729" → o valor é 1.729
   - "True odds Pinnacle @ 2.70" → o valor é 2.70
   - Sempre vem com a palavra "Pinnacle" explícita

3. **fair_odds**: A odd justa calculada por média de múltiplas casas sharp (não apenas Pinnacle). Aparece como:
   - "Fair odds 1.783"
   - "Fair odds: 2.883"
   - NÃO contém a palavra "Pinnacle" — é uma média ponderada

REGRA CRÍTICA: "True odds Pinnacle @ X.XX" e "Fair odds Y.YY" são valores DIFERENTES.
- true_odds_pinnacle = odds da Pinnacle sozinha
- fair_odds = média de casas sharp (inclui Pinnacle + outras)
- Quando ambos aparecem no mesmo print, extraia AMBOS separadamente

4. **ev_percent**: Valor esperado em %. "Value: 4.1%", "+13.19%", "Edge: 3.2%", "Margin: 4.28%"

5. **stake**: Valor de stake. "Stake BRL: 15", "Stake: 300"

6. **probabilidade_justa**: Probabilidade justa em %. "Prob: 56.9%", "Prob. justa: 41.2%"

7. **evento**: Nome do evento (ex: "LA Clippers vs Milwaukee Bucks")

8. **mercado**: Tipo de mercado:
   - Over/Under → "Total"
   - AH, Asian handicap → "Handicap Asiático"
   - To Win, Match Winner → "Vencedor da Partida"
   - 1X2, Resultado Final → "Resultado Final"

9. **selecao**: Seleção específica (ex: "Over 8.5", "LA Clippers -11.5")

10. **bookmaker**: Nome da casa (ex: "Bet365")

11. **linha**: Linha numérica se houver (ex: -11.5, 2.5)

12. **limite**: Limite em BRL se visível (ex: "Limit: 18 452 BRL" → 18452)

REGRAS:
- Se não encontrar fair_odds mas tiver probabilidade justa, calcule: fair_odds = 1 / (prob_justa / 100)
- Odds são SEMPRE > 1.0
- Números negativos em contexto de seleção (ex: -1.5) são linhas de handicap, NÃO odds
- Retorne APENAS JSON válido com campos encontrados. Use null para campos não detectados.`;

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
              { type: "text", text: "Extraia os dados deste print de Value Betting. IMPORTANTE: diferencie 'True odds Pinnacle' de 'Fair odds'. Retorne APENAS o JSON." },
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

    // Post-process: extract both odds
    const oddAtual = parseFloat(parsed.odd_atual) || null;
    const trueOddsPinnacle = parseFloat(parsed.true_odds_pinnacle) || null;
    const fairOdds = parseFloat(parsed.fair_odds) || null;
    const probJusta = parseFloat(parsed.probabilidade_justa) || null;
    let evPercent = parseFloat(parsed.ev_percent) || null;

    // Fallback: derive fair_odds from probability if missing
    let derivedFairOdds = fairOdds;
    if (!derivedFairOdds && probJusta && probJusta > 0) {
      derivedFairOdds = Math.round((1 / (probJusta / 100)) * 1000) / 1000;
    }

    // Legacy compatibility: odd_justa = fair_odds prioritário, fallback para pinnacle
    const oddJusta = derivedFairOdds || trueOddsPinnacle;

    // Calculate EV based on fair odds (primary) if not explicit
    if (!evPercent && oddAtual && oddJusta && oddJusta > 0) {
      evPercent = Math.round((oddAtual / oddJusta - 1) * 100 * 100) / 100;
    }

    // Calculate individual EVs for dual display
    let evVsPinnacle: number | null = null;
    let evVsFairOdds: number | null = null;
    
    if (oddAtual && trueOddsPinnacle && trueOddsPinnacle > 0) {
      evVsPinnacle = Math.round((oddAtual / trueOddsPinnacle - 1) * 100 * 100) / 100;
    }
    if (oddAtual && derivedFairOdds && derivedFairOdds > 0) {
      evVsFairOdds = Math.round((oddAtual / derivedFairOdds - 1) * 100 * 100) / 100;
    }

    const result = {
      odd_atual: oddAtual,
      odd_justa: oddJusta, // backward compat: best available fair odd
      true_odds_pinnacle: trueOddsPinnacle,
      fair_odds: derivedFairOdds,
      ev_percent: evPercent,
      ev_vs_pinnacle: evVsPinnacle,
      ev_vs_fair_odds: evVsFairOdds,
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
  }, { rateLimit: { maxRequests: 15, windowMs: 60_000 } });
});
