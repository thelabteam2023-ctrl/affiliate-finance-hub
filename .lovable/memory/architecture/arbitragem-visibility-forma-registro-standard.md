# Arbitragem Visibility Standard

Operações criadas pelo formulário de Arbitragem/Surebet são identificadas para leitura operacional por `forma_registro = 'ARBITRAGEM'`, nunca apenas por `estrategia = 'SUREBET'`.

Motivo: `estrategia` é analítica e pode ser `EXTRACAO_BONUS`, `DUPLO_GREEN`, `PUNTER` etc.; usar estratégia como filtro primário omite histórico e abertas válidas.

Aplicação obrigatória:
- Abas Operações/Surebet devem carregar `ARBITRAGEM` por `forma_registro`.
- Badges/contadores de abertas de arbitragem devem contar por `forma_registro`.
- Filtros visuais por estratégia podem refinar a lista, mas não podem ser a fonte de verdade da existência da operação.
- “Todas as Apostas” deve manter operações `ARBITRAGEM` visíveis quando o usuário filtra por Surebet, mesmo se a estratégia analítica salva for outra.