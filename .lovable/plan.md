## Objetivo

Remover o chip visual `LayBadge` ("LAY") dos cards de operação. A informação já é comunicada de forma inequívoca pelo prefixo `Lay @2.10` (texto vermelho) na coluna da odd, então o badge se tornou ruído visual redundante.

Mudança puramente cosmética. Sem alterações de schema, RPC, RLS, cálculo de lucro/responsabilidade ou propagação de `tipo`/`comissao`. A lógica de detecção `isLay` continua intacta — só a renderização do chip sai.

## Escopo

### 1. `src/components/projeto-detalhe/SurebetCard.tsx`
Remover as 4 ocorrências de `<LayBadge />`:

- Linha ~352 — variante coluna (header da perna)
- Linha ~416 — variante list (linha de exposição)
- Linha ~477 — variante list (inline ao lado da odd)
- Linha ~500 — variante list (rodapé da perna)

Remover também o import:
```ts
import { LayBadge } from "@/components/surebet/LayBadge";
```

Garantir que nenhum wrapper vazio (`<div className="hidden sm:block shrink-0"></div>`, `<span className="ml-1.5 ...">`) fique pendurado depois da remoção — apagar o elemento pai junto quando ele só servia para o badge.

### 2. `src/components/surebet/LayBadge.tsx`
Deletar o arquivo. Após a remoção dos imports em `SurebetCard.tsx`, o componente não é referenciado em nenhum outro lugar do projeto (verificado via `rg LayBadge src/`).

## Fora de escopo

- Não tocar em `ApostaCard.tsx`, `ProjetoApostasTab.tsx`, `ProjetoSurebetTab.tsx`, `pernaLayHelpers.ts`, `integrityProbe.ts` ou `groupPernasBySelecao.ts`.
- Não alterar cores, espaçamentos ou hierarquia do prefixo `Lay @odd` / `Resp R$ X` já estabelecidos na etapa anterior.
- Não mexer em testes, memórias ou migrations.

## Validação

- `rg LayBadge src/` deve retornar zero resultados após a mudança.
- Build limpo, sem warnings de import órfão.
- Inspeção visual nas abas "Surebet" e "Todas as Apostas": pernas LAY exibem `Lay @x.xx` em vermelho + `Resp R$ ...` abaixo, sem nenhum chip "LAY".
