# Memory: finance/canonical-operational-profit-standard
Updated: 2026-03-09

A métrica 'Lucro Operacional' segue uma fórmula canônica centralizada no serviço 'fetchProjetosLucroOperacionalKpi':

```
LUCRO_OPERACIONAL = 
  Apostas Liquidadas (status = LIQUIDADA, via getConsolidatedLucro)
  + Cashback Manual
  + Giros Grátis Confirmados
  + Bônus (exceto FREEBET)
  - Perdas Operacionais Confirmadas
  + Ajustes de Conciliação
  + Ajustes de Saldo (extras canônicos)
  + Resultado Cambial (extras canônicos)
```

## Fonte Única de Verdade

O hook 'useWorkspaceLucroOperacional' (Dashboard Financeiro) agora **delega integralmente** para 'fetchProjetosLucroOperacionalKpi', eliminando a engine duplicada que causava divergências (~R$ 143 de diferença).

### Antes (duas engines)
- **Projetos**: fetchProjetosLucroOperacionalKpi (7 módulos, paginação, getConsolidatedLucro)
- **Dashboard**: useWorkspaceLucroOperacional (3 módulos inline, sem paginação, conversão EUR ad-hoc)

### Depois (engine única)
- **fetchProjetosLucroOperacionalKpi** é a única engine de cálculo
- **useWorkspaceLucroOperacional** busca projeto IDs → delega ao serviço → agrega
- Suporta filtros de período (dataInicio/dataFim) no timezone operacional (São Paulo)

## Proteções
- Paginação automática para >1000 linhas (apostas)
- Timezone operacional (São Paulo) para filtros de data
- getConsolidatedLucro para conversão multimoeda consistente
- Exclusão de FREEBET para evitar dupla contagem com P&L de apostas SNR
