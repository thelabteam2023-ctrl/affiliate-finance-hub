# Memory: architecture/tab-filters-isolation-architecture
Updated: 2026-02-05

## Arquitetura de Filtros Isolados por Aba

### Princípio Fundamental
**FILTRO É CONTEXTO DE ABA, NÃO ESTADO GLOBAL**

Cada aba (Visão Geral, Operações, Por Casa, Surebet, etc.) mantém seu próprio estado de filtros. Mudanças em uma aba NÃO afetam outras abas.

### Implementação

#### Hook Local: `useTabFilters`
```typescript
const filters = useTabFilters({
  tabId: "surebet-operacoes",  // ID único por aba
  projetoId: projeto.id,
  defaultPeriod: "30dias",
  persist: true,  // Salva no localStorage por aba
});
```

#### Componente de Filtros: `TabFiltersBar`
```typescript
<TabFiltersBar
  projetoId={projetoId}
  filters={tabFilters}  // Recebe filtros via props, não de contexto
  showEstrategiaFilter={false}
/>
```

### Estrutura de Abas

```
ProjetoDetalhe
├── Visão Geral       → useTabFilters({ tabId: "visao-geral" })
├── Apostas Livres    → useTabFilters({ tabId: "apostas" })
│   ├── Visão Geral   → (sub-tab, usa mesmos filtros)
│   ├── Operações     → (sub-tab, usa mesmos filtros)
│   └── Por Casa      → (sub-tab, usa mesmos filtros)
├── Surebet           → useTabFilters({ tabId: "surebet" })
│   ├── Visão Geral   → (sub-tab, usa mesmos filtros)
│   ├── Operações     → (sub-tab, usa mesmos filtros)
│   └── Por Casa      → (sub-tab, usa mesmos filtros)
├── ValueBet          → useTabFilters({ tabId: "valuebet" })
├── Duplo Green       → useTabFilters({ tabId: "duplogreen" })
├── Cashback          → useTabFilters({ tabId: "cashback" })
└── Bônus             → useTabFilters({ tabId: "bonus" })
```

### Regras Inegociáveis

1. **Nenhum contexto global** - O `OperationalFiltersProvider` foi REMOVIDO
2. **Cada aba instancia seu próprio hook** - `useTabFilters` com `tabId` único
3. **Filtros são passados via props** - Nunca via contexto entre componentes
4. **Persistência por aba** - localStorage com chave `tab-filters-{projetoId}-{tabId}`
5. **Reset ao trocar de aba** - Cada aba carrega seus próprios filtros salvos

### Componentes Adaptados

| Componente | Antes | Depois |
|------------|-------|--------|
| `OperationsHistoryModule` | `useOperationalFilters()` | `tabFilters` via props |
| `OperationalFiltersBar` | Usa contexto global | Substituído por `TabFiltersBar` |
| `ProjetoDetalhe` | `OperationalFiltersProvider` | Sem provider global |

### Benefícios

- ✅ Leitura correta dos números em cada aba
- ✅ Gráficos e KPIs estáveis
- ✅ UX previsível e profissional
- ✅ Nenhuma contaminação entre abas
- ✅ Filtros persistem individualmente por aba
