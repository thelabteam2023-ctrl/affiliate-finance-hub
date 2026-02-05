# Memory: ux/isolamento-filtros-dimensionais-por-subaba

## Padrão Arquitetural: Isolamento de Filtros Dimensionais

### Regra-Mãe (Inegociável)
**FILTROS DIMENSIONAIS (Casa/Parceiro) SÃO CONTEXTO LOCAL DE SUB-ABA**

Os filtros dimensionais NÃO são globais. Eles afetam exclusivamente a sub-aba onde foram aplicados.

### Comportamento por Sub-Aba

#### Visão Geral
- **SEMPRE** usa dados GLOBAIS (`surebets`, `apostas`, etc.)
- **NUNCA** aplica filtros de Casa ou Parceiro
- **APENAS** filtro de período (data) é aplicado
- KPIs refletem performance total do projeto no período

#### Operações / Histórico
- **PODE** aplicar filtros dimensionais (Casa, Parceiro)
- Filtros afetam APENAS a listagem desta sub-aba
- Usado para investigação e análise detalhada

#### Por Casa
- **SEMPRE** usa dados GLOBAIS (sem filtro dimensional)
- Mostra breakdown de TODAS as casas do período
- Filtrar por Casa aqui seria contraproducente

### Implementação Técnica

```typescript
// Dados GLOBAIS (apenas filtro de data no fetch)
const surebets = [...]; // Já filtrado por período no fetch

// Dados FILTRADOS para Operações (aplica filtros dimensionais)
const filteredSurebetsForOperacoes = useMemo(() => {
  const { bookmakerIds, parceiroIds } = tabFilters;
  if (bookmakerIds.length === 0 && parceiroIds.length === 0) {
    return surebets;
  }
  return surebets.filter(surebet => { /* filtro dimensional */ });
}, [surebets, tabFilters.bookmakerIds, tabFilters.parceiroIds]);

// KPIs GLOBAIS (para Visão Geral) - NUNCA filtrados por Casa/Parceiro
const kpisGlobal = useMemo(() => computeKpis(surebets), [surebets]);

// KPIs FILTRADOS (para Operações)
const kpisOperacoes = useMemo(() => computeKpis(filteredSurebetsForOperacoes), [filteredSurebetsForOperacoes]);
```

### Tabs Afetadas
- ✅ ProjetoSurebetTab.tsx - Implementado isolamento
- ✅ ProjetoValueBetTab.tsx - Já correto (não aplica filtros dimensionais em KPIs)
- ✅ ProjetoDuploGreenTab.tsx - Já correto (não aplica filtros dimensionais em KPIs)
- ✅ ProjetoApostasTab.tsx - É uma aba de listagem, filtros são esperados

### Resultado Esperado
- Visão Geral SEMPRE mostra dados globais do período
- Operações permite drill-down por Casa/Parceiro
- KPIs nunca "somem" ao aplicar filtros em Operações
- UX previsível e confiável para análise financeira
