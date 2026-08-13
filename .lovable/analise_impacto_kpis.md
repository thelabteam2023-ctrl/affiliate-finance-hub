# Análise de Impacto: Ajuste de Saldo vs KPIs

## 1. O que foi corrigido?
A falha impedia que o **saldo atual** das bookmakers fosse atualizado quando um usuário utilizava a função "Ajustar Saldo" na aba Vínculos. O registro existia no extrato (Ledger), mas não gerava o evento financeiro V6 que move o saldo real.

## 2. Impacto nos KPIs

### Patrimônio Total (Net Worth)
- **Afetado:** Sim. 
- **Detalhe:** Como o saldo da casa não diminuía (em casos de ajuste negativo) ou aumentava (ajuste positivo), o valor total do patrimônio exibido no Dashboard e na aba Vínculos estava incorreto (inflado ou defasado).
- **Status após correção:** Normalizado. Todos os ajustes retroativos foram aplicados, então o patrimônio agora reflete a realidade.

### Lucro Operacional (Canônico)
- **Afetado:** Não.
- **Motivo:** O lucro operacional é derivado de apostas liquidadas e ocorrências de perda. Ajustes de saldo (Reconciliação) são classificados como eventos de **equilíbrio de caixa**, não como lucro ou prejuízo operacional. Eles corrigem o "onde está o dinheiro", não o "quanto ganhamos".

### ROI e Volume
- **Afetado:** Não.
- **Motivo:** ROI e Volume dependem estritamente do montante apostado e retornado. Ajustes manuais de saldo são ignorados nesses cálculos para evitar poluição das métricas de performance das estratégias.

### Lucro Real (Saques - Depósitos)
- **Afetado:** Não diretamente.
- **Motivo:** O cálculo de lucro real usa transações de fluxo externo. Ajustes de saldo são ajustes internos de inventário.

## 3. Conclusão do Diagnóstico
O impacto foi estritamente na **precisão do saldo em conta** e, consequentemente, na visão de **Patrimônio Total**. KPIs de performance, lucratividade e volume não sofreram distorções, pois a engine de cálculo desses indicadores já ignora transações do tipo `AJUSTE_SALDO` por definição técnica.

---
*Nota: No caso do André (Parimatch), o patrimônio total dele "caiu" R$ 760,77 hoje, mas essa queda é apenas a sincronização com uma realidade que já existia (o dinheiro já não estava lá, mas o sistema ainda o contava).*
