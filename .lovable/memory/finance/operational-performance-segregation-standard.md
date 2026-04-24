---
name: operational-performance-segregation-standard
description: Segregação visual de Performance Pura, Efeitos Financeiros (FX) e Ajustes & Extraordinários no popover de Indicadores Financeiros e modal de Reconciliação
type: feature
---
# Segregação Conceitual: Performance × FX × Ajustes

O Resultado Operacional do projeto é apresentado em 3 sub-blocos visuais segregados, mantendo unidade matemática mas dissociando conceitos:

## Definições canônicas

- **Performance Pura** (numerador de ROI):
  `lucroApostasPuro + bonusGanhos + cashbackLiquido + girosGratis`
  → Mede a qualidade da operação. É a parcela atribuída ao trabalho do operador na Conta de Fechamento.

- **Efeitos Financeiros (FX)**:
  `(GANHO_CAMBIAL − PERDA_CAMBIAL) + ganhoConfirmacao`
  → Variação cambial e ganho/perda na confirmação de saques. Fora do controle do operador. NÃO entra em ROI.

- **Ajustes & Extraordinários**:
  `AJUSTE_SALDO − PERDA_OPERACIONAL`
  → Correções contábeis (reconciliação) e incidentes (contas bloqueadas). Afeta caixa, mas NÃO compõe performance recorrente nem remuneração do operador.

- **Resultado Operacional Total** = Performance + Efeitos FX + Ajustes
  → Reconcilia com Patrimônio (Camada 2 — mark-to-market).

## Onde aplicar

- `FinancialMetricsPopover` (popover de Indicadores Financeiros do header do projeto): Camada 3 com 3 cards segregados (emerald/amber/orange).
- `LucroProjetadoModal`: bloco "Conta de Fechamento (Operador)" com Lucro do Operador (performance pura) destacado e Efeitos Não-Operacionais separados.

## Princípio fundamental

ROI mede qualidade da operação, não risco cambial nem correções contábeis. Por isso FX e Ajustes ficam visualmente segregados e fora do denominador/numerador de eficiência.