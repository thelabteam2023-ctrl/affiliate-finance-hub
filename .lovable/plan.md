## Objetivo
Melhorar a explicação do **EV (Expected Value)** na Calculadora de Hedge Probabilístico para que o usuário entenda claramente o conceito de retorno médio no longo prazo.

## Alterações Sugeridas

### 1. Atualização do Tooltip de EV
- Modificar o texto do `CardInfoTooltip` para o campo \\"Extração Estimada (EV)\\" para incluir um exemplo de longo prazo:
  - *\\"O EV (Valor Esperado) é a média matemática do que você ganhará por operação se repeti-la muitas vezes. Por exemplo: se o seu EV é R$ 22,00, após 1.000 operações idênticas, seu retorno total acumulado será de aproximadamente R$ 22.000,00, independentemente do resultado individual de cada uma.\\"*

### 2. Refinamento do Glossário no Guia de Ajuda
- No modal \\"Como funciona?\\", aprimorar a seção de **Extração Estimada (EV)** para ser mais didática:
  - Explicar que em algumas operações você ganhará mais, em outras ganhará menos (ou terá o drawdown), mas a média converge para esse valor.
  - Adicionar explicitamente a frase: \\"Em mil operações com este EV, seu lucro total esperado seria de R$ [EV * 1000].\\"

### 3. Melhoria na UI do KPI de EV
- Adicionar uma pequena etiqueta ou subtexto abaixo do valor do EV indicando \\"Média por operação no longo prazo\\" para reforçar o conceito sem poluir a interface.

## Detalhes Técnicos
- **Componente**: `src/components/ferramentas/CalculadoraHedgeProbabilisticaContent.tsx`
  - Editar o `CardInfoTooltip` na linha 123.
  - Editar a seção de glossário de EV (por volta da linha 565).
  - Adicionar um subtexto opcional no Card de Extração Estimada.
