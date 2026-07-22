# Auditoria: Rollback total de Reversão Financeira

> Caso de referência: projeto **Ítalo**, reversão do depósito de R$ 1.000,00 da conta **Neon Pagamentos (Claudivan)** para a casa **Bora Jogar (Claudivan)**.

## 1. Arquitetura de uma movimentação

```text
cash_ledger (linha original)
  └─ trigger tr_cash_ledger_generate_financial_events
       └─ financial_events (STAKE / PAYOUT / DEPOSITO / SAQUE / AJUSTE / BONUS…)
            └─ trigger tr_financial_events_sync_balance
                 └─ bookmakers.saldo_atual / saldo_freebet
  └─ trigger tr_cash_ledger_lock_pending  → wallets.balance_locked
  └─ (indireto) contas_bancarias / wallets_crypto → v_saldo_*
```

`reverter_movimentacao_caixa`:
1. valida janela de 24h, permissões, dependências posteriores;
2. INSERE espelho como `AJUSTE_RECONCILIACAO` (direção oposta) com `financial_events_generated=false`, deixando o trigger unificado materializar o efeito contábil oposto no `bookmaker`/wallet/banco;
3. marca a linha original com `reversed_at` + `reversed_by_id`.

## 2. Ponto cego identificado — “ignora espelho”

A grande maioria dos consumidores filtra `cash_ledger` por `tipo_transacao IN ('DEPOSITO', 'SAQUE', …)`. Como o espelho é `AJUSTE_RECONCILIACAO`, o depósito original continua sendo contado, apesar de já ter `reversed_at` preenchido. Resultado: **saldos corrigem, KPIs não corrigem**.

Padrão de correção: adicionar `.is('reversed_at', null)` a **TODA** leitura de `cash_ledger` que agrega DEPOSITO / SAQUE / TRANSFERENCIA / BONUS / AJUSTE.

Helper canônico: `src/lib/ledger/effective.ts::applyEffectiveFilter`.

## 3. Matriz de consumidores auditados

| Consumidor | Impacto original | Estado antes | Estado depois |
|---|---|---|---|
| `useProjetoRecuperacaoCapital` (Card Recuperação de Capital) | Depósito conta como “investido”, saque como “recuperado” | ❌ ignorava reversão | ✅ `.is('reversed_at', null)` nas 3 queries |
| `fetchProjetosLucroCanonico` (Lucro Realizado do card do projeto) | Fluxo Líquido Ajustado | ❌ | ✅ filtro nas 2 queries |
| `fetchProjetoExtras` (Extras → Lucro Operacional) | Eventos promocionais, perdas de bônus, ajustes de saldo | ❌ | ✅ filtro em 3 queries |
| `calcularMetricasPeriodo` (KPIs por período) | Depósitos/saques do período | ❌ | ✅ filtro |
| `useParceiroFinanceiroConsolidado` (visão do parceiro) | Depósitos/saques por bookmaker | ❌ | ✅ filtro |
| `useBookmakerAnalise` (análise por casa) | Depósitos/saques por bookmaker | ❌ | ✅ filtro |
| `usePosicaoCapital` (Posição de Capital do workspace) | Aportes/liquidações | ❌ | ✅ filtro |
| `useFinanceiroData` (Visão Financeira workspace) | Todos os tipos | ❌ | ✅ filtro |
| `useFinanceiroMensal` | Fluxo mensal | ⚠️ herdado do canônico | ✅ via `fetchProjetosLucroCanonico` |
| `useExposicaoFinanceira` | PERDA_OPERACIONAL | ✅ já filtrava | ✅ mantido |
| `useKpiBreakdowns` (Lucro/Prejuízo Realizado do KPI) | consome `get_projeto_dashboard_data` | ⚠️ herdado do RPC | ✅ via migração (RPC filtra reversed_at) |
| `useProjetoDashboardData` / dashboard | idem | ⚠️ herdado | ✅ via migração |
| `snapshot-capital-diario` (edge cron) | fotografa saldos | ✅ lê `bookmakers.saldo_atual` já corrigido pelo trigger | ✅ mantido |
| `capital_snapshots` (snapshots já materializados) | histórico | ❌ podem conter valores pré-estorno | ✅ RPC de reversão remove snapshots ≥ data da transação |
| `cron-ledger-parity-sweep` | audita paridade eventos × saldos | ✅ opera em saldo, sem viés | ✅ mantido |
| `parceiro_lucro_alertas` | alertas de lucro/prejuízo por parceiro | herda de consolidado | ✅ herdado |
| `useCentralAlertsCount` | badge de alertas | herda de anomalias | ✅ herdado |
| Relatórios (`exportRelatorioPDF/XLSX`) | usam KPIs canônicos | ✅ herdado | ✅ herdado |

## 4. Regra de invalidação

O hook `useReverterMovimentacao` invalida agora, além de caixa/saldos:
`financeiro-data`, `financeiro-mensal-fluxo-canonico`, `workspace-lucro-realizado`, `posicao-capital`, `parceiro-financeiro-consolidado`, `parceiro-financeiro-cache`, `bookmaker-analise`, `capital-snapshots`, `ledger-parity-anomalies`, `resumo-operacional` — e cascade completa via `invalidateCanonicalCaches` (agora contém `projeto-recuperacao-capital`, `projeto-lucro-canonico`, `projeto-lucro-operacional-kpi`, `exposicao-financeira`, `projeto-performance`, `projeto-dashboard-rpc`, `metricas-periodo` etc.).

## 5. Backfill do caso Ítalo

Após deploy:
1. Reverter a operação R$ 1.000 (já feita anteriormente).
2. Rodar `select public.recompute_capital_snapshot(<workspace_id>, '2026-07-20'::date)` para o dia da transação e posteriores (ou aguardar próximo `snapshot-capital-diario`).
3. Conferir:
   - Card "Recuperação de Capital" do projeto Ítalo → capital aportado sem o R$ 1.000.
   - "Lucro Realizado" do card do projeto e do KPI de Visão Geral.
   - Extrato do projeto: mostra o depósito original riscado como revertido + o ESTORNO como espelho; net = 0.
   - Saldos por parceiro (Claudivan): Bora Jogar volta a R$ 4.367,00.

## 6. Guardrails

- Teste SQL: `supabase/tests/triggers/06_reversao_rollback_total.sql` — cria depósito, snapshoteia KPIs, reverte, confere que TODOS voltam ao estado pré-transação (tolerância 0.01).
- Cron `cron-ledger-parity-sweep` continua garantindo paridade `financial_events` × `bookmakers.saldo_atual`.
- Helper `applyEffectiveFilter` centraliza o padrão para futuras leituras.

## 7. Fora de escopo

- Nenhum retrofit em massa de dados financeiros (política anti-retrofix).
- Não altera motor de liquidação de apostas — apenas o eixo de movimentações financeiras.
