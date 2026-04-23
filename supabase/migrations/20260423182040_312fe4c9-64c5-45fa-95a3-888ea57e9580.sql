-- Patch idempotente: adicionar set_config('app.surebet_recalc_context','on',true)
-- como primeira instrução do BEGIN nas RPCs autorizadas, para que o guard
-- arbitragem deixe passar UPDATEs feitos por elas.

DO $migration$
DECLARE
  v_fn text;
  v_src text;
  v_new_src text;
  v_fns text[] := ARRAY[
    'liquidar_perna_surebet_v1',
    'reverter_liquidacao_v4',
    'liquidar_aposta_v4',
    'reliquidar_aposta_v6',
    'editar_perna_surebet_atomica',
    'deletar_perna_surebet_v1',
    'deletar_aposta_v4',
    'criar_surebet_atomica',
    'criar_aposta_atomica_v3'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_fns LOOP
    SELECT pg_get_functiondef(p.oid)
      INTO v_src
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_fn
    LIMIT 1;

    IF v_src IS NULL THEN
      RAISE NOTICE '%: função não existe — skip', v_fn;
      CONTINUE;
    END IF;

    IF v_src LIKE '%app.surebet_recalc_context%' THEN
      RAISE NOTICE '%: já contém marcador — skip', v_fn;
      CONTINUE;
    END IF;

    -- Inserir set_config após o primeiro BEGIN
    v_new_src := regexp_replace(
      v_src,
      'BEGIN(\s)',
      E'BEGIN\\1  PERFORM set_config(''app.surebet_recalc_context'', ''on'', true);\n',
      ''
    );

    EXECUTE v_new_src;
    RAISE NOTICE '%: patcheada com marcador de contexto', v_fn;
  END LOOP;
END
$migration$;