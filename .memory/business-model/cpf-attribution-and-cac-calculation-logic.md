# CPF Attribution and CAC Calculation Logic

## CAC Pago Real vs Investimento Total

### Core Principle
CAC measures **acquisition efficiency** only. Retention costs (renewals, bonifications) are tracked separately and do NOT enter the CAC formula, but ARE included in Investimento Total.

### Formulas

```
# Acquisition costs only
CUSTO_AQUISICAO = PAGTO_PARCEIRO + PAGTO_FORNECEDOR + COMISSAO_INDICADOR + BONUS_INDICADOR

# Retention costs (separate)
CUSTO_RETENCAO = RENOVACAO_PARCERIA + BONIFICACAO_ESTRATEGICA

# Total investment
INVESTIMENTO_TOTAL = CUSTO_AQUISICAO + CUSTO_RETENCAO

CPFS_PAGOS = COUNT(*) WHERE custo_total_aquisicao > 0
CPFS_SEM_CUSTO = COUNT(*) WHERE custo_total_aquisicao = 0

CAC_PAGO_REAL = CUSTO_AQUISICAO / CPFS_PAGOS

TAXA_ORGANICA = (CPFS_SEM_CUSTO / TOTAL_CPFS) * 100
```

### CPF Classification (for CAC)

| Type | Description | Enters CAC |
|------|-------------|------------|
| **PAGO** | Partner/Supplier with acquisition cost | ✅ Yes |
| **ORGANICO** | Direct with zero acquisition cost | ❌ No |
| **HERDADO** | Migrated from external bases | ❌ No (unless historical cost informed) |
| **PROPRIO** | Internal operator use | ❌ No |

### Dashboard KPIs

| Metric | Includes | Purpose |
|--------|----------|---------|
| **Investimento Total** | Acquisition + Retention | Full spending view |
| **CAC Pago Real** | Only acquisition costs / paid CPFs | Acquisition efficiency |
| **Custo de Retenção** | Renewals + Bonifications | Retention spending (shown only when > 0) |
| **Taxa Orgânica** | % CPFs without acquisition cost | Base composition |

### Why Separate

- Renewals = maintaining existing partner → retention, not acquisition
- Bonifications = incentive for existing partner → retention, not acquisition
- Mixing them in CAC would make the metric meaningless
- The system measures **acquisition efficiency** separately from **retention investment**
