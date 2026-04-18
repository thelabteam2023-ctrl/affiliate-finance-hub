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

### Cálculo de Depósitos Efetivos

```
depositosEfetivos = DEPOSITO (real) + DEPOSITO_VIRTUAL onde origem_tipo='MIGRACAO'
```

BASELINE é EXCLUÍDO de depósitos efetivos — não saiu do caixa.

### Neutralização de Ciclos de Revinculação (v3 — 2026-04-18)

**Problema**: Quando uma bookmaker é desvinculada e revinculada ao MESMO projeto, gera um par SV+DV BASELINE. O SV infla `saquesRecebidos` e o DV BASELINE infla `saldoCasas` (via `saldo_atual`), criando lucro fantasma na fórmula `Lucro = saldoCasas + saquesRecebidos − depositosEfetivos`.

**Solução CORRETA — neutralização POR BOOKMAKER**:
```typescript
// Agrupa baseline DV por destino_bookmaker_id
const baselineByBM = Map<bmId, valor>;
// Agrupa SV por origem_bookmaker_id
const svByBM = Map<bmId, valor>;
// Neutraliza apenas o min(baseline, sv) PARA CADA bookmaker
for (const [bmId, baselineVal] of baselineByBM) {
  baselineNeutralizar += Math.min(baselineVal, svByBM.get(bmId) ?? 0);
}
lucroProjetado = (saldoCasas + saquesRecebidos + saquesPendentes) - depositosEfetivos - 2 * baselineNeutralizar;
```

**Bug corrigido**: A versão anterior somava `baselineAtiva` e `saquesVirtuais` GLOBALMENTE em USD e fazia `Math.min` agregado. Isso incluía DVs BASELINE antigos de OUTRAS bookmakers (que não tiveram SV no mesmo ciclo) na neutralização, causando inflação de centavos por conversão FX. A neutralização por bookmaker garante que apenas pares SV+DV reais do mesmo ciclo são neutralizados.

### Saques e Conciliação

O Fluxo Líquido usa `valor_confirmado` quando disponível:
```
saquesRecebidos = SUM(valor_confirmado ?? valor)
fluxoLiquido = saquesRecebidos - depositosEfetivos
```
