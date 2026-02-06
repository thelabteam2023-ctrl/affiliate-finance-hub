# Memory: architecture/calendar-filter-decoupling-v1
Updated: 2026-02-06

## Desacoplamento Total entre Calendário e Filtros de Data

### Princípio Fundamental
**CALENDÁRIO ≠ FILTRO**
**FILTRO ≠ CALENDÁRIO**

O calendário é um componente VISUAL de navegação temporal.
Os filtros de data são mecanismos ANALÍTICOS de agregação.
Eles NUNCA devem compartilhar estado ou dependências.

### Arquitetura Implementada

#### Dois Fluxos de Dados Separados

```
┌─────────────────────────────────────────────────────────────┐
│                     [QualquerTab]                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │ calendarApostas     │    │ apostas (filtradas)         │ │
│  │ (useCalendarApostas)│    │ (query com dateRange)       │ │
│  │ SEM filtro de data  │    │ COM filtro de data          │ │
│  └──────────┬──────────┘    └─────────────┬───────────────┘ │
│             │                             │                 │
│             ▼                             ▼                 │
│  ┌─────────────────────┐    ┌─────────────────────────────┐ │
│  │ CalendarioLucros    │    │ KPIs, Gráficos, Evolução    │ │
│  │ (Visual/Navegação)  │    │ (Análise/Agregação)         │ │
│  └─────────────────────┘    └─────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Hook Dedicado: useCalendarApostas

Localização: `src/hooks/useCalendarApostas.ts`

```typescript
const { apostas: calendarApostas, refetch } = useCalendarApostas({
  projetoId,
  estrategia: "SUREBET", // Opcional: filtra por estratégia da aba
});
```

#### Componentes Afetados

| Componente | Implementação |
|------------|---------------|
| `ProjetoDashboardTab` | `apostasCalendario` state + fetch separado |
| `ProjetoSurebetTab` | `useCalendarApostas({ estrategia: "SUREBET" })` |
| `ProjetoDuploGreenTab` | `useCalendarApostas({ estrategia: "DUPLO_GREEN" })` |
| `ProjetoValueBetTab` | `useCalendarApostas({ estrategia: "VALUEBET" })` |

#### Uso no VisaoGeralCharts

```tsx
<VisaoGeralCharts 
  apostas={apostasFiltradasPeloFiltro}          // Para gráficos/KPIs
  apostasCalendario={transformCalendarApostasForCharts(calendarApostas)} // Para calendário
  ...
/>
```

### Comportamento Correto Garantido

1. **Filtro "Mês anterior"**: 
   - KPIs mostram dados de janeiro
   - Calendário abre em fevereiro (mês atual)
   - Calendário mostra dados de fevereiro normalmente

2. **Navegação do calendário**:
   - Não altera filtros analíticos
   - Não recalcula KPIs
   - Apenas muda o mês visual exibido

3. **Mudança de filtro**:
   - Não altera o mês do calendário
   - Calendário mantém navegação independente

### Proibições Absolutas

- ❌ useEffect que observe filtros e altere calendário
- ❌ Derivar filtros a partir do calendário
- ❌ Compartilhar estado entre filtros e calendário
- ❌ Usar dados filtrados para o calendário
- ❌ Recalcular métricas ao navegar no calendário
- ❌ Passar `apostas` filtradas para `apostasCalendario`

### Regra de Ouro

> O calendário é uma JANELA para o histórico completo.
> Os filtros são uma LUPA para análise específica.
> Eles coexistem, mas NÃO se interferem.
