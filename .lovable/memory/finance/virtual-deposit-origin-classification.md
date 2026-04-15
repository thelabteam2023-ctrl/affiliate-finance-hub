---
name: Virtual Deposit Origin Classification
description: Campo origem_tipo classifica DEPOSITO_VIRTUAL como BASELINE (primeira vinculação) ou MIGRACAO (transferência entre projetos)
type: feature
---

## Classificação de Origem de Transações Virtuais

O campo `origem_tipo` no `cash_ledger` classifica automaticamente transações virtuais:

### Valores

- **`BASELINE`**: DEPOSITO_VIRTUAL criado na primeira vinculação (sem SAQUE_VIRTUAL anterior). Representa saldo que já existia na bookmaker — NÃO saiu do caixa operacional.
- **`MIGRACAO`**: DEPOSITO_VIRTUAL ou SAQUE_VIRTUAL criado durante transferência entre projetos. Representa capital real em trânsito que DEVE contar no fluxo líquido.

### Lógica de Determinação

No trigger `fn_ensure_deposito_virtual_on_link`:
- Se `v_last_sv_date IS NOT NULL` (existiu SAQUE_VIRTUAL anterior) → `MIGRACAO`
- Caso contrário → `BASELINE`

Na RPC `desvincular_bookmaker_atomico`:
- SAQUE_VIRTUAL sempre recebe `origem_tipo = 'MIGRACAO'`

### Uso Futuro

Quando implementada a diferenciação no fluxo líquido:
- **Fluxo Líquido** = Saques - Depósitos Reais - DVs de MIGRACAO (exclui BASELINE)
- DVs de BASELINE são informativos (baseline contábil) e não representam desembolso real
