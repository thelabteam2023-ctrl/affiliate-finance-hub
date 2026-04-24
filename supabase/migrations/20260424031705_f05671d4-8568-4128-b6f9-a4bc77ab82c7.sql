-- ============================================================
-- RESET TOTAL — PROJETO 00 (LABBET ONE)
-- ID: 80d16390-22a0-4995-843a-3b076d33d8fe
-- Autorizado pelo usuário como simulação (exceção pontual)
-- ============================================================

DO $$
DECLARE
  v_pid uuid := '80d16390-22a0-4995-843a-3b076d33d8fe';
  v_casas uuid[];
BEGIN
  -- Snapshot das casas vinculadas (precisamos antes de zerar o vínculo)
  SELECT array_agg(id) INTO v_casas FROM bookmakers WHERE projeto_id = v_pid;

  -- Desabilita triggers de sync de saldo durante a limpeza (saldos serão controlados manualmente)
  SET session_replication_role = replica;

  -- 1. Pernas de aposta
  DELETE FROM apostas_pernas
   WHERE aposta_id IN (SELECT id FROM apostas_unificada WHERE projeto_id = v_pid);

  -- 2. Apostas (cobre simples, múltiplas, surebets, valuebet, bônus, duplogreen, punter — todas em apostas_unificada)
  DELETE FROM apostas_unificada WHERE projeto_id = v_pid;

  -- 3. Bônus
  DELETE FROM project_bookmaker_link_bonuses WHERE project_id = v_pid;

  -- 4. Cashback manual
  DELETE FROM cashback_manual WHERE projeto_id = v_pid;

  -- 5. Giros grátis (projeto + disponíveis das casas)
  DELETE FROM giros_gratis WHERE projeto_id = v_pid;
  DELETE FROM giros_gratis_disponiveis WHERE bookmaker_id = ANY(v_casas);

  -- 6. Freebets (recebidas pelo projeto + recebidas pelas casas)
  DELETE FROM freebets_recebidas WHERE projeto_id = v_pid;
  DELETE FROM freebets_recebidas WHERE bookmaker_id = ANY(v_casas);

  -- 7. Financial events das casas (TUDO — incluindo freebet) — antes do ledger por causa de FKs
  DELETE FROM financial_events WHERE bookmaker_id = ANY(v_casas);

  -- 8. Cash ledger do projeto + eventos das casas (cobre baselines, depósitos, saques virtuais, FX, bônus, etc.)
  DELETE FROM cash_ledger WHERE projeto_id_snapshot = v_pid;
  DELETE FROM cash_ledger
   WHERE origem_bookmaker_id = ANY(v_casas)
      OR destino_bookmaker_id = ANY(v_casas);

  -- 9. Reservas de stake e audit trail das casas
  DELETE FROM bookmaker_stake_reservations WHERE bookmaker_id = ANY(v_casas);
  DELETE FROM bookmaker_balance_audit WHERE bookmaker_id = ANY(v_casas);

  -- 10. Zerar saldo_freebet e desvincular as casas (saldo_atual REAL preservado)
  UPDATE bookmakers
     SET saldo_freebet = 0,
         saldo_bonus = 0,
         projeto_id = NULL,
         updated_at = now()
   WHERE id = ANY(v_casas);

  -- 11. Limpar marco zero do projeto (se a coluna existir)
  UPDATE projetos
     SET updated_at = now()
   WHERE id = v_pid;

  -- Reabilita triggers
  SET session_replication_role = DEFAULT;

  RAISE NOTICE 'Reset concluído. Casas desvinculadas: %', array_length(v_casas, 1);
END $$;