# Memory: architecture/project-cycle-global-filter-standard
Updated: 2026-03-01

O sistema utiliza um 'Filtro de Ciclos' centralizado no 'StandardTimeFilter' que atua como um atalho inteligente para o controle de período em todas as abas do projeto (Dashboard, Bônus, Operações). (1) Comportamento: A seleção de um ciclo injeta automaticamente as datas de início e fim (real ou previsto) no filtro global; qualquer ajuste manual de data limpa a seleção do ciclo. (2) Visibilidade: O seletor só é exibido em projetos que possuem ciclos definidos. (3) Regra de Exibição: O dropdown filtra e exibe apenas ciclos cuja data_inicio <= hoje (estritamente por data, ignorando status). Ciclos futuros ficam ocultos até a data chegar. (4) UI: Quando um ciclo está ativo, os toggles de período (Mês, 7 dias etc.) ficam visualmente desativados.

## Fonte de Dados de Bônus Creditados (Correção 2026-03-01)

A contagem de 'Bônus Creditados' na Visão Geral (ProjetoDashboardTab) utiliza obrigatoriamente a tabela master 'project_bookmaker_link_bonuses' como fonte da verdade, NÃO o cash_ledger. O cash_ledger pode conter lançamentos de ajuste de bônus (ex: 'Ajuste de bônus: 100 → 100.11') com tipo_transacao='BONUS_CREDITADO' que inflam a contagem. Outros eventos promocionais (FREEBET_CONVERTIDA, CREDITO_PROMOCIONAL, GIRO_GRATIS_GANHO) continuam vindo do ledger.
