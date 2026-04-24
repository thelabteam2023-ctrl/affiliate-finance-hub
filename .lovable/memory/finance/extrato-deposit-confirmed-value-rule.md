---
name: Extrato Depósito Valor Confirmado
description: ExtratoProjetoTab usa valor_confirmado quando mesma moeda (não cross-currency) para refletir perdas reais de trânsito (taxas, IOF). Cross-currency continua usando valor (lançado) porque valor_confirmado contém equivalente em outra moeda
type: feature
---

## Regra de derivação de valorBase em ExtratoProjetoTab

```typescript
const isCrossCurrency =
  e.cotacao_destino_usd != null || e.cotacao_origem_usd != null;
const valorBase =
  !isCrossCurrency && valor_confirmado > 0
    ? valor_confirmado   // perda de trânsito real (taxa/IOF/fee)
    : valor_lancado;     // cross-currency: valor_confirmado é equivalente em outra moeda
```

### Por quê
- **Mesma moeda** (USD→USD, BRL→BRL): `valor_confirmado < valor` significa taxa cobrada. Deve refletir no KPI.
  - Ex: HUGEWIN lançou 200 USD, recebeu 198 USD → KPI mostra 198, diferença vira perda no Resultado de Caixa.
- **Cross-currency** (BRL→USD via wallet): a RPC `confirm_wallet_transit` grava em `valor_confirmado` o equivalente USD, contaminando KPI por moeda. Por isso continua usando `valor` original.

### Detecção cross-currency
Usa presença de `cotacao_destino_usd` OU `cotacao_origem_usd` (snapshots de conversão). Se algum existir, é cross-currency.

### Impacto no popover (UX)
Card "Depósitos" comunica explicitamente que mostra o "que realmente entrou na casa" (não o lançado), e que a diferença aparece como impacto no Resultado de Caixa.
