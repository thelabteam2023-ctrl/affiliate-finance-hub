---
name: Aposta LIQUIDADA edit UI guard
description: Confirmação obrigatória antes de salvar edição de aposta já LIQUIDADA + probe de paridade saldo×ledger pós-edição
type: feature
---
Toda edição em `ApostaDialog` cuja aposta esteja em status `LIQUIDADA` deve
exigir confirmação explícita do usuário antes de prosseguir, porque o caminho
de salvar (`atualizar_aposta_liquidada_atomica_v2` / `reliquidar_aposta_v6` /
`editar_aposta_liquidada_v4`) faz REVERSAL no `cash_ledger` e reemite eventos.

Em paralelo, `src/utils/integrityProbe.ts` expõe
`probeBookmakerLedgerParity(bookmakerId)` que compara `bookmakers.saldo_atual`
com `SUM(cash_ledger.valor)` para a bookmaker e registra
`SALDO_LEDGER_DIVERGENTE` em `window.__INTEGRITY_LOG__` quando |Δ| > R$ 0,01.
Usar como observabilidade pós-edição de aposta LIQUIDADA.