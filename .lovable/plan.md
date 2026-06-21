# Plano de Melhorias — Rebalanceado (segurança proporcional)

Contexto: app de gestão operacional de apostas — não é fintech regulada. Foco em **valor operacional** (observabilidade, testes, performance, UX) com segurança pragmática.

## P0 — Observabilidade do Ledger (alto valor, baixo esforço)

Hoje o `probeBookmakerLedgerParity` só grava em `window.__INTEGRITY_LOG__` (some ao recarregar). Persistir traz auditoria histórica e alertas reais.

- **[M] Tabela `ledger_parity_anomalies`** — `workspace_id`, `bookmaker_id`, `saldo_atual`, `soma_ledger`, `delta`, `contexto`, `acknowledged_at/by`. RLS por workspace.
- **[M] Edge function `record-parity-anomaly`** — chamada pelo probe quando `|delta| > 0.01`. Idempotente por `(bookmaker_id, dia, contexto)`.
- **[S] Página `/admin/ledger-anomalies`** — lista últimas 50, filtro por bookmaker, botão "reconhecer".
- **[S] Cron probe diário** — edge function 1×/dia varre bookmakers ativas. Sem auto-correção.
- **[S] Badge no header do projeto** — verde/amarelo/vermelho conforme última varredura.

## P1 — Test Harness para Triggers Financeiros

Hoje validamos manualmente cada mudança em `fn_recalc_*`. Suite reproduzível protege regressões.

- **[L] `supabase/tests/triggers/`** — SQL files em `BEGIN ... ROLLBACK`:
  - LAY (GREEN/RED/MEIO/VOID)
  - Surebet 2 pernas BACK+LAY (todas combinações)
  - Edit LIQUIDADA → REVERSAL + reemissão
  - Multi-currency BRL+USD
  - Freebet SNR (tipo_uso=NORMAL)
- **[M] Runner `scripts/run-db-tests.ts`** — aplica fixture, valida `pl_consolidado` × Σ pernas × Σ `financial_events`. Saída human-readable.
- **[S] Workflow opcional no CI** — roda na branch antes de merge em main.

## P2 — Performance

- **[M] `supabase--slow_queries` audit** — top 10, propor índices ou reescrita.
- **[S] Índices prováveis** — `cash_ledger(bookmaker_id, created_at DESC)`, `financial_events(bookmaker_id, tipo_movimento)`, `apostas_unificada(projeto_id, status, data_evento)`.
- **[M] React profiling** — `useProjetoCurrency` e `convertToConsolidation` em loops de cards. Garantir `useMemo` e estabilidade de referências.
- **[S] Cache de Cotação de Trabalho** — `getEffectiveRate` por moeda+projeto via `useMemo` no Context.

## P3 — UX / Qualidade de Vida

- **[S] AlertDialog shadcn** substituindo `window.confirm` na edição de LIQUIDADA (explica REVERSAL).
- **[S] Toast persistente** para `SALDO_LEDGER_DIVERGENTE` com link pro dashboard P0.
- **[S] Tooltip "Liability = stake × (odd − 1)"** em cards LAY.
- **[M] Filtro rápido "com divergência"** na lista de projetos (usa tabela P0).

## P4 — Segurança Pragmática (sem hardening exagerado)

Apenas o essencial — descarta os 600+ warnings de `search_path` (cleanup cosmético).

- **[S] Auditar as 5 Security Definer Views** — validar se cada uma precisa do flag; se for legacy, converter para `SECURITY INVOKER` com RLS. Se for necessária (ex: bypass para função admin), documentar em memória.
- **[S] Habilitar Leaked Password Protection** nas configs de auth (1 toggle, sem código).
- **Ignorar** o lote `Function Search Path Mutable` — risco real é baixo (apenas exploit teórico se schema malicioso for criado, e só admin pode fazer isso).

## Sequenciamento

```text
Sprint 1 (P0 completo):
  Tabela + edge fn + dashboard + cron + badge

Sprint 2 (P1 + P3):
  Test harness 3 casos + UX upgrades

Sprint 3 (P2 + P4):
  Slow queries + índices + 5 views

Sprint 4 (P1 expansão):
  Runner CI + cobertura completa de triggers
```

## Escopo Protegido

- Lógica de cálculo financeira (`fn_recalc_*`, `criar_surebet_atomica_v3`, `liquidar_perna_surebet_v1`) — congelada pós-Fase 4
- Frontend Surebet/Calculadora — só mudanças cosméticas em P3
- Zero retrofix em dados existentes

## Pergunta

Começo por **Sprint 1 (P0 — observabilidade)**? É o que entrega valor mais visível para você em uma sessão.
