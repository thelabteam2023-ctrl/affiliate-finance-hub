
-- =============================================
-- FIX 3: Fix ocorrencias-anexos storage policies
-- =============================================
DROP POLICY IF EXISTS "read_ocorrencias_anexos" ON storage.objects;
DROP POLICY IF EXISTS "delete_ocorrencias_anexos" ON storage.objects;

CREATE POLICY "read_ocorrencias_anexos"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'ocorrencias-anexos'
    AND EXISTS (
      SELECT 1 FROM public.ocorrencias o
      JOIN public.workspace_members wm ON wm.workspace_id = o.workspace_id
      WHERE o.id::text = (storage.foldername(name))[1]
        AND wm.user_id = auth.uid()
    )
  );

CREATE POLICY "delete_ocorrencias_anexos"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'ocorrencias-anexos'
    AND EXISTS (
      SELECT 1 FROM public.ocorrencias o
      JOIN public.workspace_members wm ON wm.workspace_id = o.workspace_id
      WHERE o.id::text = (storage.foldername(name))[1]
        AND wm.user_id = auth.uid()
    )
  );

-- =============================================
-- FIX 4: Set search_path on functions missing it
-- =============================================
ALTER FUNCTION public.fn_cash_ledger_projeto_snapshot() SET search_path = public;
ALTER FUNCTION public.validate_wallet_coin_network() SET search_path = public;
ALTER FUNCTION public.protect_caixa_operacional() SET search_path = public;
ALTER FUNCTION public.get_exchange_adjustment_totals(uuid) SET search_path = public;
ALTER FUNCTION public.get_bookmaker_saldos(uuid) SET search_path = public;
ALTER FUNCTION public.calculate_expires_at(billing_period, timestamptz) SET search_path = public;
ALTER FUNCTION public.validate_bookmaker_resolution_requires_ledger_zero() SET search_path = public;
ALTER FUNCTION public.guard_wallet_debit() SET search_path = public;
ALTER FUNCTION public.get_cash_ledger_totals(uuid, date, date, text[]) SET search_path = public;
ALTER FUNCTION public.get_remaining_days(timestamptz) SET search_path = public;
ALTER FUNCTION public.fn_normalize_freebet_metadata() SET search_path = public;
ALTER FUNCTION public.update_subscription_updated_at() SET search_path = public;
ALTER FUNCTION public.process_financial_event(uuid, uuid, text, text, text, numeric, text, text, uuid, text, jsonb) SET search_path = public;
ALTER FUNCTION public.compute_subscription_status(timestamptz, subscription_status, integer) SET search_path = public;
ALTER FUNCTION public.recalculate_rollover_on_bonus_change() SET search_path = public;
