import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/middleware.ts";

interface OcorrenciaResumo {
  titulo: string;
  tipo: string;
  valorBRL: number;
}

interface ExposicaoPendente {
  emDisputa: number;
  irrecuperavel: number;
  countDisputa: number;
  countIrrecuperavel: number;
  bySegment: {
    bookmakers: number;
    caixaOp: number;
    wallets: number;
    contasParc: number;
  };
  topOcorrencias: Array<{ label: string; valor: number; segmento: string }>;
}

interface RequestBody {
  periodo: { label: string; dataInicio: string; dataFim: string; tipo?: string };
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
    exposicaoPendente?: ExposicaoPendente;
    lucroRealWorstCase?: number | null;
    janelaInsuficiente?: boolean;
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
    const ep = m.exposicaoPendente;
    const temExposicao =
      !!ep && (ep.emDisputa > 0 || ep.irrecuperavel > 0 || ep.countDisputa > 0 || ep.countIrrecuperavel > 0);

    const exposicaoBlock = ep
      ? `
EXPOSIÇÃO PENDENTE (snapshot atual — NÃO depende do período):
- Em Disputa (ocorrências em aberto): ${fmt(ep.emDisputa)} em ${ep.countDisputa} ocorrência(s)
  · Casas de Aposta: ${fmt(ep.bySegment.bookmakers)}
  · Contas Parceiros: ${fmt(ep.bySegment.contasParc)}
  · Wallets Crypto: ${fmt(ep.bySegment.wallets)}
  · Caixa Operacional: ${fmt(ep.bySegment.caixaOp)}
- Saldo Irrecuperável (travado em casas): ${fmt(ep.irrecuperavel)} em ${ep.countIrrecuperavel} casa(s)
- Lucro Real worst-case (se 100% das disputas virarem perda): ${m.lucroRealWorstCase == null ? "indisponível" : fmt(m.lucroRealWorstCase)}
${ep.topOcorrencias.length ? `\nMaiores valores em disputa:\n${ep.topOcorrencias.map((o) => `  - ${o.label} [${o.segmento}]: ${fmt(o.valor)}`).join("\n")}` : ""}
`.trim()
      : "EXPOSIÇÃO PENDENTE: nenhuma disputa em aberto e nenhum saldo irrecuperável no momento.";

    const userPrompt = `
Período analisado: ${body.periodo.label} (${body.periodo.dataInicio} → ${body.periodo.dataFim})
${m.janelaInsuficiente ? "\nATENÇÃO: o período escolhido excede a janela carregada — os totais podem estar truncados.\n" : ""}

Métricas do período (JÁ calculadas — NÃO recalcular, NÃO arredondar):
- Fluxo Líquido: ${fmt(m.fluxoLiquido)}
- Custos Operacionais (total): ${fmt(m.custoTotal)}
- Resultado Líquido (gráfico): ${fmt(m.resultadoLiquido)}
- Perdas por Disputa/Scam${m.perdasErro ? " (FALHA ao consultar)" : ""}: ${m.perdasErro ? "indisponível" : fmt(m.perdasTotal)}
- Lucro Real (Resultado Líquido − Perdas confirmadas): ${m.lucroReal === null ? "indisponível" : fmt(m.lucroReal)}
${m.moedasSemCotacao ? `\nAtenção: ${m.moedasSemCotacao} ocorrência(s) sem cotação foram excluídas da soma.` : ""}

Custos por categoria:
${Object.entries(m.custosPorCategoria).map(([k, v]) => `  - ${k}: ${fmt(v)}`).join("\n")}

Ocorrências de perda do período (${m.ocorrencias.length} total):
${ocorrenciasSlice.map((o) => `  - ${o.titulo} [${o.tipo}]: ${fmt(o.valorBRL)}`).join("\n") || "  (nenhuma)"}
${ocorrenciasExtras > 0 ? `  …e ${ocorrenciasExtras} outra(s).` : ""}

${exposicaoBlock}

Escreva o resumo em 5 a 8 frases, em português, seguindo as regras do system prompt.
`.trim();

    const systemPrompt = `Você é um analista financeiro objetivo. Receberá métricas JÁ CALCULADAS pelo sistema — NÃO recalcule, NÃO arredonde, NÃO invente categorias.

FORMATO DE SAÍDA OBRIGATÓRIO: lista de tópicos curtos, NUNCA parágrafos longos. Cada tópico segue EXATAMENTE este padrão (uma linha por tópico, separadas por linha em branco):

**Título do tópico**: 1 a 2 frases curtas e diretas explicando o significado (não apenas repetir o número).

Use NESTA ORDEM os títulos a seguir (mantenha os títulos em negrito exatamente como abaixo):

1. **Período**: cite o label e o intervalo recebidos. Se "janelaInsuficiente", avise que os totais podem estar truncados.
2. **Fluxo Líquido**: o que entrou/saiu dos projetos no período.
3. **Resultado Líquido**: como ele já desconta os custos operacionais.
4. **Perdas (Disputa/Scam)**: se houver, quanto e impacto. Se zero, afirmar "Não foram registradas perdas confirmadas neste período". Se "indisponível", alertar que não foi possível confirmar — NÃO presumir zero.
5. **Lucro Real**: Resultado Líquido − Perdas confirmadas. Deixe claro se é igual ou menor que o Resultado Líquido.
6. **Exposição Pendente**: cite Em Disputa e Irrecuperável SEMPRE — mesmo quando zero. Quando houver, destaque segmentos (casas, parceiros, wallets, caixa).
7. **Cenário Worst-Case**: sinalize que esses valores ainda não impactaram o Lucro Real, mas representam risco — referencie "Lucro Real worst-case" quando disponível.

REGRAS:
- Nunca produza um parágrafo único. Sempre tópicos separados por linha em branco.
- Cada tópico: máximo 2 frases curtas.
- Tom direto, técnico, sem floreio. Contextualize, não repita exaustivamente os números.`;

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