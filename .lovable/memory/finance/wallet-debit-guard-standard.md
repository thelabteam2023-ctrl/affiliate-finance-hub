# Memory: finance/wallet-debit-guard-standard
Updated: 2026-04-01

## Guard de Débito em Wallet Crypto (Proteção contra Saldo Negativo)

### Problema Resolvido

O sistema permitiu uma transferência de 1.86 LTC (≈100.77 USD) de uma wallet que nunca recebeu crédito, gerando saldo negativo de -100.77. A operação também usou rede incorreta (Litecoin vs ERC20).

### Proteção Implementada: `trg_guard_wallet_debit`

Trigger BEFORE INSERT no `cash_ledger` que:

1. **Valida saldo**: Calcula saldo em `qtd_coin` da wallet (baseado em transações CONFIRMADO + CONFIRMED) e bloqueia se insuficiente
2. **Valida rede**: Para TRANSFERENCIA, verifica se `network` da wallet origem = `network` da wallet destino
3. **Exceções**: Não bloqueia REVERSAO_AUDITORIA, AJUSTE_RECONCILIACAO, AJUSTE_MANUAL, AJUSTE_SALDO (são correções)

### Tipo de Transação: REVERSAO_AUDITORIA

Usado para reverter operações incorretas de forma auditável. Registra `transacao_original_id` e `motivo` no `auditoria_metadata`.

### Regras de Ouro

> "Nenhuma wallet pode ficar com saldo negativo — o trigger `guard_wallet_debit` bloqueia na camada de banco."
> "Transferências entre wallets de redes diferentes são bloqueadas automaticamente."
> "Correções de saldo usam REVERSAO_AUDITORIA, nunca DELETE ou UPDATE direto."
