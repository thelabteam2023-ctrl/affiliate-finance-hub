DO $$
DECLARE
  r record;
  v_def text;
  v_new text;
BEGIN
  FOR r IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_projeto_lucro_operacional_daily',
        'get_projetos_lucro_operacional',
        'get_projeto_apostas_resumo'
      )
      AND p.prosrc LIKE '%BONUS_CANCELAMENTO%'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_new := replace(
      v_def,
      'cl.ajuste_motivo = ''BONUS_CANCELAMENTO''',
      'cl.ajuste_motivo IN (''BONUS_CANCELAMENTO'', ''PROMO_LIMIT'')'
    );
    IF v_new <> v_def THEN
      EXECUTE v_new;
    END IF;
  END LOOP;
END $$;