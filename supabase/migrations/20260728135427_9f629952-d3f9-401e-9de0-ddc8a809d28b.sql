DO $$
DECLARE v_tx RECORD;
BEGIN
  SELECT * INTO v_tx FROM public.cash_ledger WHERE id = '73f8ef1d-c898-4efc-857b-3e745f7a1aa8';
  IF NOT FOUND THEN RETURN; END IF;

  INSERT INTO public.audit_logs (workspace_id, actor_user_id, action, entity_type, entity_id, before_data, metadata)
  VALUES (v_tx.workspace_id, v_tx.user_id, 'DELETE', 'cash_ledger', v_tx.id, to_jsonb(v_tx),
    jsonb_build_object('motivo', 'Aporte invalido criado durante diagnostico: sem conta de destino no Caixa Operacional', 'deleted_at', NOW()));

  DELETE FROM public.cash_ledger WHERE referencia_transacao_id = v_tx.id;
  DELETE FROM public.cash_ledger WHERE id = v_tx.id;
END $$;