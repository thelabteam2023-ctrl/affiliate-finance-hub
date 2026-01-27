# Memory: architecture/unified-balance-source-of-truth
Updated: 2026-01-27

## Unificação da Fonte de Saldo entre Apostas e Projetos

### Problema Resolvido
O sistema tinha duas fontes de cálculo de saldo que divergiam:
1. **Aba Apostas**: Usava `get_bookmaker_saldos` (RPC canônica) com conversão dinâmica via `useProjetoCurrency`
2. **Aba Projetos**: Usava `get_saldo_operavel_por_projeto` (RPC defeituosa) que ignorava EUR e outras moedas

Resultado: Valores diferentes entre abas para o mesmo projeto (ex: $1.118,88 vs $1.000,24)

### Nova Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                    FONTE ÚNICA DE VERDADE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   RPC: get_bookmaker_saldos                                     │
│   ├── Retorna moeda nativa de cada bookmaker                   │
│   ├── Calcula: saldo_operavel = real + freebet + bonus - stake │
│   └── Suporta TODAS as moedas (BRL, USD, EUR, MXN, etc.)       │
│                                                                 │
│   HOOKS (Consomem a RPC):                                       │
│   ├── useBookmakerSaldosQuery: Saldos individuais (Apostas)    │
│   ├── useSaldoOperavel: Totais por projeto (Dashboard)         │
│   └── useProjetosSaldos: Agregação multi-projeto (Listagem)    │
│                                                                 │
│   CONVERSÃO:                                                    │
│   ├── Ocorre NO FRONTEND via useCotacoes/getRate               │
│   └── NUNCA no banco de dados                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Mudanças Implementadas

| Componente | Antes | Depois |
|------------|-------|--------|
| GestaoProjetos.tsx | `get_saldo_operavel_por_projeto` | `useProjetosSaldos` (hook) |
| Listagem de Projetos | Conversão BRL/USD hardcoded | Conversão dinâmica via `getRate` |
| Moedas suportadas | Apenas BRL e USD | Todas (BRL, USD, EUR, MXN, COP, etc.) |
| Render de saldo | Calculado no fetch | Consumido do hook no render |

### Arquivos Modificados/Criados
- `src/hooks/useProjetosSaldos.ts` - Novo hook para agregação multi-projeto
- `src/pages/GestaoProjetos.tsx` - Refatorado para usar hook unificado

### Regra de Ouro
> "Saldos de bookmaker vêm SEMPRE da RPC `get_bookmaker_saldos`."
> "Projetos AGREGAM saldos já calculados, nunca recalculam."
> "Conversão de moeda ocorre no FRONTEND, nunca no banco."
