import { withMiddleware, corsHeaders, type AuthResult } from "../_shared/middleware.ts";

Deno.serve(async (req) => {
  return withMiddleware(req, 'polish-topic', async (auth, req) => {
    const { titulo, conteudo, categoria } = await req.json();

    if (!titulo && !conteudo) {
      return new Response(JSON.stringify({ error: "Título ou conteúdo são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt = `Você é um assistente editorial de uma comunidade profissional de apostas esportivas (betting/trading).

Sua tarefa é reformular o título e o conteúdo de um tópico de discussão para que fique:
- **Conciso e claro**: sem rodeios, direto ao ponto
- **Profissional**: tom respeitoso e informativo
- **Atraente**: que gere vontade de outros membros responderem
- **Bem estruturado**: parágrafos curtos, pontuação correta
- **Preservando o significado original**: não invente informações, apenas melhore a escrita

Regras:
- O título deve ter no máximo 100 caracteres
- O conteúdo deve ter no máximo 500 caracteres
- Mantenha a essência e intenção original do autor
- Corrija erros de ortografia e gramática
- Se a categoria for fornecida, considere-a para o contexto
- Responda APENAS com o JSON da ferramenta, sem texto extra`;

    const userPrompt = `Categoria: ${categoria || "geral"}
Título original: ${titulo || "(sem título)"}
Conteúdo original: ${conteudo || "(sem conteúdo)"}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "polished_topic",
              description: "Return the polished title and content for a community topic",
              parameters: {
                type: "object",
                properties: {
                  titulo: { type: "string", description: "Polished title (max 100 chars)" },
                  conteudo: { type: "string", description: "Polished content (max 500 chars)" },
                },
                required: ["titulo", "conteudo"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "polished_topic" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns segundos." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos de IA esgotados." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "Erro no serviço de IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "Resposta inesperada da IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }, { rateLimit: { maxRequests: 20, windowMs: 60_000 } });
});
