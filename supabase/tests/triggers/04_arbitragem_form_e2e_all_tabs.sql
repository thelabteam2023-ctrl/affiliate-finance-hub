-- 04_arbitragem_form_e2e_all_tabs.sql
-- E2E do formulário de Arbitragem percorrendo TODAS as abas que podem abri-lo.
-- Para cada combinação (aba → estratégia, contexto):
--   1) Cria a operação via RPC `criar_surebet_atomica_v3` (mesmo caminho do form)
--   2) Verifica que o filtro de hidratação da aba enxerga o registro
--   3) Resolve via `reliquidar_aposta_v6` (mesmo caminho do quick-resolve)
--   4) Confere status=LIQUIDADA, paridade pai vs Σ pernas e paridade ledger vs saldo
-- Tudo em transação — `ROLLBACK` no final garante zero resíduo.
--
-- Como rodar:
--   psql -v ws=<workspace_uuid> -v uid=<user_uuid> -v proj=<projeto_uuid> \
--        -v ON_ERROR_STOP=1 -f supabase/tests/triggers/04_arbitragem_form_e2e_all_tabs.sql
--
-- Usa workspace/usuário/projeto REAIS (FKs com auth.users impedem inserir fakes),
-- mas TODA a operação é revertida no ROLLBACK final — zero resíduo no banco.

BEGIN;

-- IDs reais (workspace/user/projeto) injetados via SET LOCAL.
-- O DO $$ ... $$ não interpola :'var' por estar dentro de uma string,
-- por isso usamos GUCs customizadas e current_setting().
SELECT set_config('e2e.ws',   :'ws',   true);
SELECT set_config('e2e.uid',  :'uid',  true);
SELECT set_config('e2e.proj', :'proj', true);

DO $$
DECLARE
  v_ws        UUID := current_setting('e2e.ws')::uuid;
  v_user      UUID := current_setting('e2e.uid')::uuid;
  v_proj      UUID := current_setting('e2e.proj')::uuid;
  v_bk1       UUID := gen_random_uuid();
  v_bk2       UUID := gen_random_uuid();
  v_saldo_ini NUMERIC := 10000;

  v_cfg       JSONB;
  v_tab       TEXT;
  v_estrat    TEXT;
  v_ctx       TEXT;

  v_pernas    JSONB;
  v_entradas  JSONB;
  v_rpc       RECORD;
  v_aposta_id UUID;

  v_hit       INT;
  v_status    TEXT;
  v_pl_pai    NUMERIC;
  v_soma_pn   NUMERIC;

  v_saldo_bk1 NUMERIC;
  v_saldo_bk2 NUMERIC;
  v_saldo_pre_bk1  NUMERIC;
  v_saldo_pre_bk2  NUMERIC;
  v_pl_perna1      NUMERIC;
  v_pl_perna2      NUMERIC;

  v_total     INT := 0;
BEGIN
  -- Setup: usa workspace/usuário/projeto reais, cria APENAS 2 bookmakers de teste
  INSERT INTO bookmakers (id, workspace_id, user_id, nome, moeda, saldo_atual, status, projeto_id,
                          login_username, login_password_encrypted)
    VALUES (v_bk1, v_ws, v_user, 'E2E_BK_BACK', 'BRL', v_saldo_ini, 'ativo', v_proj, 'e2e_bk1', 'x'),
           (v_bk2, v_ws, v_user, 'E2E_BK_LAY',  'BRL', v_saldo_ini, 'ativo', v_proj, 'e2e_bk2', 'x');

  -- Combinações = TODAS as abas que podem abrir o formulário de arbitragem
  FOR v_cfg IN
    SELECT * FROM jsonb_array_elements($json$[
      {"tab":"surebet",    "estrategia":"SUREBET",         "contexto":"NORMAL"},
      {"tab":"bonus",      "estrategia":"EXTRACAO_BONUS",  "contexto":"BONUS"},
      {"tab":"duplogreen", "estrategia":"DUPLO_GREEN",     "contexto":"NORMAL"},
      {"tab":"valuebet",   "estrategia":"VALUEBET",        "contexto":"NORMAL"},
      {"tab":"punter",     "estrategia":"PUNTER",          "contexto":"NORMAL"},
      {"tab":"apostas",    "estrategia":"SUREBET",         "contexto":"NORMAL"}
    ]$json$::jsonb)
  LOOP
    v_tab    := v_cfg->>'tab';
    v_estrat := v_cfg->>'estrategia';
    v_ctx    := v_cfg->>'contexto';

    -- 2 pernas BACK+LAY, BRL, fonte REAL
    v_pernas := jsonb_build_array(
      jsonb_build_object('ordem',1,'casa_id',v_bk1,'selecao','Time A','tipo','back'),
      jsonb_build_object('ordem',2,'casa_id',v_bk2,'selecao','Time B','tipo','lay')
    );
    v_entradas := jsonb_build_array(
      jsonb_build_object('perna_ordem',1,'bookmaker_id',v_bk1,'stake',100,'odd',2.10,
                        'moeda','BRL','fonte_saldo','REAL','cotacao_snapshot',1,'stake_brl_referencia',100,'tipo','back'),
      jsonb_build_object('perna_ordem',2,'bookmaker_id',v_bk2,'stake', 95,'odd',2.20,
                        'moeda','BRL','fonte_saldo','REAL','cotacao_snapshot',1,'stake_brl_referencia', 95,'tipo','lay')
    );

    -- Snapshot dos saldos ANTES da operação
    SELECT saldo_atual INTO v_saldo_pre_bk1 FROM bookmakers WHERE id = v_bk1;
    SELECT saldo_atual INTO v_saldo_pre_bk2 FROM bookmakers WHERE id = v_bk2;

    -- 1) CRIAÇÃO (mesma RPC chamada pelo SurebetModalRoot)
    SELECT * INTO v_rpc FROM public.criar_surebet_atomica_v3(
      p_workspace_id := v_ws,
      p_user_id      := v_user,
      p_projeto_id   := v_proj,
      p_evento       := 'EVT_' || v_tab,
      p_esporte      := 'Futebol',
      p_mercado      := 'h2h',
      p_modelo       := 'BACK_LAY',
      p_estrategia   := v_estrat,
      p_contexto_operacional := v_ctx,
      p_data_aposta  := NOW()::text,
      p_pernas       := v_pernas,
      p_entradas     := v_entradas
    );
    IF NOT v_rpc.success THEN
      RAISE EXCEPTION '[%] CREATE falhou: %', v_tab, v_rpc.message;
    END IF;
    v_aposta_id := v_rpc.o_aposta_id;

    -- 2) HIDRATAÇÃO: filtro espelhando o fetch da aba
    IF v_tab = 'bonus' THEN
      SELECT COUNT(*) INTO v_hit FROM apostas_unificada
        WHERE id = v_aposta_id AND forma_registro IN ('ARBITRAGEM','SUREBET')
          AND (estrategia = 'EXTRACAO_BONUS' OR contexto_operacional = 'BONUS');
    ELSE
      SELECT COUNT(*) INTO v_hit FROM apostas_unificada
        WHERE id = v_aposta_id AND forma_registro = 'ARBITRAGEM' AND estrategia = v_estrat;
    END IF;
    IF v_hit <> 1 THEN
      RAISE EXCEPTION '[%] HIDRATAÇÃO falhou: filtro da aba não enxergou a operação', v_tab;
    END IF;

    -- Saldo deve ter sido debitado das duas casas (stake_real)
    SELECT saldo_atual INTO v_saldo_bk1 FROM bookmakers WHERE id = v_bk1;
    SELECT saldo_atual INTO v_saldo_bk2 FROM bookmakers WHERE id = v_bk2;
    IF v_saldo_bk1 >= v_saldo_pre_bk1 OR v_saldo_bk2 >= v_saldo_pre_bk2 THEN
      RAISE EXCEPTION '[%] DÉBITO falhou: saldo não diminuiu (bk1: %→%, bk2: %→%)',
        v_tab, v_saldo_pre_bk1, v_saldo_bk1, v_saldo_pre_bk2, v_saldo_bk2;
    END IF;

    -- 3) RESOLUÇÃO (quick-resolve: BACK RED + LAY GREEN ⇒ lucro = -100 + 95 = -5)
    --    Usa a MESMA RPC chamada pelo botão de quick-resolve no front:
    --    `liquidar_perna_surebet_v1` (orquestrador por perna)
    DECLARE
      v_p1 UUID; v_p2 UUID;
    BEGIN
      SELECT id INTO v_p1 FROM apostas_pernas WHERE aposta_id=v_aposta_id AND ordem=1;
      SELECT id INTO v_p2 FROM apostas_pernas WHERE aposta_id=v_aposta_id AND ordem=2;
      PERFORM public.liquidar_perna_surebet_v1(v_p1, 'RED',   v_ws);
      PERFORM public.liquidar_perna_surebet_v1(v_p2, 'GREEN', v_ws);
    END;

    -- 4) ASSERTS finais
    SELECT status, COALESCE(pl_consolidado, lucro_prejuizo, 0)
      INTO v_status, v_pl_pai FROM apostas_unificada WHERE id = v_aposta_id;
    SELECT COALESCE(SUM(lucro_prejuizo),0) INTO v_soma_pn
      FROM apostas_pernas WHERE aposta_id = v_aposta_id;

    IF v_status <> 'LIQUIDADA' THEN
      RAISE EXCEPTION '[%] STATUS esperado LIQUIDADA, obtido %', v_tab, v_status;
    END IF;
    IF ROUND(v_pl_pai,2) <> ROUND(v_soma_pn,2) THEN
      RAISE EXCEPTION '[%] PARIDADE PAI/PERNAS falhou: pai=% Σ=%', v_tab, v_pl_pai, v_soma_pn;
    END IF;

    -- Paridade de saldo final por bookmaker:
    --   saldo_after == saldo_before + lucro_prejuizo_da_perna_dessa_casa
    -- (cobre: stake debitado na criação + payout creditado na liquidação)
    SELECT saldo_atual INTO v_saldo_bk1 FROM bookmakers WHERE id = v_bk1;
    SELECT saldo_atual INTO v_saldo_bk2 FROM bookmakers WHERE id = v_bk2;
    SELECT lucro_prejuizo INTO v_pl_perna1 FROM apostas_pernas WHERE aposta_id=v_aposta_id AND ordem=1;
    SELECT lucro_prejuizo INTO v_pl_perna2 FROM apostas_pernas WHERE aposta_id=v_aposta_id AND ordem=2;

    IF ROUND(v_saldo_bk1,2) <> ROUND(v_saldo_pre_bk1 + COALESCE(v_pl_perna1,0),2) THEN
      RAISE EXCEPTION '[%] PARIDADE SALDO bk1 falhou: pre=% após=% Δesperado=%',
        v_tab, v_saldo_pre_bk1, v_saldo_bk1, v_pl_perna1;
    END IF;
    IF ROUND(v_saldo_bk2,2) <> ROUND(v_saldo_pre_bk2 + COALESCE(v_pl_perna2,0),2) THEN
      RAISE EXCEPTION '[%] PARIDADE SALDO bk2 falhou: pre=% após=% Δesperado=%',
        v_tab, v_saldo_pre_bk2, v_saldo_bk2, v_pl_perna2;
    END IF;

    RAISE NOTICE '✓ [%] OK — status=% pl_pai=% Σpernas=% bk1(% → %, Δ=%) bk2(% → %, Δ=%)',
      v_tab, v_status, v_pl_pai, v_soma_pn,
      v_saldo_pre_bk1, v_saldo_bk1, v_pl_perna1,
      v_saldo_pre_bk2, v_saldo_bk2, v_pl_perna2;

    v_total := v_total + 1;
  END LOOP;

  RAISE NOTICE '✅ 04_arbitragem_form_e2e_all_tabs: % abas validadas com sucesso', v_total;
END $$;

ROLLBACK;