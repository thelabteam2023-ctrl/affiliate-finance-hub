---
name: operational-performance-segregation-standard
description: Segregação visual de Performance Pura, Efeitos Financeiros (FX) e Extraordinários no popover de Indicadores Financeiros, com AJUSTE_SALDO classificado por ajuste_natureza
type: feature
---
# Segregação Conceitual: Performance × FX × Extraordinários

O Resultado Operacional do projeto é apresentado em 3 sub-blocos visuais segregados, mantendo unidade matemática mas dissociando conceitos. Cada `AJUSTE_SALDO` é distribuído entre os blocos conforme sua coluna `ajuste_natureza`.

## Definições canônicas

- **Performance Pura** (numerador de ROI):
  `lucroApostasPuro + bonusGanhos + cashbackLiquido + girosGratis + AJUSTE_SALDO[RECONCILIACAO_OPERACIONAL]`
  → Mede a qualidade da operação. Inclui reconciliações operacionais (centavos por arredondamento de odds, retornos fracionados) por serem parte natural da operação. É a parcela atribuída ao trabalho do operador na Conta de Fechamento.

- **Efeitos Financeiros (FX)**:
  `(GANHO_CAMBIAL − PERDA_CAMBIAL) + ganhoConfirmacao + AJUSTE_SALDO[EFEITO_FINANCEIRO]`
  → Variação cambial e ganho/perda na confirmação de saques, mais ajustes classificados como FX. Fora do controle do operador. NÃO entra em ROI.

- **Extraordinários**:
  `AJUSTE_SALDO[EXTRAORDINARIO] − PERDA_OPERACIONAL`
  → Incidentes (contas bloqueadas) e ajustes administrativos sem vínculo operacional (estornos, correções de lançamento). Afeta caixa, mas NÃO compõe performance recorrente nem remuneração do operador.

- **Resultado Operacional Total** = Performance + Efeitos FX + Ajustes
  → Reconcilia com Patrimônio (Camada 2 — mark-to-market).

## Onde aplicar

- `FinancialMetricsPopover` (popover de Indicadores Financeiros do header do projeto): Camada 3 com 3 cards segregados (emerald/amber/orange).
- `LucroProjetadoModal`: bloco "Conta de Fechamento (Operador)" com Lucro do Operador (performance pura) destacado e Efeitos Não-Operacionais separados.
- `ExtratoProjetoTab`: badge clicável `AjusteNaturezaBadge` em cada AJUSTE_SALDO permite reclassificação inline (RLS protege UPDATE).

## Princípio fundamental

ROI mede qualidade da operação, não risco cambial nem correções contábeis. Por isso FX e Ajustes ficam visualmente segregados e fora do denominador/numerador de eficiência.