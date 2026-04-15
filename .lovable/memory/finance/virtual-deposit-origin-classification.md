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

### Cálculo de Depósitos Efetivos (Fluxo Líquido Ajustado)

```
depositosEfetivos = DEPOSITO (real com snapshot) + DEPOSITO_VIRTUAL onde origem_tipo='MIGRACAO'
```

- **BASELINE é EXCLUÍDO** do cálculo de depósitos efetivos
- Isso garante que o fluxo líquido reflita apenas o que saiu do caixa operacional + capital migrado entre projetos

### Decisão de Escopo (2026-04-15)

A lógica de exclusão de BASELINE é aplicada **a partir de agora** (novos vínculos).
Projetos legados onde depósitos foram feitos ANTES do vínculo (sem snapshot) mantêm a BASELINE como fallback natural — não se tenta retroagir a correção para dados históricos.

### Saques e Conciliação

O Fluxo Líquido usa `valor_confirmado` (valor efetivamente recebido) quando disponível:
```
saquesRecebidos = SUM(valor_confirmado ?? valor)
fluxoLiquido = saquesRecebidos - depositosEfetivos
```
