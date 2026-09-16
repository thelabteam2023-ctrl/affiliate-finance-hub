-- Teste rollback-only: edição de surebet PENDENTE com múltiplas entradas.
-- Cenários A–H do incidente "SALDO_INSUFICIENTE ao editar aposta em aberto".
-- Não altera dados reais: tudo é criado dentro da transação e revertido no final.
--
-- Uso: psql -f supabase/tests/triggers/10_edit_surebet_multi_entradas.sql
--      (o bloco termina com RAISE EXCEPTION 'TEST_RESULT: ...' para garantir rollback)

DO $$
DECLARE
  v_ws uuid; v_user uuid; v_proj uuid;
  bk1 uuid; bk2 uuid; bk3 uuid;
  ap uuid; p1 uuid; p2 uuid;
  ent1 uuid; ent2 uuid;
  r jsonb;
  log text := '';

  saldo1 numeric; saldo2 numeric; saldo3 numeric;
BEGIN
  SELECT p.workspace_id, p.id, p.user_id INTO v_ws, v_proj, v_user
  FROM projetos p LIMIT 1;

  INSERT INTO bookmakers (user_id, workspace_id, nome, login_username, login_password_encrypted, moeda, saldo_atual)
  VALUES (v_user, v_ws, 'TESTE CASA 1', 'u1', 'x', 'BRL', 1500) RETURNING id INTO bk1;
  INSERT INTO bookmakers (user_id, workspace_id, nome, login_username, login_password_encrypted, moeda, saldo_atual)
  VALUES (v_user, v_ws, 'TESTE CASA 2', 'u2', 'x', 'BRL', 1500) RETURNING id INTO bk2;
  INSERT INTO bookmakers (user_id, workspace_id, nome, login_username, login_password_encrypted, moeda, saldo_atual)
  VALUES (v_user, v_ws, 'TESTE CASA 3', 'u3', 'x', 'BRL', 1500) RETURNING id INTO bk3;

  PERFORM set_config('app.skip_perna_auto_stake', 'on', true);

  INSERT INTO apostas_unificada (user_id, projeto_id, workspace_id, modelo, status, evento, estrategia, stake_total)
  VALUES (v_user, v_proj, v_ws, 'SUREBET', 'PENDENTE', 'Teste A x B', 'SUREBET', 1400)
  RETURNING id INTO ap;

  INSERT INTO apostas_pernas (aposta_id, bookmaker_id, ordem, selecao, odd, stake, moeda, fonte_saldo, stake_real)
  VALUES (ap, bk1, 1, 'Sim', 2.0, 1000, 'BRL', 'REAL', 1000) RETURNING id INTO p1;
  INSERT INTO apostas_pernas (aposta_id, bookmaker_id, ordem, selecao, odd, stake, moeda, fonte_saldo, stake_real)
  VALUES (ap, bk2, 2, 'Não', 2.2, 400, 'BRL', 'REAL', 400) RETURNING id INTO p2;

  INSERT INTO apostas_perna_entradas (perna_id, bookmaker_id, odd, stake, moeda, fonte_saldo, stake_real)
  VALUES (p1, bk1, 2.0, 1000, 'BRL', 'REAL', 1000) RETURNING id INTO ent1;
  INSERT INTO apostas_perna_entradas (perna_id, bookmaker_id, odd, stake, moeda, fonte_saldo, stake_real)
  VALUES (p2, bk2, 2.2, 400, 'BRL', 'REAL', 400) RETURNING id INTO ent2;

  INSERT INTO financial_events (bookmaker_id, aposta_id, workspace_id, created_by, tipo_evento, tipo_uso, origem, valor, moeda, idempotency_key, processed_at)
  VALUES (bk1, ap, v_ws, v_user, 'STAKE', 'NORMAL', 'APOSTA', -1000, 'BRL', 'seed_' || p1, now()),
         (bk2, ap, v_ws, v_user, 'STAKE', 'NORMAL', 'APOSTA', -400, 'BRL', 'seed_' || p2, now());

  SELECT saldo_atual INTO saldo1 FROM bookmakers WHERE id = bk1;
  log := log || format('SEED bk1=%s (esperado 500); ', saldo1);

  -- A) Salvar sem mudanças: saldo não pode se mover
  r := editar_surebet_completa_v1(ap,
    jsonb_build_array(
      jsonb_build_object('id', p1, 'bookmaker_id', bk1, 'odd', 2.0, 'stake', 1000, 'moeda', 'BRL', 'selecao', 'Sim', 'fonte_saldo', 'REAL'),
      jsonb_build_object('id', p2, 'bookmaker_id', bk2, 'odd', 2.2, 'stake', 400, 'moeda', 'BRL', 'selecao', 'Não', 'fonte_saldo', 'REAL')
    ), null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
  SELECT saldo_atual INTO saldo1 FROM bookmakers WHERE id = bk1;
  log := log || format('A ok=%s saldo1=%s (esperado 500); ', r->>'success', saldo1);

  -- B) Adicionar sub-entrada de 300 na perna 1 (casa 3)
  r := editar_surebet_completa_v1(ap,
    jsonb_build_array(
      jsonb_build_object('id', p1, 'bookmaker_id', bk1, 'odd', 2.0, 'stake', 1300, 'moeda', 'BRL', 'selecao', 'Sim', 'fonte_saldo', 'REAL',
        'entradas', jsonb_build_array(
          jsonb_build_object('id', ent1, 'bookmaker_id', bk1, 'odd', 2.0, 'stake', 1000, 'moeda', 'BRL', 'fonte_saldo', 'REAL'),
          jsonb_build_object('bookmaker_id', bk3, 'odd', 2.1, 'stake', 300, 'moeda', 'BRL', 'fonte_saldo', 'REAL')
        )),
      jsonb_build_object('id', p2, 'bookmaker_id', bk2, 'odd', 2.2, 'stake', 400, 'moeda', 'BRL', 'selecao', 'Não', 'fonte_saldo', 'REAL')
    ), null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
  SELECT saldo_atual INTO saldo1 FROM bookmakers WHERE id = bk1;
  SELECT saldo_atual INTO saldo3 FROM bookmakers WHERE id = bk3;
  log := log || format('B ok=%s saldo1=%s (500) saldo3=%s (1200); ', r->>'success', saldo1, saldo3);

  -- C) Reduzir a sub-entrada de 300 para 100
  r := editar_surebet_completa_v1(ap,
    jsonb_build_array(
      jsonb_build_object('id', p1, 'bookmaker_id', bk1, 'odd', 2.0, 'stake', 1100, 'moeda', 'BRL', 'selecao', 'Sim', 'fonte_saldo', 'REAL',
        'entradas', jsonb_build_array(
          jsonb_build_object('id', ent1, 'bookmaker_id', bk1, 'odd', 2.0, 'stake', 1000, 'moeda', 'BRL', 'fonte_saldo', 'REAL'),
          jsonb_build_object('bookmaker_id', bk3, 'odd', 2.1, 'stake', 100, 'moeda', 'BRL', 'fonte_saldo', 'REAL')
        )),
      jsonb_build_object('id', p2, 'bookmaker_id', bk2, 'odd', 2.2, 'stake', 400, 'moeda', 'BRL', 'selecao', 'Não', 'fonte_saldo', 'REAL')
    ), null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
  SELECT saldo_atual INTO saldo3 FROM bookmakers WHERE id = bk3;
  log := log || format('C ok=%s saldo3=%s (1400); ', r->>'success', saldo3);

  -- D) Aumentar a entrada principal de 1000 para 1200 (delta 200)
  r := editar_surebet_completa_v1(ap,
    jsonb_build_array(
      jsonb_build_object('id', p1, 'bookmaker_id', bk1, 'odd', 2.0, 'stake', 1300, 'moeda', 'BRL', 'selecao', 'Sim', 'fonte_saldo', 'REAL',
        'entradas', jsonb_build_array(
          jsonb_build_object('id', ent1, 'bookmaker_id', bk1, 'odd', 2.0, 'stake', 1200, 'moeda', 'BRL', 'fonte_saldo', 'REAL'),
          jsonb_build_object('bookmaker_id', bk3, 'odd', 2.1, 'stake', 100, 'moeda', 'BRL', 'fonte_saldo', 'REAL')
        )),
      jsonb_build_object('id', p2, 'bookmaker_id', bk2, 'odd', 2.2, 'stake', 400, 'moeda', 'BRL', 'selecao', 'Não', 'fonte_saldo', 'REAL')
    ), null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
  SELECT saldo_atual INTO saldo1 FROM bookmakers WHERE id = bk1;
  log := log || format('D ok=%s saldo1=%s (300); ', r->>'success', saldo1);

  -- E) Aumento acima do saldo: deve ser recusado com SALDO_INSUFICIENTE
  r := editar_surebet_completa_v1(ap,
    jsonb_build_array(
      jsonb_build_object('id', p1, 'bookmaker_id', bk1, 'odd', 2.0, 'stake', 99999, 'moeda', 'BRL', 'selecao', 'Sim', 'fonte_saldo', 'REAL'),
      jsonb_build_object('id', p2, 'bookmaker_id', bk2, 'odd', 2.2, 'stake', 400, 'moeda', 'BRL', 'selecao', 'Não', 'fonte_saldo', 'REAL')
    ), null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
  SELECT saldo_atual INTO saldo1 FROM bookmakers WHERE id = bk1;
  log := log || format('E ok=%s err=%s saldo1=%s (300); ', r->>'success', left(coalesce(r->>'error',''), 40), saldo1);

  -- F) Remover a sub-entrada (volta a uma entrada só)
  r := editar_surebet_completa_v1(ap,
    jsonb_build_array(
      jsonb_build_object('id', p1, 'bookmaker_id', bk1, 'odd', 2.0, 'stake', 1200, 'moeda', 'BRL', 'selecao', 'Sim', 'fonte_saldo', 'REAL'),
      jsonb_build_object('id', p2, 'bookmaker_id', bk2, 'odd', 2.2, 'stake', 400, 'moeda', 'BRL', 'selecao', 'Não', 'fonte_saldo', 'REAL')
    ), null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
  SELECT saldo_atual INTO saldo3 FROM bookmakers WHERE id = bk3;
  SELECT saldo_atual INTO saldo1 FROM bookmakers WHERE id = bk1;
  log := log || format('F ok=%s saldo3=%s (1500) saldo1=%s (300); ', r->>'success', saldo3, saldo1);

  -- G) Trocar a casa da perna 2 (bk2 -> bk3)
  r := editar_surebet_completa_v1(ap,
    jsonb_build_array(
      jsonb_build_object('id', p1, 'bookmaker_id', bk1, 'odd', 2.0, 'stake', 1200, 'moeda', 'BRL', 'selecao', 'Sim', 'fonte_saldo', 'REAL'),
      jsonb_build_object('id', p2, 'bookmaker_id', bk3, 'odd', 2.2, 'stake', 400, 'moeda', 'BRL', 'selecao', 'Não', 'fonte_saldo', 'REAL')
    ), null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
  SELECT saldo_atual INTO saldo2 FROM bookmakers WHERE id = bk2;
  SELECT saldo_atual INTO saldo3 FROM bookmakers WHERE id = bk3;
  log := log || format('G ok=%s saldo2=%s (1500) saldo3=%s (1100); ', r->>'success', saldo2, saldo3);

  -- H) Nova sub-entrada na segunda perna
  r := editar_surebet_completa_v1(ap,
    jsonb_build_array(
      jsonb_build_object('id', p1, 'bookmaker_id', bk1, 'odd', 2.0, 'stake', 1200, 'moeda', 'BRL', 'selecao', 'Sim', 'fonte_saldo', 'REAL'),
      jsonb_build_object('id', p2, 'bookmaker_id', bk3, 'odd', 2.2, 'stake', 600, 'moeda', 'BRL', 'selecao', 'Não', 'fonte_saldo', 'REAL',
        'entradas', jsonb_build_array(
          jsonb_build_object('bookmaker_id', bk3, 'odd', 2.2, 'stake', 400, 'moeda', 'BRL', 'fonte_saldo', 'REAL'),
          jsonb_build_object('bookmaker_id', bk2, 'odd', 2.3, 'stake', 200, 'moeda', 'BRL', 'fonte_saldo', 'REAL')
        ))
    ), null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
  SELECT saldo_atual INTO saldo2 FROM bookmakers WHERE id = bk2;
  SELECT saldo_atual INTO saldo3 FROM bookmakers WHERE id = bk3;
  log := log || format('H ok=%s saldo2=%s (1300) saldo3=%s (1100); ', r->>'success', saldo2, saldo3);

  RAISE EXCEPTION 'TEST_RESULT: %', log;
END $$;
