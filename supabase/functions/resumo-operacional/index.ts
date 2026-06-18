import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/middleware.ts";

interface OcorrenciaResumo {
  titulo: string;
  tipo: string;
  valorBRL: number;
}

interface RequestBody {
  periodo: { label: string; dataInicio: string; dataFim: string };
  metricas: {
    fluxoLiquido: number;
    custoTotal: number;
    resultadoLiquido: number;
    custosPorCategoria: Record<string, number>;
    perdasTotal: number;
    perdasErro?: boolean;
    moedasSemCotacao?: number;
    lucroReal: number | null;
    ocorrencias: OcorrenciaResumo[];
  };
}

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as RequestBody;
    if (!body?.periodo || !body?.metricas) {
      return new Response(JSON.stringify({ error: "Invalid body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const m = body.metricas;
    const ocorrenciasSlice = m.ocorrencias.slice(0, 10);
    const ocorrenciasExtras = Math.max(0, m.ocorrencias.length - ocorrenciasSlice.length);

    const userPrompt = `
Período: ${body.periodo.label} (${body.periodo.dataInicio} → ${body.periodo.dataFim})

Métricas já calculadas pelo sistema (NÃO recalcular, NÃO arredondar):
- Fluxo Líquido: ${fmt(m.fluxoLiquido)}
- Custos Operacionais (total): ${fmt(m.custoTotal)}
- Resultado Líquido (já exibido no gráfico): ${fmt(m.resultadoLiquido)}
- Perdas por Disputa/Scam${m.perdasErro ? " (FALHA ao consultar)" : ""}: ${m.perdasErro ? "indisponível" : fmt(m.perdasTotal)}
- Lucro Real (Resultado Líquido − Perdas): ${m.lucroReal === null ? "indisponível" : fmt(m.lucroReal)}
${m.moedasSemCotacao ? `\nAtenção: ${m.moedasSemCotacao} ocorrência(s) sem cotação foram excluídas da soma.` : ""}

Custos por categoria:
${Object.entries(m.custosPorCategoria).map(([k, v]) => `  - ${k}: ${fmt(v)}`).join("\n")}

Ocorrências do período (${m.ocorrencias.length} total):
${ocorrenciasSlice.map((o) => `  - ${o.titulo} [${o.tipo}]: ${fmt(o.valorBRL)}`).join("\n") || "  (nenhuma)"}
${ocorrenciasExtras > 0 ? `  …e ${ocorrenciasExtras} outra(s).` : ""}

Escreva o resumo em 3 a 6 frases, em português, seguindo as regras do system prompt.
`.trim();

    const systemPrompt = `Você é um analista financeiro objetivo. Receberá métricas JÁ CALCULADAS pelo sistema — NÃO recalcule, NÃO arredonde, NÃO invente categorias.

Produza 3 a 6 frases em português brasileiro explicando:
1. O Fluxo Líquido proveniente dos projetos no período.
2. Que o Resultado Líquido já desconta os custos operacionais.
3. Impacto EXPLÍCITO das disputas/scams: se houver perdas, dizer quanto e como reduzem o lucro. Se NÃO houver, afirmar isso textualmente ("Não foram registradas disputas/scams neste período") — nunca omitir.
4. Concluir com o Lucro Real, deixando claro se é igual ou menor que o Resultado Líquido.

Se o campo "Perdas" vier como "indisponível", alerte que não foi possível confirmar ocorrências e NÃO presuma zero.

Tom direto, sem floreio. Não repita os números palavra por palavra dos cards — contextualize o que significam.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
      }),
    });

    if (aiRes.status === 429) {
      return new Response(
        JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em instantes." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiRes.status === 402) {
      return new Response(
        JSON.stringify({ error: "Créditos de IA esgotados. Adicione créditos no workspace." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error("AI Gateway error", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "Falha ao gerar resumo." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await aiRes.json();
    const texto: string = json?.choices?.[0]?.message?.content?.trim() ?? "";

    return new Response(
      JSON.stringify({ texto, modelo: "google/gemini-3-flash-preview" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[resumo-operacional] error", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});