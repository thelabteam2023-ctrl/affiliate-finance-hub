# Memory: architecture/event-scope-blindagem-standard
Updated: 2026-04-02

O sistema financeiro utiliza separação explícita de domínio via coluna `event_scope` (ENUM: 'REAL' | 'VIRTUAL') na tabela `financial_events`. 

**Hard Rules:**
1. Apenas eventos com `event_scope = 'REAL'` podem alterar `saldo_atual` ou `saldo_freebet` em bookmakers
2. Eventos `VIRTUAL` são registrados para contabilidade de projeto (P&L) mas NUNCA tocam saldo real
3. O trigger `fn_financial_events_sync_balance` verifica `event_scope` como primeiro gate — se VIRTUAL, registra auditoria sem impacto
4. O trigger `fn_cash_ledger_generate_financial_events` classifica automaticamente: `DEPOSITO_VIRTUAL` e `SAQUE_VIRTUAL` → scope VIRTUAL; todos os demais → scope REAL
5. A view `v_bookmakers_desvinculados` inclui regra anti-máscara: casas com atividade REAL nos últimos 90 dias ou atualizadas nos últimos 30 dias NUNCA são ocultadas
6. A função `fn_audit_balance_anomalies(workspace_id)` detecta divergências entre saldo materializado e soma do ledger REAL

**Classificação automática:** Nenhum evento entra sem scope definido (default = REAL). Transações virtuais são identificadas pelo tipo_transacao do cash_ledger.
