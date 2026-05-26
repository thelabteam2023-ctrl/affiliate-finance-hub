-- Adicionar search_path fixo a funções SECURITY DEFINER que não possuem,
-- prevenindo injection de search_path.
-- Usamos ALTER FUNCTION (não recriamos) para não alterar a assinatura
-- nem quebrar o PostgREST.

-- activate_supplier_portal (2 sobrecargas)
ALTER FUNCTION public.activate_supplier_portal(uuid, text, text, text, uuid, text, text) SET search_path = public;
ALTER FUNCTION public.activate_supplier_portal(uuid, text, text, text, uuid) SET search_path = public;

-- autocorrigir_perna_incompleta
ALTER FUNCTION public.autocorrigir_perna_incompleta(uuid) SET search_path = public;

-- editar_surebet_completa_v2
ALTER FUNCTION public.editar_surebet_completa_v2(uuid, jsonb, jsonb, text, text, text, text, text, text, timestamp with time zone, numeric, numeric, numeric, numeric, numeric, numeric, text, text) SET search_path = public;

-- editar_surebet_completa_v3
ALTER FUNCTION public.editar_surebet_completa_v3(uuid, jsonb, jsonb, text, text, text, text, text, text, timestamp with time zone, text) SET search_path = public;

-- fn_aposta_auto_stake_ledger
ALTER FUNCTION public.fn_aposta_auto_stake_ledger() SET search_path = public;

-- fn_ledger_profundo_bookmaker
ALTER FUNCTION public.fn_ledger_profundo_bookmaker(uuid) SET search_path = public;

-- fn_perna_auto_stake_ledger
ALTER FUNCTION public.fn_perna_auto_stake_ledger() SET search_path = public;

-- fn_reconciliar_saldos_bookmakers
ALTER FUNCTION public.fn_reconciliar_saldos_bookmakers(uuid) SET search_path = public;

-- force_sync_all_balances
ALTER FUNCTION public.force_sync_all_balances() SET search_path = public;

-- get_cash_ledger_tags
ALTER FUNCTION public.get_cash_ledger_tags(uuid) SET search_path = public;

-- recalcular_perna_por_entradas
ALTER FUNCTION public.recalcular_perna_por_entradas(uuid) SET search_path = public;

-- reliquidar_aposta_v6
ALTER FUNCTION public.reliquidar_aposta_v6(uuid, text, numeric) SET search_path = public;

-- rpc_override_surebet_v1
ALTER FUNCTION public.rpc_override_surebet_v1(uuid, text, numeric, uuid, text) SET search_path = public;

-- sync_bookmaker_balance_from_ledger
ALTER FUNCTION public.sync_bookmaker_balance_from_ledger(uuid) SET search_path = public;