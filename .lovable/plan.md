## Objetivo

Reescrever as tooltips dos 4 KPIs do Financeiro (**Patrimônio**, **Fluxo Líquido**, **Resultado Líquido**, **Margem Operacional**) em linguagem de usuário leigo: frase curta de significado + linha visual da fórmula. Trocar também o label "Margem Op." por "Margem Operacional".

## Princípios da nova copy

1. **Primeira linha = o que é**, em uma frase humana (≤ 18 palavras).
2. **Segunda linha = como ler**, dando o cenário positivo (ex.: "quanto maior, melhor").
3. **Bloco fórmula** em destaque visual: caixinha com fundo `bg-muted/50`, fonte `font-mono text-[11px]`, símbolo `=` em vez de prosa.
4. Sem jargão técnico (`patrimônio parado`, `transferências internas`, `lucro teórico`, `efetivamente confirmado`).
5. Sem repetir o nome do KPI dentro da tooltip.

## Conteúdo final das tooltips

**Patrimônio**
> Tudo o que você tem hoje somado em reais: caixa, contas em casas, parceiros e cripto. É a foto atual do dinheiro disponível na operação.
>
> `Caixa + Bookmakers + Parceiros + Cripto`

**Fluxo Líquido**
> O caixa que de fato saiu da operação dos projetos no período — quanto você retirou a mais do que precisou repor.
>
> Positivo: a operação está devolvendo dinheiro. Negativo: precisou colocar mais do que tirou.
>
> `Saques dos projetos − Depósitos nos projetos`

**Resultado Líquido**
> O que sobrou no bolso depois de pagar todos os custos do período (operadores, comissões, bônus, infra, etc.).
>
> É o lucro real do mês — o que aumentou seu patrimônio de fato.
>
> `Fluxo Líquido − Custos do período`

**Margem Operacional** (label trocado de "Margem Op.")
> De cada R$ 1 movimentado na operação, quanto sobrou para você depois dos custos. Quanto maior, mais eficiente o período.
>
> Acima de 30% é saudável. Negativo significa que os custos comeram tudo que entrou.
>
> `Fluxo Líquido ÷ (Fluxo Líquido + Custos)`

## Mudanças no código

**Arquivo único:** `src/pages/Financeiro.tsx`

1. Trocar `label="Margem Op."` → `label="Margem Operacional"`.
2. Substituir os 4 valores de `tooltip` pelos blocos acima, usando JSX com estrutura padronizada:
   ```tsx
   <div className="space-y-2 max-w-[280px]">
     <p>{frase 1}</p>
     <p className="text-muted-foreground">{frase 2}</p>
     <div className="rounded-md bg-muted/60 px-2 py-1.5 font-mono text-[11px] text-foreground/90">
       {fórmula}
     </div>
   </div>
   ```
3. Remover a frase *"É a base da Margem Operacional."* do tooltip do Fluxo Líquido (deixa de ser nota de implementação).
4. Atualizar a referência `SecondaryRow label="Lucro Op. teórico"` → manter (continua sendo informação numérica útil, não é tooltip).

## Validação

- `bunx vitest run` (sem regressão — tooltips são puramente visuais, sem teste atrelado).
- Hover manual em cada card para conferir wrap em 280px e legibilidade.

## Fora de escopo

- Mudar fórmulas, dados, threshold de cor ou layout dos cards.
- Adicionar ícone/badge novo dentro do tooltip.
- Refatorar `HeaderKpiCard`.
