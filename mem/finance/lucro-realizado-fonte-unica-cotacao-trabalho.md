---
name: Lucro Realizado — fonte única e cotação
description: Card do projeto e Extrato usam a mesma regra de conversão (Cotação de Trabalho/snapshot); cotação oficial só para agregação multi-projeto
type: feature
---

## Regra

`Lucro Realizado = saques confirmados − depósitos efetivos`, convertidos SEMPRE por
`resolveValorConsolidado` (moeda nativa → `valor_usd_referencia` → Cotação de Trabalho).

- `src/services/fetchProjetosLucroCanonico.ts` (card do kanban) e
  `src/hooks/useProjetoRecuperacaoCapital.ts` (Extrato) usam a MESMA regra. Proibido
  converter o valor bruto pela cotação oficial nesses KPIs.
- Cotação OFICIAL é usada apenas em `lucroRealizadoBRL`, para somar projetos de moedas
  diferentes num total de workspace.
- Incidente que originou a regra: card R$ 351,04 × extrato R$ 350,70 no BONUS EVVERTON —
  341,25 USD × (5,15470 oficial − 5,15370 trabalho) = R$ 0,34.

## Conceitos distintos (não forçar igualdade)

- **Lucro Realizado**: fluxo já recuperado (saques − depósitos).
- **Lucro se sacar tudo**: saques + saldo atual das casas − depósitos (patrimônio líquido
  hoje, saldo estrangeiro marcado pela cotação atual).
- **Operacional (teórico)**: resultado das estratégias, congelado no `cotacao_snapshot`.

## Composição do resultado

`Operacional + Cambial + Outros Financeiros = Lucro Realizado`. O componente cambial inclui
`cambialConversao`: quando o projeto aporta numa moeda e recupera em outra, a diferença é
resultado de conversão de capital — não resíduo. Sem fluxo estrangeiro, qualquer diferença
continua exibida como "Não conciliado".
