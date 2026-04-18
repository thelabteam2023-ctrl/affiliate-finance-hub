---
name: project-card-lucro-realizado-canonico
description: O Lucro Realizado do card kanban de projetos vem de fetchProjetosLucroCanonico.lucroRealizado (mesmo convertOficial do FinancialMetricsCard)
type: feature
---

# Memory: finance/project-card-lucro-realizado-canonico

## Fonte Única do Lucro Realizado nos Cards de Projeto

O campo `lucro_realizado` exibido no card kanban de cada projeto (em `GestaoProjetos.tsx`) vem de `fetchProjetosLucroCanonico().lucroRealizado`, que aplica a fórmula canônica:

```
LUCRO_REALIZADO = (Saques + Saques Virtuais) - (Depósitos + Depósitos Virtuais)
```

**Conversão:** Usa o **mesmo `convertOficial`** (cotações FastForex/PTAX agrupadas por projeto) do `ProjetoFinancialMetricsCard.tsx`. Isso garante paridade absoluta entre:
- Card kanban → "Lucro Realizado"
- Aba Financeiro → "Fluxo Líquido Ajustado"

## Histórico
- **2026-04-18**: Antes, `GestaoProjetos.tsx` calculava `lucroRealizado` localmente convertendo BRL → USD com cotação live do `useCotacoes`, gerando drift de centavos vs. o `convertToConsolidationOficial` do `useProjetoCurrency` (que usa cross-rate via USD pivot). Unificado em `fetchProjetosLucroCanonico`.

## Arquivos
- `src/services/fetchProjetosLucroCanonico.ts` — exporta `lucroRealizado` no resultado
- `src/pages/GestaoProjetos.tsx` — consome direto, sem refazer a conta
- `src/components/projeto-detalhe/ProjetoFinancialMetricsCard.tsx` — usa `convertToConsolidationOficial`
