# Memory: architecture/caixa-operacional-virtual-partner
Updated: 2026-03-07

## Parceiro Virtual "Caixa Operacional"

O Caixa Operacional é modelado como um **parceiro virtual** na tabela `parceiros` com `is_caixa_operacional = true`. Cada workspace tem exatamente UM parceiro deste tipo (enforced via unique partial index).

### Schema
- `parceiros.is_caixa_operacional` (boolean, default false)
- `idx_parceiros_caixa_operacional_unique` — unique index on `(workspace_id) WHERE is_caixa_operacional = true`
- Trigger `tr_auto_create_caixa_operacional` — cria automaticamente ao adicionar owner ao workspace
- Trigger `tr_protect_caixa_operacional` — impede exclusão

### Benefício Arquitetural
Reutiliza 100% da infraestrutura existente:
- `contas_bancarias` (FK parceiro_id) → Bancos da empresa
- `wallets_crypto` (FK parceiro_id) → Wallets da empresa
- Views `v_saldo_parceiro_contas` e `v_saldo_parceiro_wallets` funcionam sem alteração
- Ledger, reconciliação, ajuste manual — tudo funciona imediatamente

### Regras
- O parceiro caixa é **filtrado** das listagens de parceiros reais (SaldosParceirosSheet, filtros)
- O parceiro caixa é **mantido** no lookup map para resolução de labels em transações
- UI: Componente `ContasEmpresaSection` no Caixa Operacional exibe bancos/wallets da empresa
- CPF usa formato `CAIXA-{workspace_id_prefix}` para unicidade sem dados reais
