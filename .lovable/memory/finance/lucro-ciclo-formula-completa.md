# Memory: finance/lucro-ciclo-formula-completa
Updated: 2026-02-06

## Fórmula Canônica do Lucro do Ciclo

O **Lucro Real do Ciclo** deve incluir TODAS as fontes de receita que geraram caixa no período:

```
LUCRO_CICLO = LUCRO_APOSTAS + CASHBACK + GIROS_GRATIS - PERDAS_CONFIRMADAS
```

### Componentes:

1. **LUCRO_APOSTAS**: Soma de `lucro_prejuizo` de `apostas_unificada` onde `status = 'LIQUIDADA'`
2. **CASHBACK**: Soma de `valor` de `cashback_manual` no período (sempre >= 0)
3. **GIROS_GRATIS**: Soma de `valor_retorno` de `giros_gratis` onde `status = 'confirmado'` (sempre >= 0)
4. **PERDAS_CONFIRMADAS**: Soma de `valor` de `projeto_perdas` onde `status = 'CONFIRMADA'`

### Arquivos que implementam esta fórmula:

- `src/hooks/useProjetoResultado.ts` - Hook principal de resultado do projeto ✅
- `src/hooks/useCicloAlertas.ts` - Alertas de ciclo (meta/tempo) ✅
- `src/components/projeto-detalhe/ProjetoCiclosTab.tsx` - Métricas de ciclos ativos ✅
- `src/components/projeto-detalhe/ComparativoCiclosTab.tsx` - Comparativo entre ciclos ✅

### Regra de Negócio (Inviolável)

> **Se uma entrada financeira impacta o saldo operável e não é passivo, é lucro real.**

Cashback recebido, por exemplo, é dinheiro que entrou na operação e deve obrigatoriamente ser contabilizado no lucro do ciclo, garantindo consistência entre:
- Calendário de Lucros
- Visão Geral
- Aba Surebet/Apostas
- KPIs do Ciclo
