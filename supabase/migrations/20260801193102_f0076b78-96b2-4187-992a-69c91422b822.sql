-- 1) Função canônica de impacto de reversão (ativos afetados + saldo pós-reversão + descendentes)
CREATE OR REPLACE FUNCTION public.fn_ledger_reversal_impact(p_transacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx record;
  v_assets jsonb := '[]'::jsonb;
  v_deps jsonb := '[]'::jsonb;
  v_deps_count int := 0;
  v_blocking int := 0;
  v_saldo numeric;
  v_pos numeric;
  v_cnt int;
  v_tol constant numeric := 0.01;
BEGIN
  SELECT * INTO v_tx FROM public.cash_ledger WHERE id = p_transacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- ============ ATIVO: WALLET DE DESTINO (será debitada pelo espelho) ============
  IF v_tx.destino_wallet_id IS NOT NULL THEN
    SELECT COALESCE(SUM(
      CASE WHEN cl.destino_wallet_id = v_tx.destino_wallet_id THEN cl.qtd_coin
           WHEN cl.origem_wallet_id  = v_tx.destino_wallet_id THEN -cl.qtd_coin
           ELSE 0 END), 0)
    INTO v_saldo
    FROM public.cash_ledger cl
    WHERE cl.transit_status = 'CONFIRMED'
      AND cl.coin IS NOT DISTINCT FROM v_tx.coin
      AND (cl.destino_wallet_id = v_tx.destino_wallet_id OR cl.origem_wallet_id = v_tx.destino_wallet_id);

    v_pos := v_saldo - COALESCE(v_tx.qtd_coin, 0);

    v_assets := v_assets || jsonb_build_object(
      'tipo', 'WALLET', 'id', v_tx.destino_wallet_id, 'moeda', COALESCE(v_tx.coin, v_tx.moeda),
      'nome', (SELECT COALESCE(w.label, w.exchange, 'Carteira') FROM public.wallets_crypto w WHERE w.id = v_tx.destino_wallet_id),
      'saldo_atual', v_saldo, 'saldo_pos_reversao', v_pos, 'negativo', (v_pos < -v_tol)
    );
    IF v_pos < -v_tol THEN v_blocking := v_blocking + 1; END IF;

    -- saídas posteriores dessa wallet
    SELECT COUNT(*), COALESCE(jsonb_agg(jsonb_build_object(
             'id', cl.id, 'data', cl.created_at, 'tipo', cl.tipo_transacao,
             'valor', COALESCE(cl.qtd_coin, cl.valor), 'moeda', COALESCE(cl.coin, cl.moeda),
             'descricao', LEFT(COALESCE(cl.descricao, ''), 60)) ORDER BY cl.created_at), '[]'::jsonb)
    INTO v_cnt, v_deps
    FROM public.cash_ledger cl
    WHERE cl.id <> p_transacao_id
      AND cl.reversed_at IS NULL
      AND COALESCE(cl.descricao, '') NOT LIKE 'ESTORNO:%'
      AND cl.created_at > v_tx.created_at
      AND cl.origem_wallet_id = v_tx.destino_wallet_id;
    v_deps_count := v_deps_count + COALESCE(v_cnt, 0);
  END IF;

  -- ============ ATIVO: CONTA BANCÁRIA DE DESTINO ============
  IF v_tx.destino_conta_bancaria_id IS NOT NULL THEN
    SELECT COALESCE(saldo_total, 0) INTO v_saldo
    FROM public.v_saldo_contas_bancarias WHERE conta_id = v_tx.destino_conta_bancaria_id;

    v_pos := COALESCE(v_saldo, 0) - COALESCE(v_tx.valor, 0);

    v_assets := v_assets || jsonb_build_object(
      'tipo', 'CONTA_BANCARIA', 'id', v_tx.destino_conta_bancaria_id, 'moeda', v_tx.moeda,
      'nome', (SELECT banco FROM public.v_saldo_contas_bancarias WHERE conta_id = v_tx.destino_conta_bancaria_id),
      'saldo_atual', COALESCE(v_saldo, 0), 'saldo_pos_reversao', v_pos, 'negativo', (v_pos < -v_tol)
    );
    IF v_pos < -v_tol THEN v_blocking := v_blocking + 1; END IF;

    SELECT COUNT(*) INTO v_cnt
    FROM public.cash_ledger cl
    WHERE cl.id <> p_transacao_id
      AND cl.reversed_at IS NULL
      AND COALESCE(cl.descricao, '') NOT LIKE 'ESTORNO:%'
      AND cl.created_at > v_tx.created_at
      AND cl.origem_conta_bancaria_id = v_tx.destino_conta_bancaria_id;
    v_deps_count := v_deps_count + COALESCE(v_cnt, 0);
  END IF;

  -- ============ ATIVO: BOOKMAKER DE DESTINO ============
  IF v_tx.destino_bookmaker_id IS NOT NULL THEN
    SELECT COALESCE(saldo_atual, 0) INTO v_saldo FROM public.bookmakers WHERE id = v_tx.destino_bookmaker_id;
    v_pos := COALESCE(v_saldo, 0) - COALESCE(v_tx.valor, 0);

    v_assets := v_assets || jsonb_build_object(
      'tipo', 'BOOKMAKER', 'id', v_tx.destino_bookmaker_id, 'moeda', v_tx.moeda,
      'nome', (SELECT nome FROM public.bookmakers WHERE id = v_tx.destino_bookmaker_id),
      'saldo_atual', COALESCE(v_saldo, 0), 'saldo_pos_reversao', v_pos, 'negativo', (v_pos < -v_tol)
    );
    IF v_pos < -v_tol THEN v_blocking := v_blocking + 1; END IF;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'transacao_id', p_transacao_id,
    'tipo_transacao', v_tx.tipo_transacao,
    'ativos_afetados', v_assets,
    'ativos_negativos', v_blocking,
    'descendentes_count', v_deps_count,
    'descendentes', v_deps
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_ledger_reversal_impact(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_ledger_reversal_impact(uuid) TO authenticated, service_role;

-- 2) Painel de dependências: passa a enxergar wallets e contas bancárias
DROP FUNCTION IF EXISTS public.get_movimentacao_dependencies(uuid);
CREATE OR REPLACE FUNCTION public.get_movimentacao_dependencies(p_transacao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx record;
  v_bookmaker_id uuid;
  v_apostas_count int := 0;
  v_apostas_detalhes jsonb := '[]'::jsonb;
  v_movs_count int := 0;
  v_movs_detalhes jsonb := '[]'::jsonb;
  v_impact jsonb;
BEGIN
  SELECT * INTO v_tx FROM public.cash_ledger WHERE id = p_transacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  v_impact := public.fn_ledger_reversal_impact(p_transacao_id);
  v_bookmaker_id := COALESCE(v_tx.destino_bookmaker_id, v_tx.origem_bookmaker_id);

  IF v_bookmaker_id IS NOT NULL THEN
    SELECT COUNT(*),
      COALESCE(jsonb_agg(jsonb_build_object(
        'id', id, 'data', created_at, 'estrategia', estrategia, 'evento', evento,
        'stake', COALESCE(stake_total, stake_real, stake, 0),
        'moeda', COALESCE(moeda_operacao, 'BRL'), 'status', status, 'resultado', resultado
      ) ORDER BY created_at), '[]'::jsonb)
    INTO v_apostas_count, v_apostas_detalhes
    FROM public.apostas_unificada
    WHERE bookmaker_id = v_bookmaker_id
      AND created_at > v_tx.created_at
      AND status NOT IN ('CANCELADA');
  END IF;

  SELECT COUNT(*),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', cl.id, 'data', cl.created_at, 'tipo', cl.tipo_transacao,
      'valor', COALESCE(cl.qtd_coin, cl.valor), 'moeda', COALESCE(cl.coin, cl.moeda),
      'descricao', LEFT(COALESCE(cl.descricao, ''), 60)
    ) ORDER BY cl.created_at), '[]'::jsonb)
  INTO v_movs_count, v_movs_detalhes
  FROM public.cash_ledger cl
  WHERE cl.id <> p_transacao_id
    AND cl.reversed_at IS NULL
    AND COALESCE(cl.descricao, '') NOT LIKE 'ESTORNO:%'
    AND cl.created_at > v_tx.created_at
    AND (
      (v_bookmaker_id IS NOT NULL AND (cl.origem_bookmaker_id = v_bookmaker_id OR cl.destino_bookmaker_id = v_bookmaker_id))
      OR (v_tx.destino_wallet_id IS NOT NULL AND cl.origem_wallet_id = v_tx.destino_wallet_id)
      OR (v_tx.destino_conta_bancaria_id IS NOT NULL AND cl.origem_conta_bancaria_id = v_tx.destino_conta_bancaria_id)
    );

  RETURN jsonb_build_object(
    'found', true,
    'bookmaker_afetado', v_bookmaker_id,
    'tipo_origem', v_tx.tipo_transacao,
    'data_origem', v_tx.created_at,
    'total_dependencias', v_apostas_count + v_movs_count,
    'apostas_count', v_apostas_count,
    'movimentacoes_count', v_movs_count,
    'apostas', v_apostas_detalhes,
    'movimentacoes', v_movs_detalhes,
    'impacto', v_impact
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_movimentacao_dependencies(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_movimentacao_dependencies(uuid) TO authenticated, service_role;