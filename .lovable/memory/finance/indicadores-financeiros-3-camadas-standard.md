# Memory: finance/indicadores-financeiros-3-camadas-standard
Updated: 2026-04-24

## Padrão dos Indicadores Financeiros — 3 perspectivas de lucro

O popover **`FinancialMetricsPopover.tsx`** organiza os KPIs financeiros em exatamente **3 camadas**, cada uma respondendo a uma pergunta diferente. Não inventar quarta camada sem justificativa explícita.

### Mapeamento campo → pergunta → comunicação

| Camada | Pergunta do usuário | Campo no `metrics` | Label na UI |
|---|---|---|---|
| 💰 **Patrimônio** (resposta principal) | *"Quanto eu teria de lucro se sacasse tudo hoje?"* | `lucroFinanceiro` (= `patrimônio − depósitosEfetivos`) | "Lucro se sacar tudo hoje" |
| 🏦 **Caixa** | *"Quanto já voltou pro meu bolso?"* | `fluxoCaixaLiquido` / `fluxoLiquidoAjustado` | "Lucro em Caixa" |
| 📊 **Operação** | *"Quanto a operação produziu?"* | `resultadoOperacionalTotal` (= performancePura + efeitosFinanceiros + ajustesExtraordinarios) | "Performance da Operação" |

### Layout obrigatório (top→bottom)
1. **Header educacional** com tooltip 💡 explicando as 3 perspectivas
2. **Card-resumo destacado** com gradiente (emerald/red) — `lucroFinanceiro`
3. **Lucro em Caixa** com `<Progress>` de recuperação de capital
4. **Composição do Patrimônio** (detalhamento: Saldo + Saques − Depósitos)
5. **Performance da Operação** com **badge de paridade** ao lado

### Badge de paridade (obrigatório)
Diff = `lucroFinanceiro − resultadoOperacionalTotal`
- `|diff| < 0.01` → 🟢 Convergente (emerald)
- caso contrário → 🟡 Δ {valor} (amber)

Tooltip explica que divergência indica saldos não realizados, FX pendente ou ajustes recém-classificados. Nunca esconder o diff — sempre exibir como sinal de saúde da operação.

### Proibido
- Renomear "Patrimônio Líquido" / "Resultado Realizado" / "Resultado Operacional Total" sem atualizar este memory
- Adicionar novo KPI financeiro fora dessas 3 categorias sem justificativa
- Remover o card-resumo de topo — é a resposta primária do usuário
- Esconder o badge de paridade quando há divergência

### Cross-reference
- Cálculos canônicos: `mem://finance/canonical-operational-profit-standard`
- Lucro Realizado: `mem://finance/lucro-real-payment-standard`
- Ajustes naturezas: `mem://finance/ajuste-saldo-natureza-classification-standard`
