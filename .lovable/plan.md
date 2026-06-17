# Janela Mensal Dinâmica + Baseline

## Objetivo

Eliminar meses zerados no início do gráfico da Análise Temporal. A janela passa a iniciar no **primeiro mês com qualquer registro real**, respeitando o limite máximo da janela escolhida (6/12/24 meses) e nunca passando do mês atual. Opcionalmente, incluir 1 mês anterior zerado como "baseline" visual.

## Regras da nova janela

Sejam:
- `hoje` = início do mês atual
- `N` = janela escolhida (6, 12, 24)
- `primeiroMesReal` = menor `yyyy-MM` entre TODOS estes registros do workspace:
  - `movimentacoes_indicacao.data_movimentacao` (CAC, Comissões, Bônus)
  - `despesas_administrativas.data_despesa` (Infra, RH)
  - `pagamentos_operador.data_pagamento` (Operadores)
  - `cash_ledger.data_transacao` com tipo SAQUE/DEPOSITO (Fluxo Líquido)
  - `apostas_unificada.data_aposta` (Lucro Operacional)

Definições:
```
limiteMinJanela = hoje − (N − 1) meses
inicio          = max(primeiroMesReal, limiteMinJanela)
fim             = hoje
```

Comportamento:
- Se a operação começou **dentro da janela** (ex.: janela 12m, 1º registro Abr/26) → começa em Abr/26, não em Jul/25.
- Se a operação começou **antes da janela** (ex.: 1º registro Jan/24, janela 6m) → começa em `hoje − 5m` (comportamento atual preservado para janelas curtas em operações antigas).
- Se **não houver nenhum registro** → janela vazia, fallback para o mês atual apenas.

## Baseline opcional

Flag `incluirBaseline: boolean` (default `true`):
- Quando `true` e existe `inicio > primeiroMesReal` impossível (já está no piso real), adiciona **1 mês anterior** ao `inicio` com todos os valores zerados, apenas como "ponto de partida visual" no gráfico.
- Não adiciona baseline se isso ultrapassasse o piso natural do calendário (sem mês negativo) — sempre seguro.
- Baseline NÃO entra nos cards de resumo (média, melhor/pior mês), só no chart e na tabela com badge "baseline".

## Mudanças de arquivo

### `src/hooks/useFinanceiroMensal.ts`
1. Calcular `primeiroMesReal` varrendo as 5 fontes uma única vez antes de montar `windowKeys`.
2. Substituir loop fixo por:
   ```ts
   const limiteMin = format(subMonths(now, meses - 1), "yyyy-MM");
   const inicioKey = primeiroMesReal && primeiroMesReal > limiteMin ? primeiroMesReal : limiteMin;
   // gerar todos os meses entre inicioKey..nowKey
   ```
3. Se `incluirBaseline`, prepender 1 mês anterior ao `inicioKey`.
4. Adicionar campo `isBaseline: boolean` em `MesFinanceiro`.
5. Aceitar params adicionais: `{ incluirBaseline?: boolean }` (default true).

### `src/components/financeiro/GraficoMensalDialog.tsx`
1. Filtrar `isBaseline` no cálculo de `resumo` (média, melhor, pior) — baseline não conta.
2. Na tabela, linha baseline com cor `text-muted-foreground` e sufixo "(baseline)".
3. No tooltip do chart, indicar quando o ponto é baseline.
4. Adicionar pequeno `Switch` no header do dialog: "Mostrar mês anterior como referência" (controla `incluirBaseline`).

### Exportações (PDF/XLSX)
- `exportRelatorioPDF.ts` e `exportRelatorioXLSX.ts`: filtrar `isBaseline` das somas/médias e marcar a linha como "(baseline)" na tabela exportada.

## Fora do escopo

- Não muda fórmulas (Fluxo Líquido, Custos, Resultado Líquido, Margem permanecem idênticos).
- Não filtra por projeto (continua workspace-wide).
- Não toca em RPCs nem migrations.

## Validação

- Workspace com 1º registro em Abr/26 + janela 12m → chart começa em Mar/26 (baseline) ou Abr/26 (sem baseline).
- Workspace com 1º registro em Jan/24 + janela 6m → chart começa em (hoje − 5m), inalterado.
- Workspace vazio → apenas mês atual zerado.
- Soma de custos do 1º mês real bate com Composição de Custos filtrada no mesmo mês.

Confirma para implementar?
