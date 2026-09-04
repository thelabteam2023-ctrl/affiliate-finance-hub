---
name: Origem/Destino obrigatórios no cash_ledger
description: SAQUE/DEPOSITO/TRANSFERENCIA nunca podem ser gravados sem origem_tipo e destino_tipo; trava no dialog e trigger no banco
type: constraint
---

Transações de SAQUE, DEPOSITO e TRANSFERENCIA **não podem** ser gravadas sem
`origem_tipo` e `destino_tipo`. Registros órfãos não debitam saldo da casa, não
geram `financial_events`, não entram no extrato do projeto e ainda aparecem no
Caixa Operacional rotulados como "Despesa Externa" (fallback de exibição).

Proteções em vigor:
- `CaixaTransacaoDialog.tsx` → `handleSubmit` bloqueia submit sem origem/destino.
- `CaixaTransacaoDialog.tsx` → `resetFormAfterSuccess` chama
  `aplicarDefaultsOrigemDestino()`; nunca limpar `origemTipo`/`destinoTipo`
  sem repor os defaults (o efeito de defaults só dispara ao mudar `tipoTransacao`).
- Banco: trigger `trg_guard_cash_ledger_origem_destino` (BEFORE INSERT).

**Why:** incidente BORA JOGAR 03/09/2026 — saque de R$ 1.500 gravado órfão em
lançamento sequencial (dialog aberto após sucesso anterior).
