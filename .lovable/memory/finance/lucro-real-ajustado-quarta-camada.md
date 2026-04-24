---
name: lucro-real-ajustado-quarta-camada
description: 4ª perspectiva no FinancialMetricsPopover decompondo Performance × FX × Ajustes; deve convergir com Patrimônio
type: feature
---
# Lucro Real Ajustado — 4ª camada de leitura financeira

O `FinancialMetricsPopover.tsx` apresenta **4 perspectivas de lucro** dispostas em hierarquia top→bottom. A 4ª camada (Lucro Real Ajustado) decompõe explicitamente o Patrimônio em três fontes conceitualmente distintas, respondendo à pergunta crítica do operador: *"meu lucro veio de mérito ou de macroeconomia?"*

## Mapeamento canônico das 4 camadas

| # | Camada | Pergunta | Campo `metrics` | Visual |
|---|---|---|---|---|
| 1 | 🏦 **Caixa** | "O que voltou pro meu bolso?" | `fluxoCaixaLiquido` | Camada 1 |
| 2 | 💰 **Patrimônio** | "E se eu sacasse tudo agora?" | `lucroFinanceiro` | Card-resumo 1 + Camada 2 |
| 3 | 📊 **Performance Pura** | "O quanto a operação realmente performou?" | `performancePura` | Sub-bloco da Camada 3 |
| 4 | 🎯 **Real Ajustado** | "Qual o lucro real considerando câmbio e ajustes?" | `resultadoOperacionalTotal` | **Card-resumo 2** (NOVO) + Camada 3 detalhada |

## Composição da Camada 4 (Lucro Real Ajustado)

```
resultadoOperacionalTotal
  = performancePura            (📊 mérito do operador — apostas + bônus + cashback + giros + ajustes operacionais)
  + efeitosFinanceiros         (💱 FX — ganho/perda cambial + ganho de confirmação + AJUSTE_SALDO[FX])
  + ajustesExtraordinarios     (⚙️ administrativo — AJUSTE_SALDO[EXTRAORDINARIO] − perdas operacionais)
```

## Regra de convergência (obrigatória)

**Camada 4 deve convergir com Camada 2** (`|lucroFinanceiro − resultadoOperacionalTotal| < 0,01`).

Quando há divergência, o card-resumo do Lucro Real Ajustado exibe um badge `Δ {valor}` (âmbar) ao lado do número. Causas legítimas de divergência:
- Saldos ainda não realizados (em trânsito)
- FX pendente de liquidação
- Eventos recém-classificados que ainda não bateram nas views consolidadas

## Layout obrigatório do popover (top→bottom)

1. Header educacional com tooltip 💡 explicando as **4 perspectivas**
2. **Card-resumo 1** — `💰 Lucro se sacar tudo hoje` (gradiente emerald/red, ícone `PiggyBank`)
3. **Card-resumo 2** — `🎯 Lucro Real Ajustado` (gradiente sky/red, ícone `Target`) com 3 chips inline (📊 Perf · 💱 FX · ⚙️ Ajustes) + badge de paridade
4. **Camada 1** — Lucro em Caixa
5. **Camada 2** — Composição do Patrimônio
6. **Camada 3** — Performance da Operação detalhada (`LucroOperacionalCollapsible`)
7. Status de Recuperação de Capital

## Proibido

- Adicionar quinta camada sem justificativa explícita
- Esconder o badge de paridade quando há divergência
- Misturar AJUSTE_SALDO[RECONCILIACAO_OPERACIONAL] no chip ⚙️ — ele pertence a 📊 Performance Pura
- Renomear "Lucro Real Ajustado" sem atualizar este memory

## Cross-reference

- Cálculos: `mem://finance/operational-performance-segregation-standard`
- Padrão original 3 camadas: `mem://finance/indicadores-financeiros-3-camadas-standard` (substituído por este)
- Naturezas de ajuste: `mem://finance/ajuste-saldo-natureza-classification-standard`
