## Diagnóstico do cálculo atual

O percentual "33,7% do lucro op." aparece no card **Exposição & Perdas** (`src/components/financeiro/ExposicaoFinanceiraCard.tsx`, linhas 132–133, 220–224).

Fórmula em uso hoje:

```
pctPerdasLucro = (totalPerdasPeriodo / lucroOperacional) * 100
```

- **Numerador** — `exp.totalPerdasPeriodo`: soma das perdas confirmadas no `cash_ledger` (tipo `PERDA_OPERACIONAL` + ocorrências fechadas como perda) dentro do filtro de período, calculada em `useExposicaoFinanceira({ dataInicio, dataFim })`.
- **Denominador** — `lucroOperacional`: vem de `Financeiro.tsx` (`lucroOperacionalApostas`), produzido pelo `useWorkspaceLucroOperacional` — é o lucro **teórico** das apostas (já liquidadas, mas sem considerar saques/depósitos reais). É filtrado pelo mesmo período.
- **Contagem** — `exp.countPerdas`: número de ocorrências confirmadas no período.

## Por que a base atual é frágil

1. **Mistura natureza teórica × realizada**: o numerador é uma perda já consumada em caixa, o denominador é um resultado teórico de apostas. Comparar os dois cria um percentual sem leitura financeira clara.
2. **Distorce com lucro operacional baixo ou negativo**: se o lucro operacional do período for ~0, o % explode; se for negativo, o card simplesmente esconde o percentual (`> 0` guard).
3. **Não responde "que fatia da operação realizada do mês as perdas comeram"** — que é a pergunta natural do usuário.

## Mudança proposta

Trocar a base de comparação para o **Fluxo Líquido do período** (Saques − Depósitos efetivos no intervalo) — a métrica já implementada via `useWorkspaceLucroRealizado` com `dataInicio/dataFim`. Exibir, em paralelo, **% do Patrimônio** como referência estrutural estável (já existe na seção "Em disputa").

### Nova regra

```
fluxoLiquidoPeriodo = useWorkspaceLucroRealizado({ dataInicio, dataFim }).lucroRealizado

// Base preferencial: módulo do Fluxo Líquido (evita explodir/esconder quando negativo)
baseComparacao = Math.abs(fluxoLiquidoPeriodo)

pctPerdasFluxo = baseComparacao > 0
  ? (totalPerdasPeriodo / baseComparacao) * 100
  : null   // mostra "—" e dica explicando

// Fallback secundário sempre exibido em tooltip: % do patrimônio atual
pctPerdasPatrimonio = patrimonioTotal > 0
  ? (totalPerdasPeriodo / patrimonioTotal) * 100
  : null
```

### Leitura do número

- `pctPerdasFluxo`: "as perdas confirmadas representaram X% do dinheiro líquido que entrou/saiu da operação no período".
- Tooltip explica que usar o módulo é proposital: quando o período foi de prejuízo realizado, a perda é dimensionada em relação à magnitude do movimento, não ao sinal.

### Tratamento de borda

| Caso                       | Comportamento                                                    |
| -------------------------- | ---------------------------------------------------------------- |
| Sem perdas no período      | "Nenhuma perda confirmada no período" (igual hoje)               |
| Fluxo Líquido = 0          | Mostra apenas valor absoluto + % do patrimônio + dica            |
| Fluxo Líquido < 0          | Usa `Math.abs` e prefixa "% do fluxo líquido (mov. abs.)"        |
| Patrimônio = 0             | Omite a referência de patrimônio                                 |

## Arquivos a alterar

### 1. `src/components/financeiro/ExposicaoFinanceiraCard.tsx`
- Trocar a prop `lucroOperacional: number` por `fluxoLiquidoPeriodo: number` (mantendo `patrimonioTotal`).
- Substituir o cálculo `pctPerdasLucro` por `pctPerdasFluxo` usando `Math.abs(fluxoLiquidoPeriodo)`.
- Atualizar o subtexto "X ocorrências · Y% do lucro op." para "X ocorrências · Y% do fluxo líquido".
- Ajustar o `TooltipContent` (linhas 207–212) explicando a nova base e por que o lucro operacional teórico foi descartado.
- Acrescentar segunda linha discreta com "Z% do patrimônio" quando aplicável.

### 2. `src/pages/Financeiro.tsx`
- Onde o card é renderizado, passar `fluxoLiquidoPeriodo={lucroRealizado}` (já calculado pelo hook `useWorkspaceLucroRealizado` com `dataInicio/dataFim` na implementação anterior) no lugar de `lucroOperacional={...}`.

### 3. Nenhuma mudança em hooks/serviços
- `useExposicaoFinanceira` continua sendo a fonte de `totalPerdasPeriodo` / `countPerdas`.
- `useWorkspaceLucroRealizado` já aceita `dataInicio/dataFim` — sem alterações.

## Fora de escopo

- Não tocar em `useFinanceiroCalculations.ts` nem no `ScanPeriodoCard.tsx` (componente atualmente não renderizado).
- Não alterar a fórmula do Lucro Operacional, da Margem ou de qualquer outro KPI do header.
- Sem migrations / mudanças no banco.

## Validação

1. Preview: aplicar filtros "mês atual", "últimos 30 dias", "mês anterior" e conferir que o `%` muda junto com o Fluxo Líquido exibido no header `Fluxo Líquido (período)`.
2. Período sem fluxo (filtro futuro): card mostra valor absoluto + "—" no %, sem quebrar.
3. Período com prejuízo realizado: % é positivo (usa `abs`) e o tooltip explica a leitura.
