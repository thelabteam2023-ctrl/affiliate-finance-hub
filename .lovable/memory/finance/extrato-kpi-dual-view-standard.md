---
name: Extrato KPI Dual View Standard
description: ExtratoProjetoTab adota visão híbrida intencional — Depósitos/Saques/Extras usam snapshot (histórico contábil) e Saldo Casas usa cotação live (mark-to-market). Cada KPI tem botão (ⓘ) explicando metodologia e a divergência esperada com Saldo Operável
type: feature
---

## Visão Híbrida Intencional

ExtratoProjetoTab combina deliberadamente dois pontos de vista financeiros para representar a realidade econômica do projeto:

| KPI | Fonte de cotação | Significado |
|---|---|---|
| Depósitos | Snapshot (`valor_usd_referencia`) | Quanto custou para colocar capital lá |
| Saques | Snapshot | Quanto efetivamente entrou no momento do saque |
| Extras (Ajustes/Cashback/Bônus) | Snapshot | Histórico contábil dos lançamentos |
| Saldo Casas | LIVE (`convertToConsolidation`) | Mark-to-market: quanto vale agora se sacar |
| Resultado de Caixa | Híbrido | Saques+Saldo(live)+Extras−Depósitos(snap) → realidade econômica |

## Diferença com Saldo Operável

**Saldo Operável** (em Vínculos / Caixa) usa cotação live para tudo. **Extrato** usa snapshot para depósitos/saques. Por isso, o `saldoCasasTotal` do Extrato vai sempre bater com Saldo Operável (ambos live), mas `Resultado de Caixa` flutuará com câmbio mesmo sem operações — isso é variação cambial real, não bug.

## Botões informativos (ⓘ) obrigatórios

Cada card tem `KpiInfoButton` (Popover) com:
- Título e fórmula
- Explicação da metodologia (snapshot vs live)
- Seção "Por que diverge do Saldo Operável?" alertando o usuário
- No card "Resultado de Caixa", mostra breakdown da variação cambial: depósitos a custo histórico vs mesmos depósitos a câmbio atual

## Não fazer

- Não converter Saldo Casas via snapshot (perderia o significado de mark-to-market)
- Não converter Depósitos/Saques via live (perderia auditabilidade histórica)
- Não tentar "zerar" Resultado de Caixa antes de operar — variação cambial é parte da realidade econômica
