# Memory: finance/strategy-tabs-financial-consistency
Updated: 2026-03-04

Os badges de lucro e gráficos de evolução nas abas de estratégia (Surebet, ValueBet, Duplo Green) e nas **Tabelas de Ciclos** (ProjetoCiclosTab, ComparativoCiclosTab, useCicloAlertas) devem obrigatoriamente utilizar os campos de consolidação (`pl_consolidado`, `lucro_prejuizo_brl_referencia`) em vez dos valores brutos de lucro/prejuízo. Para volume, usar `stake_consolidado` quando disponível. Hierarquia de fallback: `pl_consolidado ?? lucro_prejuizo_brl_referencia ?? lucro_prejuizo`. Esta regra garante paridade absoluta entre a 'Visão Geral' e todas as abas/tabelas em projetos multimoedas.
