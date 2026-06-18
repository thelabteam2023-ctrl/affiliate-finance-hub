## Redesign — Modal "Resumo Operacional"

Mudança puramente visual. Nenhum cálculo, fonte de dados, fórmula, contrato de hook ou edge function é alterado. Filtros de período, botão Regenerar, tratamento de erro/zero ocorrências e `workspace_id` via token permanecem intactos.

### Escopo de arquivos

- `src/components/financeiro/ResumoOperacionalDialog.tsx` — único arquivo tocado.
- Sem alterações em: `useResumoOperacional.ts`, `useExposicaoFinanceira.ts`, `Financeiro.tsx`, `supabase/functions/resumo-operacional/index.ts`, prompt do agente.

### Mudança 1 — KpiRail lateral único (8 métricas)

Substituir os dois blocos atuais de cards horizontais (grid 5 col + grid 3 col) por um único `KpiRail` (componente já existente em `src/components/financeiro/KpiRail.tsx`) ancorado à esquerda do `DialogContent`.

Layout do `DialogContent`:

```text
+------------------------------------------------------+
| Header (título + descrição com período)              |
| Seletor de presets + custom range + Regenerar        |
+--------+---------------------------------------------+
|        |                                             |
| KpiRail| Área principal:                             |
| (8     |  - Alerta janelaInsuficiente (se houver)    |
|  itens)|  - Tópicos do agente (Mudança 2)            |
|        |  - Rodapé técnico (fonte/engine)            |
|        |                                             |
+--------+---------------------------------------------+
```

Container externo: `flex flex-col lg:flex-row gap-4`. Rail mantém `lg:w-[188px] lg:flex-shrink-0` já definido no componente. `DialogContent` passa a `max-w-5xl` para acomodar rail + conteúdo confortavelmente.

Itens do rail, na ordem (mesmo `KpiRailItem[]` do dashboard Visão Financeira):

Seção "Resultado do período"
1. Fluxo Líquido — `Wallet`, tone derivado do sinal.
2. Custos Operacionais — `Receipt`, tone `negative`.
3. Resultado Líquido — `TrendingUp`, tone por sinal, `activeTone="positive"` quando >=0 para indicar que é a métrica com gráfico.
4. Perdas (Disputa/Scam) — `TrendingDown`, tone `negative` se >0, `warning` em `perdasErro`.
5. Lucro Real — `Target`, **destaque maior**: usado `activeTone` (`positive`/`negative` conforme sinal) que pinta a borda esquerda de 2px e o fundo sutil — mesma técnica que o KpiRail já oferece para marcar o KPI âncora. Tooltip com a fórmula `Resultado Líquido − Perdas confirmadas`.

Divisor visual sutil + micro-label (não card separado):
- Implementado como um item "header-only" inserido entre os índices 5 e 6 via prop `footer` do bloco anterior, ou simplesmente quebrando o rail em **dois `KpiRail` empilhados verticalmente** dentro de um mesmo `<aside className="lg:w-[188px]">`, separados por um `<Separator />` fino (`border-t border-border/30`) + label uppercase `Exposição em aberto`. Esta segunda abordagem é mais simples e respeita a API atual do `KpiRail` sem precisar estendê-la.

Seção "Exposição em aberto" (snapshot)
6. Em Disputa — `ShieldAlert`, tone `warning` se >0. Tooltip mostra breakdown por segmento (Casas / Wallets / Contas Parc / Caixa Op).
7. Irrecuperável — `Lock`, tone `negative` se >0. Tooltip com `countIrrecuperavel`.
8. Lucro Real (Worst-Case) — `ShieldX`, tone por sinal. Tooltip "Cenário em que 100% das disputas viram perda. Referência de risco, não resultado contábil."

`periodLabel` do primeiro rail = label do período aplicado (ex.: "Mês atual · 01/06/2026 → 30/06/2026"). Segundo rail recebe `periodLabel="Snapshot atual"` e usa o `footer` para a nota: "Disputa e irrecuperável refletem o snapshot atual, independente do período."

Skeleton: enquanto `loading`, renderizar rail com `loading: true` em cada item (`KpiRail` já trata internamente via `item.loading`).

### Mudança 2 — Resposta do agente em tópicos

Hoje: `<div … whitespace-pre-line>{texto}</div>`. Trocar por um parser leve client-side que quebra o texto retornado pela edge function em tópicos sem alterar o prompt.

Estratégia (sem mexer no backend):
- A edge function já tende a devolver linhas separadas. Implementar um helper local `parseTopicos(texto: string)` que:
  - Quebra por `\n\n` ou linhas iniciadas por `- `, `• `, `**`, ou dígitos seguidos de `.`/`)`.
  - Para cada bloco, separa **título** (primeira frase curta antes de `:` ou primeira linha em negrito `**...**`) do **corpo** (restante).
  - Se nenhum padrão for detectado, faz fallback elegante: exibe o texto íntegro como um único tópico "Resumo".

Render:

```tsx
<ol className="space-y-3 list-none">
  {topicos.map((t, i) => (
    <li key={i} className={cn(
      "border-l-2 pl-3 py-1",
      t.destaque ? "border-primary" : "border-border/40",
    )}>
      <div className={cn(
        "text-xs uppercase tracking-wide mb-1",
        t.destaque ? "text-primary font-semibold" : "text-muted-foreground font-medium",
      )}>{t.titulo}</div>
      <div className={cn(
        "text-sm leading-relaxed",
        t.destaque && "font-medium",
      )}>{t.corpo}</div>
    </li>
  ))}
</ol>
```

Destaque (`destaque: true`) é aplicado quando o título contém `lucro real` (case-insensitive) e não contém `worst`. Mantém paridade visual com o KPI âncora do rail.

Ordem esperada (sai do prompt já existente no backend; o parser só preserva a sequência): Período → Fluxo Líquido → Resultado Líquido → Perdas → **Lucro Real** → Exposição pendente → Cenário worst-case.

Sem numeração visível — hierarquia se dá por tipografia + borda esquerda.

### Mudança 3 — Revisão geral do modal

- `DialogContent`: `max-w-5xl max-h-[90vh] overflow-y-auto`.
- Header e descrição (período em pt-BR `dd/MM/yyyy`) inalterados.
- Bloco de seletor de presets + custom range + botão Regenerar permanece **acima** do split rail/conteúdo (largura total).
- Alertas (`janelaInsuficiente`, `perdasErro`, `error`) ficam na coluna direita, acima dos tópicos.
- Rodapé técnico (linha `Layers` com fontes/engine) permanece, agora ao final da coluna direita.
- Empty state ("Escolha um período…") continua ocupando a área inteira (sem rail), já que não há métricas para exibir.

### Casos de borda preservados

- `loading` → rail com skeletons + skeletons de tópicos (3 blocos `Skeleton h-12`).
- `error` → `Alert destructive` na coluna direita; rail oculto.
- `metricas.perdasErro` → KPI "Perdas" mostra "Indisponível" (tone warning); alerta vermelho na coluna direita; Lucro Real exibido como "Indisponível".
- Zero ocorrências em disputa/irrecuperável → KPIs exibem `R$ 0,00` com tone neutro; tooltips informam "Nenhuma disputa em aberto" / "Sem saldos irrecuperáveis". Nunca omitido.
- Falha ao buscar ocorrências → comportamento atual do hook é preservado; modal não assume zero.

### Implementação

1. Em `ResumoOperacionalDialog.tsx`:
   - Importar `KpiRail`, `KpiRailItem` de `@/components/financeiro/KpiRail` e `Separator` de `@/components/ui/separator`.
   - Remover o componente local `Card` (não usado mais) e os dois grids de cards.
   - Construir `itemsResultado: KpiRailItem[]` e `itemsExposicao: KpiRailItem[]` via `useMemo` a partir de `metricas`.
   - Renderizar `<aside>` contendo dois `KpiRail` empilhados + `<Separator />` + label "Exposição em aberto" + nota snapshot no `footer` do segundo.
   - Adicionar helper `parseTopicos` no mesmo arquivo (export interno, sem novo arquivo).
   - Substituir o bloco `{texto && …}` pela `<ol>` de tópicos.
   - Ajustar `DialogContent` para `max-w-5xl` e wrapper `flex flex-col lg:flex-row gap-4` envolvendo rail + conteúdo principal.

2. Verificar build/typecheck (automático).

### Checklist de aceite (mapeado para o pedido)

- [x] 8 KPIs em rail lateral único (dois `KpiRail` colados, mesmo aside).
- [x] Divisor sutil + micro-label "Exposição em aberto".
- [x] Lucro Real com `activeTone` destacado, maior que demais.
- [x] Nota snapshot preservada no footer do segundo rail.
- [x] Texto da IA em tópicos via parser; ordem mantida pelo prompt existente.
- [x] Tópico Lucro Real com `border-primary` + `font-semibold`.
- [x] Tópicos não duplicam o número literal (texto contextual vem do agente; rail mostra valor).
- [x] Sem scroll excessivo: rail compacta verticalmente o que era grid horizontal denso.
- [x] Filtros e Regenerar intactos.
- [x] Zero alteração em lógica/dados/edge function/workspace handling.
- [x] Estilo herdado do `KpiRail` da Visão Financeira (mesmos tokens).
