---
name: Virtual Deposit Origin Classification
description: Campo origem_tipo classifica DEPOSITO_VIRTUAL como BASELINE (primeira vinculação ou revinculação ao mesmo projeto) ou MIGRACAO (transferência entre projetos diferentes)
type: feature
---

## Classificação de Origem de Transações Virtuais

O campo `origem_tipo` no `cash_ledger` classifica automaticamente transações virtuais:

### Valores

- **`BASELINE`**: DEPOSITO_VIRTUAL criado quando NÃO há migração real de capital. Cobre dois casos:
  1. Primeira vinculação (sem SAQUE_VIRTUAL anterior)
  2. **Revinculação ao MESMO projeto** (desvincula e revincula sem trocar de projeto) — saldo já pertencia ao projeto, não é capital novo
- **`MIGRACAO`**: DEPOSITO_VIRTUAL ou SAQUE_VIRTUAL criado durante transferência entre projetos **diferentes**. Representa capital real em trânsito que DEVE contar no fluxo líquido.

### Lógica de Determinação (v2 — 2026-04-18)

No trigger `fn_ensure_deposito_virtual_on_link`:
- Busca o último SAQUE_VIRTUAL da bookmaker (data + `projeto_id_snapshot`)
- Se `v_last_sv_date IS NOT NULL` **AND** `v_last_sv_projeto != NEW.projeto_id` → `MIGRACAO`
- Caso contrário → `BASELINE`

Na RPC `desvincular_bookmaker_atomico`:
- SAQUE_VIRTUAL sempre recebe `origem_tipo = 'MIGRACAO'`

### Bug Corrigido (2026-04-18)

**Sintoma**: Desvincular e revincular uma bookmaker ao MESMO projeto inflava o "Total Depósitos" do projeto pelo `saldo_atual` da casa, sem nenhuma operação real ter acontecido.

**Causa raiz**: O trigger marcava como `MIGRACAO` sempre que existia SAQUE_VIRTUAL anterior, sem comparar se foi do mesmo projeto.

**Correção**: Trigger agora compara `projeto_id_snapshot` do último SAQUE_VIRTUAL com o novo `projeto_id`. Apenas projetos diferentes geram MIGRACAO.

### Cálculo de Depósitos Efetivos (Fluxo Líquido Ajustado)

```
depositosEfetivos = DEPOSITO (real com snapshot) + DEPOSITO_VIRTUAL onde origem_tipo='MIGRACAO'
```

- **BASELINE é EXCLUÍDO** do cálculo de depósitos efetivos
- Isso garante que o fluxo líquido reflita apenas o que saiu do caixa operacional + capital migrado entre projetos

### Saques e Conciliação

O Fluxo Líquido usa `valor_confirmado` (valor efetivamente recebido) quando disponível:
```
saquesRecebidos = SUM(valor_confirmado ?? valor)
fluxoLiquido = saquesRecebidos - depositosEfetivos
```
