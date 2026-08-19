DROP FUNCTION IF EXISTS public.fn_registrar_swap_crypto(uuid, uuid, uuid, text, numeric, uuid, text, numeric, numeric, numeric, jsonb);

CREATE FUNCTION public.fn_registrar_swap_crypto(
  p_workspace_id uuid,
  p_parceiro_id uuid,
  p_wallet_origem_id uuid,
  p_coin_origem text,
  p_qtd_origem numeric,
  p_wallet_destino_id uuid,
  p_coin_destino text,
  p_qtd_destino numeric,
  p_preco_origem numeric,
  p_preco_destino numeric,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_op uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_usd_out numeric;
  v_usd_in numeric;
  v_spread numeric;
  v_spread_pct numeric;
  v_saldo numeric;
  v_out_id uuid;
  v_in_id uuid;
  v_desc text;
  v_meta jsonb;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado');
  END IF;

  IF p_workspace_id IS NULL OR p_parceiro_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'code', 'WORKSPACE_AUSENTE',
      'message', 'Workspace ou parceiro do caixa não informado');
  END IF;

  -- O usuário precisa pertencer ao workspace informado (função é SECURITY DEFINER)
  IF NOT public.is_workspace_member(p_workspace_id, v_user) THEN
    RETURN jsonb_build_object('success', false, 'code', 'WORKSPACE_NAO_AUTORIZADO',
      'message', 'Usuário não pertence ao workspace informado');
  END IF;

  IF p_qtd_origem IS NULL OR p_qtd_origem <= 0 OR p_qtd_destino IS NULL OR p_qtd_destino <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quantidades devem ser maiores que zero');
  END IF;

  IF upper(p_coin_origem) = upper(p_coin_destino) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Moeda de origem e destino devem ser diferentes');
  END IF;

  -- Wallets pertencem ao parceiro, e o parceiro pertence ao workspace
  IF NOT EXISTS (
    SELECT 1
    FROM public.wallets_crypto w
    JOIN public.parceiros p ON p.id = w.parceiro_id
    WHERE w.id = p_wallet_origem_id
      AND w.parceiro_id = p_parceiro_id
      AND p.workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Wallet de origem inválida para este parceiro/workspace');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.wallets_crypto w
    JOIN public.parceiros p ON p.id = w.parceiro_id
    WHERE w.id = p_wallet_destino_id
      AND w.parceiro_id = p_parceiro_id
      AND p.workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Wallet de destino inválida para este parceiro/workspace');
  END IF;

  -- Saldo suficiente na coin de origem (revalidação server-side)
  SELECT COALESCE(SUM(v.saldo_coin), 0) INTO v_saldo
  FROM public.v_saldo_parceiro_wallets v
  WHERE v.wallet_id = p_wallet_origem_id AND v.coin = upper(p_coin_origem);

  IF p_qtd_origem > v_saldo + 0.00000001 THEN
    RETURN jsonb_build_object(
      'success', false,
      'code', 'SALDO_INSUFICIENTE',
      'message', format('Saldo insuficiente: disponível %s %s, solicitado %s %s',
                        round(v_saldo, 8), upper(p_coin_origem), round(p_qtd_origem, 8), upper(p_coin_origem))
    );
  END IF;

  v_usd_out := p_qtd_origem * COALESCE(NULLIF(p_preco_origem, 0), 1);
  v_usd_in  := p_qtd_destino * COALESCE(NULLIF(p_preco_destino, 0), 1);
  v_spread  := v_usd_in - v_usd_out;
  v_spread_pct := CASE WHEN v_usd_out > 0 THEN (v_spread / v_usd_out) * 100 ELSE 0 END;
  v_desc := format('Swap %s → %s', upper(p_coin_origem), upper(p_coin_destino));

  v_meta := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'usd_origem', round(v_usd_out, 2),
    'usd_destino', round(v_usd_in, 2),
    'spread_usd', round(v_spread, 2),
    'spread_pct', round(v_spread_pct, 4),
    'preco_origem', p_preco_origem,
    'preco_destino', p_preco_destino
  );

  -- Perna 1: SWAP_OUT (valor_usd = valor econômico debitado)
  INSERT INTO public.cash_ledger (
    user_id, workspace_id, tipo_transacao, tipo_moeda, moeda, valor,
    coin, qtd_coin, valor_usd, valor_usd_referencia, cotacao, cotacao_origem_usd,
    cotacao_snapshot_at, data_transacao, status, transit_status,
    impacta_caixa_operacional, descricao,
    origem_wallet_id, origem_tipo, origem_parceiro_id,
    moeda_origem, valor_origem, moeda_destino, valor_destino, cotacao_implicita,
    swap_operation_id, auditoria_metadata
  ) VALUES (
    v_user, p_workspace_id, 'SWAP_OUT', 'CRYPTO', 'USD', v_usd_out,
    upper(p_coin_origem), p_qtd_origem, v_usd_out, v_usd_out, p_preco_origem, p_preco_origem,
    v_now, v_now, 'CONFIRMADO', 'CONFIRMED',
    true, v_desc,
    p_wallet_origem_id, 'PARCEIRO_WALLET', p_parceiro_id,
    upper(p_coin_origem), p_qtd_origem, upper(p_coin_destino), p_qtd_destino,
    p_qtd_destino / p_qtd_origem,
    v_op, v_meta || jsonb_build_object('swap_leg', 'OUT')
  ) RETURNING id INTO v_out_id;

  -- Perna 2: SWAP_IN (valor_usd = valor econômico creditado; referência mantém a base da origem)
  INSERT INTO public.cash_ledger (
    user_id, workspace_id, tipo_transacao, tipo_moeda, moeda, valor,
    coin, qtd_coin, valor_usd, valor_usd_referencia, cotacao, cotacao_destino_usd,
    cotacao_snapshot_at, data_transacao, status, transit_status,
    impacta_caixa_operacional, descricao,
    destino_wallet_id, destino_tipo, destino_parceiro_id,
    referencia_transacao_id,
    moeda_origem, valor_origem, moeda_destino, valor_destino, cotacao_implicita,
    swap_operation_id, auditoria_metadata
  ) VALUES (
    v_user, p_workspace_id, 'SWAP_IN', 'CRYPTO', 'USD', v_usd_in,
    upper(p_coin_destino), p_qtd_destino, v_usd_in, v_usd_out, p_preco_destino, p_preco_destino,
    v_now, v_now, 'CONFIRMADO', 'CONFIRMED',
    true, v_desc,
    p_wallet_destino_id, 'PARCEIRO_WALLET', p_parceiro_id,
    v_out_id,
    upper(p_coin_origem), p_qtd_origem, upper(p_coin_destino), p_qtd_destino,
    p_qtd_destino / p_qtd_origem,
    v_op, v_meta || jsonb_build_object('swap_leg', 'IN')
  ) RETURNING id INTO v_in_id;

  RETURN jsonb_build_object(
    'success', true,
    'swap_operation_id', v_op,
    'swap_out_id', v_out_id,
    'swap_in_id', v_in_id,
    'valor_usd_origem', v_usd_out,
    'valor_usd_destino', v_usd_in,
    'spread_usd', v_spread,
    'message', v_desc
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_registrar_swap_crypto(uuid, uuid, uuid, text, numeric, uuid, text, numeric, numeric, numeric, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_registrar_swap_crypto(uuid, uuid, uuid, text, numeric, uuid, text, numeric, numeric, numeric, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_registrar_swap_crypto(uuid, uuid, uuid, text, numeric, uuid, text, numeric, numeric, numeric, jsonb) TO service_role;