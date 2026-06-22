---
name: Workspace Financial FX Rate Standard
description: Telas workspace-level usam PTAX/FastForex (live + PTAX-do-dia para histórico). Cotação de Trabalho é EXCLUSIVA de projeto.
type: constraint
---
- Caixa Operacional, Financeiro, Posição de Capital e demais visões workspace-level usam useCotacoes (FastForex primário, PTAX fallback) para valores de HOJE e exchange_rate_history para valores HISTÓRICOS por data.
- Cotação de Trabalho (ProjectCurrencyContext/useProjetoCurrency) NÃO entra em telas workspace-level. Vive apenas dentro do escopo de um projeto.
- **Why:** Cotação de Trabalho é decisão do dono do projeto para isolar a operação interna; o dinheiro do workspace é avaliado pelo mercado oficial.
