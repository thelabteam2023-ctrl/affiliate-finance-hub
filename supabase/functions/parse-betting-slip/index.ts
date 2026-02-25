import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-workspace-id",
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
  odd: ParsedField;
  stake: ParsedField;
  retorno: ParsedField;
  resultado: ParsedField;
  bookmakerNome: ParsedField;
}

interface ParsedSelecao {
  evento: ParsedField;
  selecao: ParsedField;
  odd: ParsedField;
}

interface ParsedMultiplaBetSlip {
  tipo: ParsedField; // "dupla" or "tripla"
  stake: ParsedField;
  retornoPotencial: ParsedField;
  selecoes: ParsedSelecao[];
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

// Prompt for multiple bet slips (dupla/tripla)
const MULTIPLA_SYSTEM_PROMPT = `Você é um especialista em ler boletins de apostas esportivas MÚLTIPLAS (combinadas/acumuladoras).
Sua tarefa é extrair TODAS as informações de um print de APOSTA MÚLTIPLA (dupla, tripla, etc).

REGRAS IMPORTANTES:
1. Uma aposta múltipla contém 2 ou mais seleções no MESMO bilhete
2. Cada seleção tem: evento (times/jogadores), seleção apostada, e odd individual
3. O STAKE é o valor apostado TOTAL no bilhete (uma única aposta)
4. O RETORNO POTENCIAL é o ganho total se todas as seleções ganharem
5. A ODD FINAL (se mostrada) é o produto de todas as odds individuais

COMO IDENTIFICAR SELEÇÕES:
- Procure por padrões repetitivos de "Evento + Seleção + Odd"
- Cada linha de evento representa uma seleção diferente
- 2 seleções = Dupla, 3 seleções = Tripla
- Se houver mais de 3 seleções, retorne apenas as 3 primeiras

FORMATO DE RESPOSTA (JSON estrito):
{
  "tipo": { "value": "dupla" ou "tripla", "confidence": "high|medium|low|none" },
  "stake": { "value": "VALOR NUMÉRICO APOSTADO ou null", "confidence": "high|medium|low|none" },
  "retornoPotencial": { "value": "VALOR DO RETORNO POTENCIAL ou null", "confidence": "high|medium|low|none" },
  "selecoes": [
    {
      "evento": { "value": "EVENTO (ex: Time A x Time B)", "confidence": "high|medium|low|none" },
      "selecao": { "value": "O QUE FOI APOSTADO (ex: Time A vence, Over 2.5)", "confidence": "high|medium|low|none" },
      "odd": { "value": "ODD INDIVIDUAL DESTA SELEÇÃO", "confidence": "high|medium|low|none" }
    }
  ]
}

Nível de confiança:
- "high": texto claramente visível e inequívoco
- "medium": texto visível mas pode ter interpretação ambígua
- "low": texto parcialmente visível ou muito incerto
- "none": não foi possível detectar

DICA: Em bilhetes múltiplos, as seleções geralmente aparecem empilhadas verticalmente, cada uma com seu evento, seleção e odd.
O stake total e retorno potencial costumam aparecer na parte inferior do bilhete.`;

// Get current year for date inference
const getCurrentYear = (): number => {
  return new Date().getFullYear();
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody = await req.json();
    const { imageBase64, imageUrl, mode, model } = requestBody;

    // Determine which AI model to use (primary or backup)
    const aiModel = model === "backup" 
      ? "google/gemini-2.5-flash-lite"  // Backup: faster, cheaper
      : "google/gemini-2.5-flash";       // Primary: more accurate

    console.log("[parse-betting-slip] Request received:", {
      hasImageBase64: !!imageBase64,
      imageBase64Length: imageBase64?.length || 0,
      imageBase64Prefix: imageBase64?.substring(0, 50) || "N/A",
      hasImageUrl: !!imageUrl,
      mode: mode || "simples",
      model: aiModel
    });

    // CRITICAL VALIDATION: Check for valid image data
    if (!imageBase64 && !imageUrl) {
      console.error("[parse-betting-slip] No image data provided");
      return new Response(
        JSON.stringify({ error: "Nenhuma imagem fornecida. Cole ou arraste uma imagem válida." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // VALIDATION: If imageBase64 is provided, ensure it's a valid data URI
    if (imageBase64) {
      // Must be a data:image/... base64 string
      if (!imageBase64.startsWith("data:image/")) {
        console.error("[parse-betting-slip] Invalid base64 format - not a data URI:", imageBase64.substring(0, 100));
        return new Response(
          JSON.stringify({ error: "Formato de imagem inválido. A imagem deve ser um print válido (PNG, JPEG, etc)." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Check minimum length for a valid image (a tiny 1x1 pixel is ~70 chars)
      if (imageBase64.length < 100) {
        console.error("[parse-betting-slip] Base64 too short to be valid image:", imageBase64.length);
        return new Response(
          JSON.stringify({ error: "Imagem muito pequena ou corrompida. Tente colar o print novamente." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // VALIDATION: If imageUrl is provided, ensure it's a valid URL
    if (imageUrl && !imageBase64) {
      if (!imageUrl.startsWith("http://") && !imageUrl.startsWith("https://") && !imageUrl.startsWith("data:image/")) {
        console.error("[parse-betting-slip] Invalid imageUrl format:", imageUrl.substring(0, 100));
        return new Response(
          JSON.stringify({ error: "URL de imagem inválida. Use uma URL válida (https://) ou cole a imagem diretamente." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Determine which image source to use (prefer base64 if both provided)
    const imageSource = imageBase64 || imageUrl;
    const imageContent = { type: "image_url", image_url: { url: imageSource } };

    const isMultipla = mode === "multipla";
    const currentYear = getCurrentYear();
    console.log(`[parse-betting-slip] Processing... Mode: ${isMultipla ? "multipla" : "simples"}, Model: ${aiModel}, CurrentYear: ${currentYear}, ImageSize: ${imageSource.length} chars`);

    // Choose prompt based on mode
    const systemPrompt = isMultipla ? MULTIPLA_SYSTEM_PROMPT : `Você é um especialista em ler boletins de apostas esportivas. Sua tarefa é extrair TODAS as informações visíveis do print de um boletim de aposta.

REGRA CRÍTICA DE DATA/HORA:
1. FORMATO DE DATA NOS PRINTS: As datas em bilhetes de apostas usam o formato DD/MM (dia/mês), NUNCA MM/DD.
   - "07/02" significa 7 de fevereiro (dia 7, mês 2), NÃO 2 de julho
   - "11/06" significa 11 de junho (dia 11, mês 6), NÃO 6 de novembro
   - "25/12" significa 25 de dezembro (dia 25, mês 12)
   - SEMPRE interprete o PRIMEIRO número como DIA e o SEGUNDO como MÊS
2. Se o bilhete mostrar APENAS dia e mês (ex: "07/02", "11-6", "11 de junho") SEM o ano explícito:
   - SEMPRE assuma o ANO ATUAL: ${currentYear}
   - Combine: dia + mês reconhecidos + ${currentYear}
   - Exemplo: "07/02" → "${currentYear}-02-07" (7 de fevereiro)
   - Exemplo: "11/6" → "${currentYear}-06-11" (11 de junho)
3. NUNCA invente anos passados ou futuros
4. Se houver ambiguidade, use o melhor palpite mas com confiança "medium"

REGRAS IMPORTANTES:
1. Extraia TODOS os campos visíveis: times, data, esporte, mercado, seleção, ODD, STAKE, RETORNO, RESULTADO, NOME DA CASA
2. A ODD é o valor numérico da cotação (ex: 1.85, 2.10, 3.50) - geralmente em verde ou destacado
3. O STAKE é o valor apostado em dinheiro - PROCURE:
   - Valores numéricos na lateral direita do print (ex: 120.00, 100, 50.00)
   - Textos como "Valor da aposta", "Stake", "Aposta", "Quantia"
   - Valores próximos a símbolos de moeda (R$, $, €)
   - IMPORTANTE: O valor 120.00 visível na imagem é o STAKE, não o retorno!
4. O RETORNO é o valor total a receber se ganhar (stake * odd) - normalmente maior que stake
5. O RESULTADO pode ser: "GREEN" (ganhou), "RED" (perdeu), "VOID" (cancelado), ou null se pendente
   - GREEN: "GANHOU", "VENCIDO", "VITÓRIA", "VITORIA", "WON", "WIN", "ACERTOU", "GANHO", "VENCEU", badge verde
   - RED: "PERDIDO", "PERDEU", "DERROTA", "DEFEAT", "LOST", "LOSE", "ERROU", "PERDA", badge vermelho
   - VOID: "CANCELADO", "DEVOLVIDO", "ANULADO", "REEMBOLSO", "REFUND", "VOID"
   - null: se o resultado ainda está pendente
6. O BOOKMAKER/CASA é o nome da casa de apostas (ex: "Bet365", "Betano", "EstrelaBet")
   - Geralmente aparece no topo ou rodapé do bilhete
   - Pode ser logo ou texto
7. Se não tiver certeza sobre um campo, retorne o valor mesmo assim com confiança baixa
8. Para eventos esportivos, procure por padrões como "Time A x Time B", "Time A vs Time B", "Time A - Time B"
9. Identifique o mandante (primeiro time) e visitante (segundo time)
10. MERCADO: Extraia o texto EXATAMENTE como aparece no print, SEM normalizar ou traduzir
    - Exemplo: Se o print mostra "Vencedor da partida - Incluindo prorrogação", retorne exatamente isso
    - NÃO substitua por nomenclaturas padrão como "1X2" ou "Moneyline"
11. Identifique o esporte a partir de indicadores visuais ou textuais
12. Para a seleção, extraia o que foi apostado (ex: "Over 2.5", "Team Name", "1")
13. REGRA IMPORTANTE para mercado 1X2/MATCH_ODDS (Match Odds, Resultado da Partida, Resultado Final, Full Time Result, 1X2, Três Vias, Main Line):
    - Se a seleção for apenas "1", substitua pelo nome do time mandante (primeiro time)
    - Se a seleção for apenas "2", substitua pelo nome do time visitante (segundo time)
    - Se a seleção for "X", substitua por "Empate"
    - Isso torna a seleção mais descritiva
14. Para valores numéricos (odd, stake, retorno), extraia APENAS os números, sem símbolos de moeda

Esportes reconhecidos: ${SPORTS_LIST.join(", ")}

FORMATO DE RESPOSTA (JSON estrito):
{
  "mandante": { "value": "NOME DO TIME MANDANTE ou null", "confidence": "high|medium|low|none" },
  "visitante": { "value": "NOME DO TIME VISITANTE ou null", "confidence": "high|medium|low|none" },
  "dataHora": { "value": "YYYY-MM-DDTHH:mm ou null", "confidence": "high|medium|low|none" },
  "esporte": { "value": "NOME DO ESPORTE DA LISTA ou null", "confidence": "high|medium|low|none" },
  "mercado": { "value": "TEXTO EXATO DO MERCADO COMO APARECE NO PRINT ou null", "confidence": "high|medium|low|none" },
  "selecao": { "value": "TEXTO DA SELEÇÃO ou null", "confidence": "high|medium|low|none" },
  "odd": { "value": "VALOR NUMÉRICO DA ODD ou null", "confidence": "high|medium|low|none" },
  "stake": { "value": "VALOR NUMÉRICO APOSTADO ou null", "confidence": "high|medium|low|none" },
  "retorno": { "value": "VALOR NUMÉRICO DO RETORNO ou null", "confidence": "high|medium|low|none" },
  "resultado": { "value": "GREEN|RED|VOID ou null se pendente", "confidence": "high|medium|low|none" },
  "bookmakerNome": { "value": "NOME DA CASA DE APOSTAS ou null", "confidence": "high|medium|low|none" }
}

Nível de confiança:
- "high": texto claramente visível e inequívoco
- "medium": texto visível mas pode ter interpretação ambígua OU data sem ano explícito
- "low": texto parcialmente visível ou muito incerto
- "none": não foi possível detectar

DICA: Em boletins de apostas, a ODD geralmente aparece em verde/destaque próximo à seleção com formato decimal (2.90). O STAKE é o valor apostado que aparece na lateral ou rodapé (ex: 120.00). O RETORNO é calculado como stake * odd.`;

    const userPrompt = isMultipla 
      ? "Analise este print de APOSTA MÚLTIPLA (combinada/acumuladora) e extraia as informações de TODAS as seleções. Retorne APENAS o JSON, sem explicações adicionais."
      : "Analise este print de boletim de aposta e extraia as informações de contexto. Retorne APENAS o JSON, sem explicações adicionais.";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: aiModel,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              imageContent
            ]
          }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[parse-betting-slip] AI Gateway error:", response.status, errorText);
      
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
      if (response.status === 400) {
        // Parse the error to provide more context
        try {
          const errorData = JSON.parse(errorText);
          const errorMessage = errorData?.error?.message || "Erro ao processar imagem";
          console.error("[parse-betting-slip] 400 Error details:", errorMessage);
          return new Response(
            JSON.stringify({ error: `Erro ao processar imagem: ${errorMessage}. Tente novamente com outra imagem.` }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch {
          // If we can't parse, return generic error
        }
      }
      
      return new Response(
        JSON.stringify({ error: `Erro ao processar imagem (código ${response.status}). Tente novamente.` }),
        { status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("AI Response:", content);

    // Normalizar ODD/STAKE para um formato numérico consistente
    // Handles both string and number inputs from AI response
    const normalizeNumericString = (raw: string | number | null | undefined): string | null => {
      if (raw === null || raw === undefined) return null;
      
      // If it's already a number, just format it
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) return null;
        return raw.toFixed(2);
      }
      
      // If it's not a string at this point, convert it
      const rawStr = String(raw);
      if (!rawStr) return null;
      
      const match = rawStr.replace(/\s+/g, "").match(/-?\d[\d.,]*/);
      if (!match) return null;

      let s = match[0];
      const hasDot = s.includes(".");
      const hasComma = s.includes(",");

      if (hasDot && hasComma) {
        if (s.lastIndexOf(",") > s.lastIndexOf(".")) {
          s = s.replace(/\./g, "").replace(",", ".");
        } else {
          s = s.replace(/,/g, "");
        }
      } else if (hasComma && !hasDot) {
        s = s.replace(",", ".");
      }

      const n = parseFloat(s);
      if (!Number.isFinite(n)) return null;
      return n.toFixed(2);
    };

    // Normalize date to ensure current year if not specified
    const normalizeDateWithCurrentYear = (dateStr: string | null): { value: string | null; wasYearInferred: boolean } => {
      if (!dateStr) return { value: null, wasYearInferred: false };
      
      // If already has a valid year (2020-2030 range), validate DD/MM wasn't swapped
      const yearMatch = dateStr.match(/20[2-3]\d/);
      if (yearMatch) {
        // Check for swapped month/day: if month > 12, it's likely DD in month position
        const isoMatch = dateStr.match(/(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) {
          const month = parseInt(isoMatch[2]);
          const day = parseInt(isoMatch[3]);
          // If month > 12, the AI swapped DD/MM (e.g., 2026-07-02 instead of 2026-02-07)
          if (month > 12 && day <= 12) {
            const corrected = dateStr.replace(
              `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`,
              `${isoMatch[1]}-${isoMatch[3].padStart(2, '0')}-${isoMatch[2].padStart(2, '0')}`
            );
            console.log(`[normalizeDateWithCurrentYear] Swapped month/day: "${dateStr}" → "${corrected}"`);
            return { value: corrected, wasYearInferred: false };
          }
        }
        return { value: dateStr, wasYearInferred: false };
      }
      
      // Try to extract day and month
      const patterns = [
        /(\d{1,2})[\/\-](\d{1,2})(?:T|$|\s)/,  // DD/MM or DD-MM
        /(\d{1,2})\s*(?:de\s*)?(\d{1,2})/i,     // DD de MM
      ];
      
      for (const pattern of patterns) {
        const match = dateStr.match(pattern);
        if (match) {
          const day = match[1].padStart(2, '0');
          const month = match[2].padStart(2, '0');
          
          // Extract time if present
          const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
          const time = timeMatch ? `T${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}` : "T12:00";
          
          return { 
            value: `${currentYear}-${month}-${day}${time}`, 
            wasYearInferred: true 
          };
        }
      }
      
      return { value: dateStr, wasYearInferred: false };
    };

    if (isMultipla) {
      // Parse multipla bet slip
      let parsedData: ParsedMultiplaBetSlip;
      try {
        parsedData = JSON.parse(content);
        
        // Ensure basic structure
        if (!parsedData.tipo) {
          parsedData.tipo = { value: null, confidence: "none" };
        }
        if (!parsedData.stake) {
          parsedData.stake = { value: null, confidence: "none" };
        }
        if (!parsedData.retornoPotencial) {
          parsedData.retornoPotencial = { value: null, confidence: "none" };
        }
        if (!parsedData.selecoes || !Array.isArray(parsedData.selecoes)) {
          parsedData.selecoes = [];
        }
        
        // Normalize numeric values
        parsedData.stake.value = normalizeNumericString(parsedData.stake?.value);
        parsedData.retornoPotencial.value = normalizeNumericString(parsedData.retornoPotencial?.value);
        
        // Normalize each selection
        for (const sel of parsedData.selecoes) {
          if (sel.odd) {
            sel.odd.value = normalizeNumericString(sel.odd.value);
          }
          // Uppercase event names
          if (sel.evento?.value) {
            sel.evento.value = sel.evento.value.toUpperCase();
          }
          // Normalize 1x2 selection for multi-bet legs
          if (sel.selecao?.value && sel.evento?.value) {
            const selTrimmed = sel.selecao.value.trim();
            const eventParts = sel.evento.value.split(/\s+(?:X|VS|V)\s+/i);
            if (eventParts.length === 2) {
              const home = eventParts[0].trim();
              const away = eventParts[1].trim();
              if (selTrimmed === "1") sel.selecao.value = home;
              else if (selTrimmed === "2") sel.selecao.value = away;
              else if (selTrimmed.toUpperCase() === "X") sel.selecao.value = "Empate";
            }
          }
        }
        
        // Auto-detect tipo based on number of selections
        const numSelecoes = parsedData.selecoes.length;
        if (numSelecoes >= 3) {
          parsedData.tipo = { value: "tripla", confidence: "high" };
        } else if (numSelecoes === 2) {
          parsedData.tipo = { value: "dupla", confidence: "high" };
        }
        
      } catch (e) {
        console.error("Failed to parse AI response for multipla:", e);
        parsedData = {
          tipo: { value: null, confidence: "none" },
          stake: { value: null, confidence: "none" },
          retornoPotencial: { value: null, confidence: "none" },
          selecoes: []
        };
      }

      console.log("Parsed multipla data:", JSON.stringify(parsedData));
      return new Response(
        JSON.stringify({ success: true, data: parsedData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Parse simple bet slip (original logic)
      let parsedData: ParsedBetSlip;
      try {
        parsedData = JSON.parse(content);
        
        // Ensure all fields exist
        if (!parsedData.odd) {
          parsedData.odd = { value: null, confidence: "none" };
        }
        if (!parsedData.stake) {
          parsedData.stake = { value: null, confidence: "none" };
        }
        if (!parsedData.retorno) {
          parsedData.retorno = { value: null, confidence: "none" };
        }
        if (!parsedData.resultado) {
          parsedData.resultado = { value: null, confidence: "none" };
        }
        if (!parsedData.bookmakerNome) {
          parsedData.bookmakerNome = { value: null, confidence: "none" };
        }
      } catch (e) {
        console.error("Failed to parse AI response:", e);
        parsedData = {
          mandante: { value: null, confidence: "none" },
          visitante: { value: null, confidence: "none" },
          dataHora: { value: null, confidence: "none" },
          esporte: { value: null, confidence: "none" },
          mercado: { value: null, confidence: "none" },
          selecao: { value: null, confidence: "none" },
          odd: { value: null, confidence: "none" },
          stake: { value: null, confidence: "none" },
          retorno: { value: null, confidence: "none" },
          resultado: { value: null, confidence: "none" },
          bookmakerNome: { value: null, confidence: "none" }
        };
      }

      // Normalize team names to uppercase
      if (parsedData.mandante?.value) {
        parsedData.mandante.value = parsedData.mandante.value.toUpperCase();
      }
      if (parsedData.visitante?.value) {
        parsedData.visitante.value = parsedData.visitante.value.toUpperCase();
      }

      // Normalize date with current year inference
      if (parsedData.dataHora?.value) {
        const dateResult = normalizeDateWithCurrentYear(parsedData.dataHora.value);
        parsedData.dataHora.value = dateResult.value;
        // Downgrade confidence if year was inferred
        if (dateResult.wasYearInferred && parsedData.dataHora.confidence === "high") {
          parsedData.dataHora.confidence = "medium";
        }
      }

      // Normalize numeric fields
      parsedData.odd.value = normalizeNumericString(parsedData.odd?.value);
      parsedData.stake.value = normalizeNumericString(parsedData.stake?.value);
      parsedData.retorno.value = normalizeNumericString(parsedData.retorno?.value);

      // Normalize resultado to standard values
      if (parsedData.resultado?.value) {
        const resultLower = parsedData.resultado.value.toLowerCase();
        if (resultLower.includes("ganhou") || resultLower.includes("vencido") || resultLower.includes("win") || resultLower === "green" || resultLower.includes("vitória") || resultLower.includes("vitoria") || resultLower.includes("acertou") || resultLower.includes("won") || resultLower.includes("ganho") || resultLower.includes("venceu")) {
          parsedData.resultado.value = "GREEN";
        } else if (resultLower.includes("perdeu") || resultLower.includes("perdido") || resultLower.includes("lose") || resultLower.includes("lost") || resultLower === "red" || resultLower.includes("derrota") || resultLower.includes("errou") || resultLower.includes("defeat") || resultLower.includes("perda")) {
          parsedData.resultado.value = "RED";
        } else if (resultLower.includes("void") || resultLower.includes("cancelado") || resultLower.includes("devolvido") || resultLower.includes("reembolso") || resultLower.includes("anulado") || resultLower.includes("refund")) {
          parsedData.resultado.value = "VOID";
        }
      }

      // Normalize 1x2 selection: "1" → home team, "2" → away team, "X" → Empate
      if (parsedData.selecao?.value) {
        const selTrimmed = parsedData.selecao.value.trim();
        if (selTrimmed === "1" && parsedData.mandante?.value) {
          parsedData.selecao.value = parsedData.mandante.value;
        } else if (selTrimmed === "2" && parsedData.visitante?.value) {
          parsedData.selecao.value = parsedData.visitante.value;
        } else if (selTrimmed.toUpperCase() === "X") {
          parsedData.selecao.value = "Empate";
        }
      }

      // Normalize bookmaker name (capitalize first letter of each word)
      if (parsedData.bookmakerNome?.value) {
        parsedData.bookmakerNome.value = parsedData.bookmakerNome.value
          .toLowerCase()
          .split(/\s+/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      }

      console.log("Parsed data:", JSON.stringify(parsedData));
      return new Response(
        JSON.stringify({ success: true, data: parsedData }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Error parsing betting slip:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
