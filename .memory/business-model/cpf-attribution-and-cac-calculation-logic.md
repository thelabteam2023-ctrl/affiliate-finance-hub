# CPF Attribution and CAC Calculation Logic

## CAC Pago Real vs CAC Global

### Core Principle
Only CPFs with financial cost > 0 enter the CAC (Customer Acquisition Cost) calculation. CPFs without cost (organic, migrated, own) are displayed in totals but do NOT dilute the CAC.

### Formulas

```
CPFS_PAGOS = COUNT(*) WHERE custo_total > 0
CPFS_SEM_CUSTO = COUNT(*) WHERE custo_total = 0

TOTAL_INVESTIDO = SUM(all confirmed payments)

CAC_PAGO_REAL = TOTAL_INVESTIDO / CPFS_PAGOS

TAXA_ORGANICA = (CPFS_SEM_CUSTO / TOTAL_CPFS) * 100
```

### CPF Classification

| Type | Description | Enters CAC |
|------|-------------|------------|
| **PAGO** | Partner/Supplier with cost | ✅ Yes |
| **ORGANICO** | Direct with zero cost | ❌ No |
| **HERDADO** | Migrated from external bases | ❌ No (unless historical cost informed) |
| **PROPRIO** | Internal operator use | ❌ No |

### Dashboard Display

The Captação de Parceiros dashboard shows:
- **Investimento Total**: All confirmed payments
- **Total de CPFs**: All CPFs (pagos + sem custo)
- **CAC Pago Real**: Only calculated with CPFs with cost
- **Taxa Orgânica**: Percentage without cost

A warning banner appears when CPFs without cost exist:
> "X CPFs não entram no CAC (sem custo financeiro)"

### Why This Matters

This prevents:
- Base migration from breaking CAC
- Own CPFs from distorting CAC
- Direct CPFs from diluting CAC
- False efficiency metrics

The system measures **acquisition efficiency**, not base size.
