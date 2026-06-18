# Resumo Operacional (Agente de IA) — Plano de implementação

## 1. Auditoria das fórmulas existentes (FONTE DA VERDADE)

Antes de qualquer código, congelar e documentar exatamente o que o sistema já calcula. Resultado da auditoria do código atual:

### 1.1 Fluxo Líquido / Custos / Resultado Líquido
Definidos em `src/hooks/useFinanceiroMensal.ts` (linhas 10–27, 67+) e consumidos por `src/pages/Financeiro.tsx`:

- **`fluxoLiquido`** — motor canônico `fetchProjetosLucroCanonico` (paridade com Visão Financeira):
  `Σ(SAQUE + SAQUE_VIRTUAL).valor_confirmado − Σ(DEPOSITO + DEPOSITO_VIRTUAL[origem=MIGRACAO]).valor`, filtro `status='CONFIRMADO'`, convertido em BRL via cotações OFICIAIS (PTAX/FastForex). **Fallback legado**: leitura crua de `cash_ledger` se `cotacoesOficiais` ausente.
- **`custoTotal`** = `cac + comissoes + bonus + infra + rh + operadores + participacoes`, com mesma agregação por mês usada nos cards de Composição de Custos.
- **`resultadoLiquido`** = `fluxoLiquido − custoTotal` (exatamente o número plotado no gráfico de Análise Temporal e no KPI Rail).
- **Janela**: respeita `meses` (6/12/24) e `dataInicio`/`dataFim` já calculados em `Financeiro.tsx`.

→ **Regra**: o agente **NÃO recalcula** nada disso. Recebe os valores já produzidos pelo `useFinanceiroMensal` agregados na janela ativa (soma dos meses dentro do período visível).

### 1.2 Ocorrências (disputa/scam) — schema real
Tabela `public.ocorrencias` (colunas confirmadas no DB):
- `workspace_id uuid` (RLS já filtra)
- `tipo` enum
- `status` enum
- `resultado_financeiro` enum: `'perda_confirmada' | 'perda_parcial' | 'sem_impacto' | NULL`
- `valor_perda numeric`, `moeda text`
- `data_ocorrencia date`, `resolved_at timestamptz`

Critério já em uso no sistema (`src/hooks/useExposicaoFinanceira.ts:153`, `src/components/projeto-detalhe/ProjetoOcorrenciasTab.tsx:94`, `IncidentesEstatisticasTab.tsx:291`):
```
resultado_financeiro IN ('perda_confirmada','perda_parcial')
```
→ **Reaproveitamos esse exato critério**. Não criamos taxonomia nova.

### 1.3 Ambiguidades a sinalizar (não silenciar)
1. **Campo `tipo`**: o prompt fala em "disputa/scam", mas hoje o sistema NÃO filtra perdas por `tipo`; usa apenas `resultado_financeiro`. Isso significa que **toda perda confirmada/parcial** (não só disputa/scam) entrará na soma — coerente com o restante do sistema, mas precisa estar documentado na UI (tooltip do card "Perdas").
2. **Atribuição temporal**: usar `data_ocorrencia` (consistente com `useExposicaoFinanceira`), não `resolved_at`. Documentar.
3. **Conversão de moeda**: `valor_perda` está em `moeda`; converter para BRL usando as MESMAS `cotacoesOficiais` já passadas ao `useFinanceiroMensal` (não cotação live), garantindo paridade.
4. **Resultado Líquido NÃO inclui perdas hoje** — esse é justamente o gap que o recurso expõe. Documentar no resumo do agente.

## 2. Arquitetura

```text
Financeiro.tsx (Análise Temporal)
   └── <ResumoOperacionalButton />          ← novo, sob o botão "Análise Temporal"
           │ onClick
           ▼
   useResumoOperacional(janela)             ← novo hook
           │ 1. agrega fluxoLiquido/custoTotal/resultadoLiquido da janela (useFinanceiroMensal)
           │ 2. busca ocorrências (perda_confirmada|perda_parcial) no range
           │ 3. converte perdas → BRL via cotacoesOficiais
           │ 4. monta payload determinístico
           ▼
   supabase.functions.invoke('resumo-operacional', { body: payload })
           ▼
   Edge Function `resumo-operacional`
           - auth.getUser() → workspace_id (NUNCA do body)
           - Lovable AI Gateway (google/gemini-3-flash-preview)
           - prompt com números EXATOS + instruções de tom
           - retorna { texto, meta }
           ▼
   <ResumoOperacionalDialog />              ← modal com cards + texto
```

## 3. Camada de dados (cliente)

**Novo hook** `src/hooks/useResumoOperacional.ts`:
- Input: `{ finData, meses, cotacoesOficiais, dataInicio, dataFim }` (mesmas props já disponíveis em `Financeiro.tsx`).
- Reutiliza `useFinanceiroMensal` e soma os meses dentro de `[dataInicio, dataFim]`:
  - `fluxoLiquidoPeriodo`, `custoTotalPeriodo`, `custosPorCategoria` (cac/comissoes/bonus/infra/rh/operadores/participacoes), `resultadoLiquidoPeriodo`.
- Query React Query separada `["ocorrencias-perdas-periodo", workspaceId, dataInicio, dataFim]`:
  ```ts
  supabase.from('ocorrencias')
    .select('id, titulo, tipo, valor_perda, moeda, data_ocorrencia, resultado_financeiro, status')
    .eq('workspace_id', workspaceId)
    .in('resultado_financeiro', ['perda_confirmada','perda_parcial'])
    .gte('data_ocorrencia', dataInicio).lte('data_ocorrencia', dataFim)
  ```
- Converte cada `valor_perda` para BRL com `cotacoesOficiais[moeda]` (fallback 1 só para BRL; se moeda exótica sem cotação, retorna `errorFlag: "moeda_sem_cotacao"` — NUNCA assume zero).
- Computa: `perdasTotalBRL`, `lucroReal = resultadoLiquidoPeriodo − perdasTotalBRL`, `ocorrenciasResumo[]` (id, titulo, valorBRL).
- Retorna `{ status: 'idle' | 'loading' | 'ready' | 'error', payload, error }`.
- `enabled: false` por padrão; o botão chama `refetch()` para executar sob demanda.

## 4. Componente UI

**`src/components/financeiro/ResumoOperacionalButton.tsx`**
- Botão estilo "ghost com ícone Sparkles", inserido no `footer` do `KpiRail` em `Financeiro.tsx` logo abaixo do botão "Análise Temporal" (linhas 379–393).
- onClick → dispara `useResumoOperacional.refetch()` e abre `<ResumoOperacionalDialog />`.

**`src/components/financeiro/ResumoOperacionalDialog.tsx`**
- Dialog (shadcn) com:
  - Header com janela (ex.: "Últimos 12 meses · Mar/25 → Fev/26").
  - **Skeleton** enquanto `status='loading'` (hook + edge function).
  - **Cards numéricos** (grid 5 colunas em desktop, 2 em mobile), na ordem do prompt:
    1. Fluxo Líquido
    2. Custos Operacionais (total) — popover com breakdown por categoria
    3. Resultado Líquido (badge "como exibido no gráfico")
    4. Perdas por Disputa/Scam (total)
    5. **Lucro Real** — card destacado (border-primary, tipografia maior)
  - **Texto narrativo** abaixo (resposta do agente) em `<ReactMarkdown>` (prose).
  - Rodapé: link "Ver ocorrências do período" abre o módulo Ocorrências já filtrado.

**Casos de borda renderizados explicitamente**:
- `perdasTotal === 0` → card Perdas com "—" e texto do agente afirma "Não foram registradas disputas/scams no período. Lucro Real coincide com o Resultado Líquido."
- Erro ao buscar ocorrências → card Perdas exibe **alerta vermelho** "Não foi possível confirmar ocorrências do período" e Lucro Real exibe "Indisponível" (NUNCA fallback silencioso para 0).
- `moeda_sem_cotacao` → card Perdas com badge amarelo "Conversão parcial — N ocorrências sem cotação" e a soma exibida exclui essas linhas, sinalizando isso no texto.

## 5. Edge Function

**`supabase/functions/resumo-operacional/index.ts`** (verify_jwt automático):
- Lê JWT → `supabase.auth.getUser()` → `userId`. Resolve `workspace_id` via `workspace_members` (mesmo padrão dos outros endpoints).
- Valida body com Zod:
  ```ts
  z.object({
    periodo: z.object({ label: z.string(), dataInicio: z.string(), dataFim: z.string() }),
    metricas: z.object({
      fluxoLiquido: z.number(), custoTotal: z.number(), resultadoLiquido: z.number(),
      custosPorCategoria: z.record(z.number()),
      perdasTotal: z.number(), perdasErro: z.boolean().optional(),
      lucroReal: z.number().nullable(),
      ocorrencias: z.array(z.object({ titulo: z.string(), valorBRL: z.number(), tipo: z.string() }))
    })
  })
  ```
- **NÃO confia em workspace_id do body** — apenas usa o do token (já validado).
- Chama Lovable AI Gateway (`google/gemini-3-flash-preview`, sem streaming — texto curto) via `createLovableAiGatewayProvider` + `generateText`. CORS via `npm:@supabase/supabase-js@2/cors`.
- System prompt fixo:
  > "Você é um analista financeiro. Receberá métricas já calculadas. NÃO recalcule, NÃO arredonde, NÃO invente categorias. Produza 3–6 frases em PT-BR explicando: Fluxo Líquido proveniente dos projetos; que o Resultado Líquido já desconta custos; impacto explícito (ou ausência) das disputas/scams; conclusão com Lucro Real. Tom direto, sem floreio."
- User prompt: JSON serializado das métricas + lista resumida de ocorrências (máx 10, truncar com "…e N outras").
- Retorna `{ texto: string, modelo: 'google/gemini-3-flash-preview', tokens: number }`.
- Trata `429` (rate limit) e `402` (créditos) com mensagens claras.

## 6. Posicionamento exato no `Financeiro.tsx`
Editar `KpiRail.footer` (linha 379–393) para receber **dois** botões empilhados: o existente ("Análise Temporal") e o novo ("Resumo Operacional ✨"), com mesma estética. Sem alterar layout dos cards de KPI.

## 7. Restrições obrigatórias (checklist do prompt)
- [x] `workspace_id` vem do JWT na edge function (`supabase.auth.getUser()`).
- [x] Reutiliza dados existentes: `useFinanceiroMensal` + `ocorrencias` (`resultado_financeiro` já em uso).
- [x] Taxonomia inalterada: `perda_confirmada | perda_parcial` (mesmo critério de `useExposicaoFinanceira`).
- [x] Valores monetários transmitidos como `number` sem arredondamento; formatação só na UI (Intl).
- [x] Zero ocorrências → texto explícito.
- [x] Erro de fetch → card vermelho + Lucro Real "Indisponível"; nunca assume 0.
- [x] Sem categorias novas; sem recálculo paralelo de Resultado Líquido.

## 8. Arquivos a criar / editar
**Criar**
- `src/hooks/useResumoOperacional.ts`
- `src/components/financeiro/ResumoOperacionalButton.tsx`
- `src/components/financeiro/ResumoOperacionalDialog.tsx`
- `supabase/functions/resumo-operacional/index.ts`
- `supabase/functions/_shared/ai-gateway.ts` (se ainda não existir — helper Lovable AI)

**Editar**
- `src/pages/Financeiro.tsx` — adicionar 2º botão no footer do `KpiRail` + montar `<ResumoOperacionalDialog />`.
- `.lovable/plan.md` — registrar auditoria (seção 1) como ata permanente.

## 9. Fora de escopo
- Alterar a fórmula oficial de `resultadoLiquido` no resto do sistema.
- Criar nova classificação de ocorrências.
- Persistir resumos gerados (cada clique chama o agente; cache React Query de 5min por janela).
- Streaming token-a-token (resposta curta — `generateText` basta).

## 10. Validação manual mínima
1. Abrir Financeiro → janela 12m → clicar "Resumo Operacional" → conferir que os 4 cards numéricos batem com KPI Rail + Gráfico Mensal.
2. Criar ocorrência teste com `resultado_financeiro='perda_confirmada'`, `valor_perda=5000`, `data_ocorrencia` dentro da janela → Lucro Real = Resultado Líquido − 5000.
3. Resolver/limpar todas as ocorrências do período → texto deve dizer "Não foram registradas disputas/scams".
4. Derrubar a query de ocorrências (simular RLS bloqueado) → card vermelho, Lucro Real = "Indisponível".

## Aprovação
Posso seguir com a implementação nesta ordem (1. edge function → 2. hook → 3. dialog → 4. botão)?
