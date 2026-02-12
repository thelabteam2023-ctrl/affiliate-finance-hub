-- Drop the duplicate overload that causes ambiguity
-- Keeping the version with (surebet_id, perna_id, resultado, resultado_anterior, workspace_id, fonte_saldo)
DROP FUNCTION IF EXISTS public.liquidar_perna_surebet_v1(uuid, uuid, text, text, text, uuid);