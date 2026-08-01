---
name: Indicadores do Histórico do Caixa por Natureza
description: Indicadores do Histórico do Caixa Operacional segregados por natureza financeira (Aporte, Quitação, Depósito, Saque, Pagamento, Despesa, Perda, Ajuste, Transferência) com fluxo líquido
type: feature
---
Os indicadores do Histórico do Caixa Operacional são segregados por natureza financeira via `classifyMovementNature` (`src/lib/caixa/ledgerNature.ts`).

Regras:
- **Aporte × Quitação** compartilham o `tipo_transacao` `APORTE_FINANCEIRO`; a distinção é pela DIREÇÃO (`destino_tipo = INVESTIDOR` → Quitação; caso contrário → Aporte). Nunca separar apenas pelo tipo.
- Grupos: APORTE/SAQUE (entrada), QUITACAO/DEPOSITO/PAGAMENTO/DESPESA/PERDA (saída), TRANSFERENCIA/SWAP/CONVERSAO (neutro, movimento interno), AJUSTE (direção pelo sinal/origem-destino; cambial entra aqui).
- **Fluxo líquido** = entradas − saídas; neutros ficam fora por definição.
- Fiat consolidado em BRL apenas para exibição quando há múltiplas moedas; cripto sempre pelo snapshot `valor_usd` do ledger (nunca preço live).
- Reversões (`classifyLedgerRow !== ORIGINAL_EFETIVO`) continuam fora de todos os grupos, mas visíveis na lista.
- Camada 100% de apresentação: não altera eventos, saldos ou RPCs.