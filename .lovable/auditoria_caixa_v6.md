# Auditoria de Cobertura da Arquitetura Financeira V6 — Caixa Operacional

## 1. Mapeamento de Operações e Tipos de Transação

| Operação | tipo_transacao Real | Gera cash_ledger | Gera financial_event | V6 Status |
| :--- | :--- | :--- | :--- | :--- |
| **Ajuste Manual** | `AJUSTE_MANUAL` | ✓ Sim | ✓ Sim | `V6_REQUIRED_AND_IMPLEMENTED` |
| **Reconciliação de Saldo** | `AJUSTE_RECONCILIACAO` | ✓ Sim | ✓ Sim | `V6_REQUIRED_AND_IMPLEMENTED` |
| **Reportar Scan** | `PERDA_OPERACIONAL` | ✓ Sim | ✓ Sim | `V6_REQUIRED_AND_IMPLEMENTED` |

## 2. Matriz de Cobertura V6

| Tipo de operação | tipo_transacao | Ledger | Event | Trigger V6 | Saldo | Patrimônio | Idempotência |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| Ajuste Manual | `AJUSTE_MANUAL` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reconciliação | `AJUSTE_RECONCILIACAO` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reportar Scan | `PERDA_OPERACIONAL` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ajuste Vínculos | `AJUSTE_SALDO` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Ajuste Cambial | `GANHO/PERDA_CAMBIAL` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## 3. Diagnóstico por Operação

### A. Ajuste Manual (`AJUSTE_MANUAL`)
- **Fluxo:** `AjusteManualDialog.tsx` → `cash_ledger` → Trigger V6 → `financial_events` → `fn_bookmaker_balance_update` (via trigger no event).
- **Semântica:** Pode ser ENTRADA ou SAÍDA. Atualmente o trigger V6 mapeia corretamente `ajuste_direcao` para o sinal do valor.
- **Risco:** O trigger exige `destino_bookmaker_id` ou `origem_bookmaker_id`. Ajustes em Contas Bancárias ou Wallets **NÃO** geram `financial_events`, pois o patrimônio de parceiros é calculado via `v_saldo_parceiro_contas/wallets` (que lê o ledger diretamente), enquanto bookmakers usam o saldo materializado `saldo_atual`.
- **Conclusão:** `V6_REQUIRED_AND_IMPLEMENTED` (para bookmakers). Para wallets/contas, o impacto no patrimônio é direto via ledger, o que é o comportamento esperado.

### B. Reconciliação de Saldo (`AJUSTE_RECONCILIACAO`)
- **Fluxo:** `ReconciliacaoDialog.tsx` → `cash_ledger`.
- **Observação Crítica:** O trigger V6 (`fn_cash_ledger_generate_financial_events`) já inclui `AJUSTE_RECONCILIACAO` no bloco que trata bookmakers.
- **Diferença:** A reconciliação calcula a diferença entre o saldo real informado e o saldo do sistema e registra essa diferença no ledger.
- **Sinal:** O diálogo envia o valor absoluto da diferença e a direção (`ENTRADA/SAIDA`). O trigger V6 inverte o sinal para `SAIDA`.
- **Conclusão:** `V6_REQUIRED_AND_IMPLEMENTED`.

### C. Reportar Scan (`PERDA_OPERACIONAL`)
- **Fluxo:** `ReportarScanDialog.tsx` → `cash_ledger` com `tipo_transacao = 'PERDA_OPERACIONAL'`.
- **Impacto:** O trigger V6 possui um bloco específico para `PERDA_OPERACIONAL` que gera um `financial_event` do tipo `LOSS`.
- **Conclusão:** `V6_REQUIRED_AND_IMPLEMENTED`.

## 4. Auditoria do Trigger V6 (Análise Técnica)

A função `fn_cash_ledger_generate_financial_events` cobre:
1. `DEPOSITO` (Destino BK)
2. `SAQUE` (Origem BK)
3. `PERDA_OPERACIONAL` (Origem BK) -> Scan
4. `PERDA_REVERSAO` (Destino BK)
5. `BONUS_CREDITADO` (Destino BK)
6. `GIRO_GRATIS` (Destino BK)
7. `CASHBACK_MANUAL` (Destino BK)
8. `AJUSTE_MANUAL`, `AJUSTE_SALDO`, `AJUSTE_RECONCILIACAO` (Origem/Destino BK)
9. `GANHO_CAMBIAL`, `PERDA_CAMBIAL` (Origem/Destino BK)

### Lacunas Identificadas (Missing in V6 Pipeline)
- **`PERDA_ATIVO`**: Presente no ledger (1 registro) mas não tratada no trigger V6. Se uma perda de ativo (ex: rede incorreta) ocorrer em uma bookmaker, o saldo não será atualizado via V6.
- **`TRANSFERENCIA`**: Transferências entre bookmakers ou entre conta e bookmaker. Atualmente a transferência atualiza saldos via lógica legada ou trigger direto de `cash_ledger`? **Risco de inconsistência**.
- **`APORTE_FINANCEIRO`**: Se o aporte for feito direto em uma bookmaker, o trigger V6 não o captura (não está na lista de IFs).

## 5. Auditoria Histórica e Registros Órfãos

Executando verificação de registros `CONFIRMADO` no ledger sem evento financeiro correspondente (para tipos que deveriam ter):
- **Resultado:** A migração `20260813152631` já regularizou ajustes cambiais.
- **Ponto de Atenção:** `AJUSTE_SALDO` e `AJUSTE_RECONCILIACAO` antigos podem ter sido processados antes da implementação total da V6 em todas as rotas.

## 6. Recomendações de Remediação

1. **Blindagem de `PERDA_ATIVO`**: Adicionar ao trigger V6 para garantir que perdas de ativos em bookmakers também gerem eventos de `LOSS`.
2. **Auditoria de `TRANSFERENCIA`**: Verificar se transferências envolvendo bookmakers estão gerando eventos financeiros. O trigger atual **NÃO** possui bloco para `TRANSFERENCIA`.
3. **Padrão de Idempotência**: O prefixo da chave de idempotência varia (`ledger_deposit_`, `ledger_withdraw_`, `ledger_ajuste_`, `ledger_fx_`). Recomendado padronizar para `ledger_v6_{id}` em futuras expansões.

---
**Status Final da Auditoria:** Concluída com apontamentos de melhoria em tipos secundários (`PERDA_ATIVO`, `TRANSFERENCIA`). As três operações principais solicitadas estão cobertas.
