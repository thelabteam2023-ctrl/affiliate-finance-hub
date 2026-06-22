---
name: Surebet Perna Read With Entradas Standard
description: Toda leitura de pernas para renderização DEVE trazer apostas_perna_entradas e popular SurebetPerna.entries[]. A entrada denormalizada em apostas_pernas é apenas conveniência de saldo.
type: architecture
---

# Padrão de Leitura — Pernas 1:N (apostas_perna_entradas)

## Regra

Cada perna de operação ARBITRAGEM/SUREBET pode ter **N entradas** em
`apostas_perna_entradas`, cada uma com **bookmaker + parceiro próprios**.
Exemplo real:

- NORUEGA X SENEGAL · perna X = VAVE (Juliana) + HUGEWIN (Wallyson), ambas USD.

Toda query de leitura que alimenta `SurebetCard` (ou equivalente) **DEVE**:

1. Incluir o subselect `apostas_perna_entradas (...)` na query de `apostas_pernas`.
2. Pré-carregar `bookmakers` (com `parceiros` + `bookmakers_catalogo`) para
   **todos** os `bookmaker_id` que aparecem nas entradas — não basta o da
   linha principal.
3. Popular `SurebetPerna.entries[]` com display name
   `"{nome}{(instance)?} - {parceiro}"`.
4. Calcular `odd_media` ponderada e `stake_total` a partir das entradas (na
   moeda original; consolidação multi-moeda é responsabilidade do card).

A "entrada principal" denormalizada em `apostas_pernas` (campos
`bookmaker_id`, `odd`, `stake`, etc.) existe apenas para conveniência de
saldo/auditoria. **Nunca substitui** a leitura das entradas.

## Consumidores que seguem o padrão

- `src/components/projeto-detalhe/ProjetoApostasTab.tsx`
- `src/components/projeto-detalhe/ProjetoSurebetTab.tsx`
- `src/components/projeto-detalhe/ProjetoDuploGreenTab.tsx` (branch ARBITRAGEM)
- `src/components/projeto-detalhe/bonus/BonusApostasTab.tsx` (branch surebets)

## Helper canônico

`src/utils/mapPernaWithEntries.ts` exporta `SELECT_APOSTAS_PERNA_ENTRADAS`,
`buildPernaEntries`, `buildBookmakerDisplayName`, `sumEntriesStake` e
`weightedAvgOdd`. Use-os em vez de reescrever a transformação.

## Regressão de origem

Junto com o modelo Lay/Back o motor de gravação migrou para 1:N
(`criar_surebet_atomica_v3` + `apostas_perna_entradas`). Os consumidores não
foram atualizados e seguiram lendo só de `apostas_pernas`, causando
"desaparecimento" silencioso de casas adicionais (Junho/2026, P0).
Persistência sempre esteve correta — bug era 100% no caminho de leitura.

## Anti-regressão

- Não acessar `apostas_pernas` para fins de renderização sem o subselect.
- Qualquer auditoria de exposição por parceiro precisa contemplar
  `apostas_perna_entradas.bookmaker_id`, não apenas `apostas_pernas.bookmaker_id`.
