---
name: perna-composta-render-relacional-standard
description: Fetchers de Surebet/Aposta DEVEM embedar apostas_perna_entradas e popular perna.entries — modelo 1:N
type: feature
---
No modelo 1:N (uma linha em `apostas_pernas` com N linhas em
`apostas_perna_entradas`), o `SurebetCard` só renderiza pernas compostas
(multi-casa) se `perna.entries` estiver populado.

**Regra obrigatória:** todos os fetchers que alimentam `SurebetCard` precisam
embedar `apostas_perna_entradas(*)` no select de `apostas_pernas` e converter
o array em `entries: SurebetPernaEntry[]` via `formatPernaEntradas` (em
`src/utils/formatPernaEntradas.ts`) quando `length > 1`.

Fetchers cobertos:
- `src/components/projeto-detalhe/ProjetoSurebetTab.tsx`
- `src/components/projeto-detalhe/ProjetoApostasTab.tsx`
- `src/components/projeto-detalhe/ProjetoDuploGreenTab.tsx`
- `src/components/projeto-detalhe/bonus/BonusApostasTab.tsx`

`groupPernasBySelecao` respeita `entries` pré-populadas (modelo relacional)
com precedência sobre o agrupamento legado por `selecao` (várias linhas em
`apostas_pernas` com mesma seleção — JSONB antigo).

Proibido: depender de duplicidade em `apostas_pernas.selecao` para inferir
sub-entradas no novo modelo. Hidratação do form (`fetchLinkedPernas`) já
embeda corretamente; abas de listagem precisam manter a mesma paridade.