
-- ============================================================================
-- LIMPEZA DE FUNÇÕES LEGADAS - Arquitetura Financeira v8
-- ============================================================================
-- Estas funções eram usadas em versões anteriores do motor financeiro e
-- NÃO estão mais vinculadas a triggers ativos. São candidatas a remoção segura.
-- ============================================================================

-- 1. Remover funções legadas de atualização de saldo (v1/v2)
-- Estas foram substituídas pelo trigger fn_cash_ledger_generate_financial_events
DROP FUNCTION IF EXISTS public.atualizar_saldo_bookmaker_caixa() CASCADE;
DROP FUNCTION IF EXISTS public.atualizar_saldo_bookmaker_caixa_v2() CASCADE;

-- 2. Remover versões antigas de triggers de saldo
DROP FUNCTION IF EXISTS public.atualizar_saldo_bookmaker_v2() CASCADE;
DROP FUNCTION IF EXISTS public.fn_financial_event_sync_balance() CASCADE;

-- 3. Remover funções de recálculo manual que conflitam com o motor de eventos
-- NOTA: Mantemos recalcular_saldo_bookmaker_v2 pois é usado pelo reprocessar_ledger_workspace
-- DROP FUNCTION IF EXISTS public.recalcular_saldo_bookmaker() CASCADE;

-- ============================================================================
-- VERIFICAÇÃO: Confirmar que triggers críticos v8 estão ativos
-- ============================================================================
-- Os triggers corretos são:
-- 1. tr_cash_ledger_generate_financial_events → fn_cash_ledger_generate_financial_events
-- 2. tr_cash_ledger_handle_pending → fn_cash_ledger_handle_pending
-- 3. tr_cash_ledger_lock_pending → fn_cash_ledger_lock_pending_on_insert

-- Não há triggers órfãos ou conflitantes ativos no momento.
-- ============================================================================

-- 4. Adicionar comentário de auditoria nas funções que permanecem
COMMENT ON FUNCTION public.fn_cash_ledger_generate_financial_events() IS 
'[MOTOR FINANCEIRO v8] Trigger principal que gera financial_events a partir do cash_ledger.
Única fonte autorizada para atualizar bookmakers.saldo_atual e saldo_freebet.
Data: 2026-01-27';

COMMENT ON FUNCTION public.fn_cash_ledger_handle_pending() IS 
'[MOTOR FINANCEIRO v8] Libera balance_locked de wallets quando transação muda de PENDENTE.
Data: 2026-01-27';

COMMENT ON FUNCTION public.fn_cash_ledger_lock_pending_on_insert() IS 
'[MOTOR FINANCEIRO v8] Trava saldo em wallets quando transação PENDENTE é inserida.
Data: 2026-01-27';
