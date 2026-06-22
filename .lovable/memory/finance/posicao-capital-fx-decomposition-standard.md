---
name: Posição de Capital FX Decomposition
description: Patrimônio = Capital histórico (PTAX do dia) + Resultado realizado (canônico) + FX não realizada (plug). ROI usa base histórica.
type: feature
---
Card de Posição de Capital (Financeiro) decompõe Patrimônio Atual em 3 linhas:
1. Capital próprio investido — aportes/liquidações avaliados pela PTAX do DIA de cada transação (USDBRL de exchange_rate_history × cotacao_origem_usd da linha do cash_ledger). Não oscila com câmbio atual.
2. Resultado operacional realizado — fonte canônica useWorkspaceLucroOperacional lifetime. Exclui FX.
3. Variação cambial não realizada — calculada por diferença. Exibida só quando |valor| >= max(50, 0,1% do patrimônio).
ROI = Resultado realizado / Capital histórico. Freebet segue informativo, fora da soma.
