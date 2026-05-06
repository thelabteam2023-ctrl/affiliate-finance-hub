## Diagnóstico

A causa do bug está isolada em **`src/pages/ProjetoDetalhe.tsx`**, linhas 940–1100.

O contêiner pai das abas é:

```tsx
<div className="flex-1 min-h-0 overflow-hidden">   // ← trava altura e esconde overflow
  <TabsContent value="apostas" className="h-full m-0 ..."> // ← força altura fixa
    <ProjetoApostasTab ... />                       // ← retorna <div className="space-y-4"> SEM scroll
  </TabsContent>
  ...
</div>
```

- `overflow-hidden` no wrapper + `h-full` no `TabsContent` impõem altura fixa = altura da viewport.
- Abas "operacionais" (`Apostas`, `Visão Geral`, `Bônus`, `Surebet`, `ValueBet`, `DuploGreen`, `Punter`, `Promoções`, `Cashback`, `Vínculos`, etc.) renderizam um `<div class="space-y-4">` simples, **sem `overflow-y-auto`**, então o conteúdo que excede é cortado.
- Só funcionam corretamente as abas que gerenciam o próprio scroll internamente: `Planejamento` (`ProjetoPlanejamentoTab` linha 200/305) e `Calendário Real` da página `/planejamento` (`PlanejamentoCalendario`).

Confirmado via grep: nenhum outro local global mudou. O `App.tsx` (`h-screen overflow-hidden` no shell + `main flex-1 min-h-0 overflow-hidden`) e a página `PlanejamentoCampanhas` estão corretos e isolados.

## O que mudar

Edição cirúrgica em **`src/pages/ProjetoDetalhe.tsx`** apenas.

Adicionar `overflow-y-auto` em cada `TabsContent` que não gerencia scroll próprio. A aba `planejamento` fica intocada (já tem scroll interno e botões flutuantes que dependem do contêiner atual).

Mudança por linha (className do `TabsContent`):

| Tab | Antes | Depois |
|---|---|---|
| visao-geral, apostas, promocoes, bonus, punter, surebet, valuebet, duplogreen, cashback, vinculos, gestao, freebets, giros-gratis, ocorrencias, perdas, movimentacoes, extrato, ciclos, comparativo, modulos, incidentes, parcerias, operadores, saques-broker, historico-vinculos, historico-conciliacoes | `"h-full m-0"` | `"h-full m-0 overflow-y-auto"` |
| **planejamento** | `"h-full m-0"` | **mantém `"h-full m-0"`** (scroll é interno) |

Isso restaura o padrão recomendado pelo usuário:

```
wrapper (overflow-hidden, altura fixa)
  └─ TabsContent (h-full overflow-y-auto)   ← scroll local da aba
        └─ conteúdo da aba (space-y-4)
```

Cada aba ganha seu próprio contexto de scroll, sem afetar o layout global, sem mexer em `App.tsx`, `PlanejamentoCampanhas` nem em qualquer aba do Planejamento.

## Validação

1. `/projeto/:id?tab=apostas` → lista completa rola dentro da aba; topbar/abas ficam fixos.
2. `/projeto/:id?tab=visao-geral` → cards e gráficos do final da página visíveis via scroll.
3. `/projeto/:id?tab=planejamento` → scroll interno e botões flutuantes (Subir/Hoje/Descer) funcionam exatamente como antes.
4. `/planejamento` (Calendário Real / Histórico Detalhado / Simulado) → inalterado.
5. Demais páginas (`/caixa`, `/financeiro`, etc.) → inalteradas (não tocamos em layout global).

## Fora de escopo

Sem alterações em `App.tsx`, `index.css`, `PlanejamentoCampanhas`, `PlanejamentoCalendario`, `ProjetoPlanejamentoTab`, filtros, lógica de negócio ou qualquer outro arquivo.
