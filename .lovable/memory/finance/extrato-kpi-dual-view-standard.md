---
name: Extrato KPI Dual View Standard
description: ExtratoProjetoTab usa visão híbrida — Depósitos/Saques/Extras snapshot, Saldo Casas live. "Lucro se sacar tudo" = Saques+Saldo−Depósitos (Extras é informativo, NÃO entra na conta para evitar dupla contagem com saldo_atual)
type: feature
---

## Visão Híbrida Intencional

ExtratoProjetoTab combina deliberadamente dois pontos de vista financeiros para representar a realidade econômica do projeto:

| KPI | Fonte de cotação | Significado |
|---|---|---|
| Depósitos | Snapshot (`valor_usd_referencia`) | Quanto custou para colocar capital lá |
| Saques | Snapshot | Quanto efetivamente entrou no momento do saque |
| Extras (Ajustes/Cashback/Bônus) | Snapshot | **Apenas informativo** — histórico dos lançamentos. Já refletidos no Saldo Casas via triggers do ledger. |
| Saldo Casas | LIVE (`convertToConsolidation`) | Mark-to-market: quanto vale agora se sacar |
| Lucro se sacar tudo | Híbrido | **Saques+Saldo(live)−Depósitos(snap)** → patrimônio líquido (= Patrimônio do FinancialMetricsPopover ± FX) |

## ⚠️ ANTI-DOUBLE-COUNTING (regra crítica)

**NUNCA somar `ajustesTotal` no cálculo de "Lucro se sacar tudo".**

Quando um evento extra é lançado no ledger (`BONUS_CREDITADO`, `CASHBACK_MANUAL`, `AJUSTE_SALDO`, `GIRO_GRATIS`, `BONUS_ESTORNO`, etc.), os triggers do motor financeiro **já atualizam o `saldo_atual`** da bookmaker correspondente. Logo, esses valores **já estão dentro de `saldoCasasTotal`**.

Somar `+ ajustesTotal` na fórmula causaria:
- Bônus de $300 contado uma vez no Saldo Casas + uma vez em Extras = **+$600 fantasma**
- Resultado divergente do Patrimônio Líquido canônico (Visão Geral)
- Indicador inutilizável para fechamento de projeto

O card "Extras" continua existindo no Extrato como **referência informativa** do histórico de lançamentos extras no período, com tooltip explícito que NÃO entra na conta final.

## Diferença com Saldo Operável

**Saldo Operável** (em Vínculos / Caixa) usa cotação live para tudo. **Extrato** usa snapshot para depósitos/saques. Por isso, o `saldoCasasTotal` do Extrato vai sempre bater com Saldo Operável (ambos live), mas `Lucro se sacar tudo` flutuará com câmbio mesmo sem operações — isso é variação cambial real, não bug.

## Convergência com Visão Geral

`Lucro se sacar tudo` (Extrato) ≈ `Patrimônio Líquido` / `lucroFinanceiro` (FinancialMetricsPopover). Divergência residual entre os dois indicadores se deve apenas a:
- Cotação Oficial (PTAX) usada no Popover vs Cotação de Trabalho usada no Extrato
- Variação cambial entre depósitos snapshot e saldo casas live

## Botões informativos (ⓘ) obrigatórios

Cada card tem `KpiInfoButton` (Popover) com:
- Título e fórmula
- Explicação da metodologia (snapshot vs live)
- Seção "Por que diverge do Saldo Operável?" alertando o usuário
- No card "Lucro se sacar tudo", mostra breakdown da variação cambial: depósitos a custo histórico vs mesmos depósitos a câmbio atual
- No card "Extras", aviso destacado de que é informativo e NÃO é somado novamente

## Não fazer

- Não converter Saldo Casas via snapshot (perderia o significado de mark-to-market)
- Não converter Depósitos/Saques via live (perderia auditabilidade histórica)
- Não tentar "zerar" Lucro se sacar tudo antes de operar — variação cambial é parte da realidade econômica
- **Não somar `ajustesTotal` na fórmula de Lucro se sacar tudo** — extras já estão no `saldo_atual`, somar de novo é dupla contagem
