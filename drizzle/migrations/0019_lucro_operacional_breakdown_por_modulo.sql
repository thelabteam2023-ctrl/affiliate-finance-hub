-- Expoe o lucro operacional consolidado POR MODULO (apostas, bonus, cashback, ...)
-- para que o Financeiro possa exibir a composicao auditavel sem recalcular no cliente.
DO $do$
DECLARE d text; d0 text;
BEGIN
  d := pg_get_functiondef('public.get_projetos_lucro_operacional(uuid[],text,text,jsonb)'::regprocedure);
  d0 := d;

  IF position('__modulosConsolidado' in d) > 0 THEN
    RETURN;
  END IF;

  d := replace(d, '  v_acc numeric;', '  v_acc numeric;
  v_mod_consolidado jsonb;
  v_mod_acc numeric;');

  d := replace(d, '    v_consolidado := 0;
    v_por_moeda := ''{}''::jsonb;', '    v_consolidado := 0;
    v_por_moeda := ''{}''::jsonb;
    v_mod_consolidado := ''{}''::jsonb;');

  d := replace(d, '          IF v_modulo IN (''perdas'', ''cancelamento_bonus'') THEN
            v_consolidado := v_consolidado - v_valor;
          ELSE
            v_consolidado := v_consolidado + v_valor;
          END IF;', '          IF v_modulo IN (''perdas'', ''cancelamento_bonus'') THEN
            v_consolidado := v_consolidado - v_valor;
            v_mod_acc := COALESCE((v_mod_consolidado->>v_modulo)::numeric, 0) - v_valor;
          ELSE
            v_consolidado := v_consolidado + v_valor;
            v_mod_acc := COALESCE((v_mod_consolidado->>v_modulo)::numeric, 0) + v_valor;
          END IF;
          v_mod_consolidado := jsonb_set(v_mod_consolidado, ARRAY[v_modulo], to_jsonb(v_mod_acc));');

  d := replace(d, '        IF v_modulo IN (''perdas'', ''cancelamento_bonus'') THEN
          v_consolidado := v_consolidado - (v_valor * COALESCE(v_taxa, 1));
        ELSE
          v_consolidado := v_consolidado + (v_valor * COALESCE(v_taxa, 1));
        END IF;', '        IF v_modulo IN (''perdas'', ''cancelamento_bonus'') THEN
          v_consolidado := v_consolidado - (v_valor * COALESCE(v_taxa, 1));
          v_mod_acc := COALESCE((v_mod_consolidado->>v_modulo)::numeric, 0) - (v_valor * COALESCE(v_taxa, 1));
        ELSE
          v_consolidado := v_consolidado + (v_valor * COALESCE(v_taxa, 1));
          v_mod_acc := COALESCE((v_mod_consolidado->>v_modulo)::numeric, 0) + (v_valor * COALESCE(v_taxa, 1));
        END IF;
        v_mod_consolidado := jsonb_set(v_mod_consolidado, ARRAY[v_modulo], to_jsonb(v_mod_acc));');

  d := replace(d, '      ''__consolidado'', v_consolidado,', '      ''__consolidado'', v_consolidado,
      ''__modulosConsolidado'', v_mod_consolidado,');

  IF d = d0 OR position('__modulosConsolidado' in d) = 0 OR position('v_mod_acc :=' in d) = 0 THEN
    RAISE EXCEPTION 'Falha ao injetar breakdown por modulo';
  END IF;

  EXECUTE d;
END
$do$;