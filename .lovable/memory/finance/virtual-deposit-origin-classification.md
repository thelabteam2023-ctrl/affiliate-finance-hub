---
name: Virtual Deposit Origin Classification
description: Campo origem_tipo classifica DEPOSITO_VIRTUAL como BASELINE (primeira vinculação) ou MIGRACAO (transferência entre projetos diferentes). Revinculações fantasma ao mesmo projeto são neutralizadas no backend, sem ajuste de frontend
type: feature
---

## Classificação de Origem de Transações Virtuais

O campo `origem_tipo` no `cash_ledger` classifica automaticamente transações virtuais:

### Valores

- **`BASELINE`**: DEPOSITO_VIRTUAL criado na primeira vinculação (sem SAQUE_VIRTUAL anterior). Representa saldo pré-existente, NÃO é capital novo.
- **`MIGRACAO`**: DEPOSITO_VIRTUAL ou SAQUE_VIRTUAL criado durante transferência entre projetos **diferentes**. Representa capital real em trânsito que DEVE contar no fluxo líquido.

### Lógica de Determinação (v3 — 2026-04-18)

No trigger `fn_ensure_deposito_virtual_on_link`:
- Busca o último SAQUE_VIRTUAL CONFIRMADO da bookmaker (data + projeto + valor)
- **Se mesmo projeto + zero uso real**: cancela o SV e NÃO cria novo DV (revinculação fantasma neutralizada)
- **Se projeto diferente**: cria DV com `origem_tipo = 'MIGRACAO'`
- **Se não há SV anterior** (primeira vinculação): cria DV com `origem_tipo = 'BASELINE'`

Na RPC `desvincular_bookmaker_atomico`:
- SAQUE_VIRTUAL recebe `origem_tipo = 'MIGRACAO'`
- Se a casa nunca foi usada, o DV baseline original é cancelado em vez de gerar SV (phantom unlink)

### Cálculo de Depósitos Efetivos

```
depositosEfetivos = DEPOSITO (real) + DEPOSITO_VIRTUAL onde origem_tipo='MIGRACAO'
```

BASELINE é sempre EXCLUÍDO de depósitos efetivos — não saiu do caixa.

### Lucro Projetado (frontend)

Fórmula canônica, **sem ajustes defensivos**:
```
lucroProjetado = saldoCasas + saquesRecebidos + saquesPendentes − depositosEfetivos
```

O ledger é a fonte da verdade. Revinculações fantasma ao MESMO projeto são neutralizadas pelo trigger no backend (cancela SV anterior, não cria novo DV), eliminando a necessidade de qualquer cálculo de neutralização no frontend. Ver `phantom-link-baseline-neutralization.md`.

### Saques e Conciliação

O Fluxo Líquido usa `valor_confirmado` quando disponível:
```
saquesRecebidos = SUM(valor_confirmado ?? valor)
fluxoLiquido = saquesRecebidos - depositosEfetivos
```
