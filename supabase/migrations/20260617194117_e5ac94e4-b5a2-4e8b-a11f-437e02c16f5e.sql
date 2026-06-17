DO $do$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.get_central_operacoes_data'::regproc);
  v_def := replace(
    v_def,
    E'\'valor_usd\', cl.valor_usd\n    )), \'[]\'::jsonb) INTO v_section\n    FROM cash_ledger cl',
    E'\'valor_usd\', cl.valor_usd, \'created_at\', cl.created_at\n    )), \'[]\'::jsonb) INTO v_section\n    FROM cash_ledger cl'
  );
  EXECUTE v_def;
END $do$;