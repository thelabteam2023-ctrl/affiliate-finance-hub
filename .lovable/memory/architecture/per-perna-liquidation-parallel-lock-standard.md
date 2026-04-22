---
name: per-perna-liquidation-parallel-lock-standard
description: liquidar_perna_surebet_v1 deve adquirir SELECT FOR UPDATE no pai antes de COUNT — Promise.all client-side cria race condition que trava status em PARCIAL
type: feature
---

# Liquidação por perna em paralelo — Lock obrigatório do pai

## Problema
Em todas as abas (Bonus/ValueBet/Punter/DuploGreen/Surebet), `handleQuickResolveSurebet`
dispara `liquidar_perna_surebet_v1` em paralelo via `Promise.all` para cada perna.

Antes do fix, cada chamada:
1. UPDATE da própria perna
2. SELECT COUNT(*) para decidir se todas estão liquidadas

Como rodam em transações separadas (READ COMMITTED), nenhuma vê os UPDATEs das outras
até elas commitarem. Resultado: todas decidem `PARCIAL`, o pai nunca vira `LIQUIDADA`,
`pl_consolidado` fica NULL, KPIs (Performance/Juice/Bônus) ignoram a aposta.

## Fix
`liquidar_perna_surebet_v1` faz `SELECT 1 FROM apostas_unificada WHERE id = pai FOR UPDATE`
logo após carregar a perna. Isso serializa as N chamadas paralelas; a última a entrar
vê todas as N pernas liquidadas e marca o pai como `LIQUIDADA` chamando
`fn_recalc_pai_surebet`.

## Reconciliação preventiva
Migração inclui DO block que detecta apostas `forma_registro='ARBITRAGEM'` em status
`PARCIAL` com 0 pernas pendentes — vítimas do bug — e força `LIQUIDADA` via
`fn_recalc_pai_surebet`.

## Não alterar no client
Manter `Promise.all` no `handleQuickResolveSurebet` — performance. O lock no banco é
suficiente. Serialização client-side seria 3-5x mais lenta sem ganho de correção.
