-- Injeta o marcador de bypass nas rotinas legítimas que precisam gravar saldo negativo
-- (motor de eventos financeiros, reconciliações, recálculos, desvinculação).
DO $do$
DECLARE
  v_sig TEXT;
  v_def TEXT;
  v_new TEXT;
  v_sigs TEXT[] := ARRAY[
    'public.fn_financial_events_sync_balance()',
    'public.reconciliar_saldo_bookmaker(uuid)',
    'public.sync_bookmaker_balance_from_ledger(uuid)',
    'public.recalcular_saldos_projeto(uuid, boolean)',
    'public.recalcular_saldos_workspace(uuid, boolean)',
    'public.reprocessar_ledger_workspace(uuid)',
    'public.reset_projeto_operacional_seguro(uuid, uuid, boolean)',
    'public.desvincular_bookmaker_atomico(uuid, uuid, uuid, uuid, text, numeric, text, boolean, boolean)'
  ];
BEGIN
  FOREACH v_sig IN ARRAY v_sigs LOOP
    v_def := pg_get_functiondef(v_sig::regprocedure);

    IF position('app.allow_negative_balance' in v_def) > 0 THEN
      CONTINUE;
    END IF;

    v_new := regexp_replace(
      v_def,
      E'\\nBEGIN\\n',
      E'\nBEGIN\n  PERFORM set_config(''app.allow_negative_balance'', ''on'', true);\n',
      ''
    );

    IF v_new = v_def THEN
      RAISE EXCEPTION 'Nao foi possivel injetar bypass em %', v_sig;
    END IF;

    EXECUTE v_new;
  END LOOP;
END;
$do$;