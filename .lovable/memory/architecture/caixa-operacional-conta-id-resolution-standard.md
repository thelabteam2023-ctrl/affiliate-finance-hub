# Memory: architecture/caixa-operacional-conta-id-resolution-standard
Updated: 2026-03-09

## Regra Crítica: Resolução de conta_bancaria_id/wallet_id para Caixa Operacional

### Problema Identificado
Lançamentos no `cash_ledger` com `origem_tipo = CAIXA_OPERACIONAL` eram criados SEM `origem_conta_bancaria_id` ou `origem_wallet_id`. Como as views de saldo (`v_saldo_parceiro_contas`, `v_saldo_contas_bancarias`) calculam saldos baseados nesses campos de referência, transações sem eles eram "invisíveis" para o cálculo de saldo — o dinheiro saía do caixa mas o saldo não era atualizado.

### Causa Raiz
O componente `OrigemPagamentoSelect` exibia saldos agregados por moeda para a Caixa Operacional, mas não resolvia o `conta_bancaria_id` específico do parceiro caixa. Todos os diálogos que usavam este componente (Despesas, Comissões, Pagamentos) tinham o mesmo bug.

### Correção Aplicada
O `OrigemPagamentoSelect` agora:
1. Mapeia contas bancárias e wallets do parceiro Caixa Operacional por moeda/coin durante o `fetchData`
2. Auto-resolve e propaga `origemContaBancariaId`/`origemWalletId` quando `CAIXA_OPERACIONAL` é selecionado
3. Também resolve no efeito de recálculo inicial (quando o componente monta com CAIXA_OPERACIONAL como default)

### Regra de Ouro
**TODO** lançamento no `cash_ledger` DEVE ter `origem_conta_bancaria_id` ou `origem_wallet_id` preenchido quando a origem é CAIXA_OPERACIONAL. Sem isso, o débito não será contabilizado nas views de saldo.
