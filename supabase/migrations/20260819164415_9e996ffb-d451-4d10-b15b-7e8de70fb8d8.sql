-- ============================================================
-- SWAP INTERNO DE CARTEIRAS: atomicidade + reversão em par
-- ============================================================

-- 1) Coluna de agrupamento das pernas do swap
ALTER TABLE public.cash_ledger
  ADD COLUMN IF NOT EXISTS swap_operation_id uuid;

CREATE INDEX IF NOT EXISTS idx_cash_ledger_swap_operation
  ON public.cash_ledger (swap_operation_id)
  WHERE swap_operation_id IS NOT NULL;

-- 2) Backfill dos swaps legados (pares ligados por referencia_transacao_id)
UPDATE public.cash_ledger out_leg
SET swap_operation_id = COALESCE(out_leg.swap_operation_id, in_leg.id)
FROM public.cash_ledger in_leg
WHERE in_leg.tipo_transacao = 'SWAP_IN'
  AND in_leg.referencia_transacao_id = out_leg.id
  AND out_leg.tipo_transacao = 'SWAP_OUT'
  AND out_leg.swap_operation_id IS NULL;

UPDATE public.cash_ledger in_leg
SET swap_operation_id = out_leg.swap_operation_id
FROM public.cash_ledger out_leg
WHERE in_leg.tipo_transacao = 'SWAP_IN'
  AND in_leg.referencia_transacao_id = out_leg.id
  AND out_leg.swap_operation_id IS NOT NULL
  AND in_leg.swap_operation_id IS NULL;

-- 3) Registro atômico do swap
DROP FUNCTION IF EXISTS public.fn_registrar_swap_crypto(uuid, uuid, uuid, text, numeric, uuid, text, numeric, numeric, numeric, jsonb);

CREATE OR REPLACE FUNCTION public.fn_registrar_swap_crypto(
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
  v_usd numeric;
  v_saldo numeric;
  v_out_id uuid;
  v_in_id uuid;
  v_desc text;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Usuário não autenticado');
  END IF;

  IF p_qtd_origem IS NULL OR p_qtd_origem <= 0 OR p_qtd_destino IS NULL OR p_qtd_destino <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Quantidades devem ser maiores que zero');
  END IF;

  IF upper(p_coin_origem) = upper(p_coin_destino) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Moeda de origem e destino devem ser diferentes');
  END IF;

  -- Wallets pertencem ao parceiro/workspace informado
  IF NOT EXISTS (
    SELECT 1 FROM public.wallets_crypto w
    WHERE w.id = p_wallet_origem_id AND w.parceiro_id = p_parceiro_id AND w.workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Wallet de origem inválida para este parceiro/workspace');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.wallets_crypto w
    WHERE w.id = p_wallet_destino_id AND w.parceiro_id = p_parceiro_id AND w.workspace_id = p_workspace_id
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

  v_usd := p_qtd_origem * COALESCE(NULLIF(p_preco_origem, 0), 1);
  v_desc := format('Swap %s → %s', upper(p_coin_origem), upper(p_coin_destino));

  -- Perna 1: SWAP_OUT
  INSERT INTO public.cash_ledger (
    user_id, workspace_id, tipo_transacao, tipo_moeda, moeda, valor,
    coin, qtd_coin, valor_usd, valor_usd_referencia, cotacao, cotacao_origem_usd,
    cotacao_snapshot_at, data_transacao, status, transit_status,
    impacta_caixa_operacional, descricao,
    origem_wallet_id, origem_tipo, origem_parceiro_id,
    moeda_origem, valor_origem, moeda_destino, valor_destino, cotacao_implicita,
    swap_operation_id, auditoria_metadata
  ) VALUES (
    v_user, p_workspace_id, 'SWAP_OUT', 'CRYPTO', 'USD', v_usd,
    upper(p_coin_origem), p_qtd_origem, v_usd, v_usd, p_preco_origem, p_preco_origem,
    v_now, v_now, 'CONFIRMADO', 'CONFIRMED',
    true, v_desc,
    p_wallet_origem_id, 'PARCEIRO_WALLET', p_parceiro_id,
    upper(p_coin_origem), p_qtd_origem, upper(p_coin_destino), p_qtd_destino,
    p_qtd_destino / p_qtd_origem,
    v_op, COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('swap_leg', 'OUT')
  ) RETURNING id INTO v_out_id;

  -- Perna 2: SWAP_IN (mesmo valor USD — swap é zero-sum)
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
    v_user, p_workspace_id, 'SWAP_IN', 'CRYPTO', 'USD', v_usd,
    upper(p_coin_destino), p_qtd_destino, v_usd, v_usd, p_preco_destino, p_preco_destino,
    v_now, v_now, 'CONFIRMADO', 'CONFIRMED',
    true, v_desc,
    p_wallet_destino_id, 'PARCEIRO_WALLET', p_parceiro_id,
    v_out_id,
    upper(p_coin_origem), p_qtd_origem, upper(p_coin_destino), p_qtd_destino,
    p_qtd_destino / p_qtd_origem,
    v_op, COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object('swap_leg', 'IN')
  ) RETURNING id INTO v_in_id;

  RETURN jsonb_build_object(
    'success', true,
    'swap_operation_id', v_op,
    'swap_out_id', v_out_id,
    'swap_in_id', v_in_id,
    'valor_usd', v_usd,
    'message', v_desc
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_registrar_swap_crypto(uuid, uuid, uuid, text, numeric, uuid, text, numeric, numeric, numeric, jsonb) TO authenticated;

-- 4) Reversão em par: reverter qualquer perna desfaz as duas
CREATE OR REPLACE FUNCTION public.reverter_movimentacao_caixa(p_transacao_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_impact jsonb;
  v_neg jsonb;
  v_leg record;
  v_tx record;
  v_res jsonb;
  v_legs uuid[];
  v_leg_id uuid;
  v_results jsonb := '[]'::jsonb;
BEGIN
  SELECT id, tipo_transacao, swap_operation_id, referencia_transacao_id, reversed_at
    INTO v_tx
  FROM public.cash_ledger WHERE id = p_transacao_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Movimentação não encontrada');
  END IF;

  -- Monta o conjunto de pernas a reverter (swap = par atômico)
  IF v_tx.tipo_transacao IN ('SWAP_IN', 'SWAP_OUT') THEN
    IF v_tx.swap_operation_id IS NOT NULL THEN
      SELECT array_agg(id ORDER BY tipo_transacao DESC) INTO v_legs
      FROM public.cash_ledger
      WHERE swap_operation_id = v_tx.swap_operation_id
        AND tipo_transacao IN ('SWAP_IN', 'SWAP_OUT')
        AND reversed_at IS NULL;
    ELSE
      -- Swaps legados: par ligado por referencia_transacao_id
      SELECT array_agg(id ORDER BY tipo_transacao DESC) INTO v_legs
      FROM public.cash_ledger
      WHERE reversed_at IS NULL
        AND tipo_transacao IN ('SWAP_IN', 'SWAP_OUT')
        AND (
          id = p_transacao_id
          OR referencia_transacao_id = p_transacao_id
          OR (v_tx.referencia_transacao_id IS NOT NULL AND id = v_tx.referencia_transacao_id)
        );
    END IF;
  END IF;

  IF v_legs IS NULL OR array_length(v_legs, 1) IS NULL THEN
    v_legs := ARRAY[p_transacao_id];
  END IF;

  -- Guard de cadeia: valida TODAS as pernas antes de reverter qualquer uma
  FOREACH v_leg_id IN ARRAY v_legs LOOP
    v_impact := public.fn_ledger_reversal_impact(v_leg_id);

    IF COALESCE((v_impact->>'found')::boolean, false)
       AND COALESCE((v_impact->>'ativos_negativos')::int, 0) > 0 THEN

      SELECT a INTO v_neg
      FROM jsonb_array_elements(v_impact->'ativos_afetados') a
      WHERE (a->>'negativo')::boolean
      LIMIT 1;

      RETURN jsonb_build_object(
        'success', false,
        'code', 'CADEIA_DEPENDENTE',
        'message', format(
          'Reversão bloqueada: o ativo "%s" ficaria com saldo negativo (%s %s) porque %s operação(ões) posterior(es) já consumiram esse recurso. Reverta a cadeia na ordem cronológica inversa.',
          COALESCE(v_neg->>'nome', 'destino'),
          round(COALESCE((v_neg->>'saldo_pos_reversao')::numeric, 0), 2),
          COALESCE(v_neg->>'moeda', ''),
          COALESCE(v_impact->>'descendentes_count', '0')
        ),
        'impacto', v_impact
      );
    END IF;
  END LOOP;

  -- Reverte todas as pernas na MESMA transação
  FOREACH v_leg_id IN ARRAY v_legs LOOP
    v_res := public.reverter_movimentacao_caixa_inner(v_leg_id, p_motivo);
    IF NOT COALESCE((v_res->>'success')::boolean, false) THEN
      RAISE EXCEPTION '%', COALESCE(v_res->>'message', 'Falha ao reverter movimentação');
    END IF;
    v_results := v_results || jsonb_build_array(v_res);
  END LOOP;

  IF array_length(v_legs, 1) > 1 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', format('Swap revertido por completo (%s pernas)', array_length(v_legs, 1)),
      'pernas', v_results,
      'mirror_id', v_results->0->>'mirror_id'
    );
  END IF;

  RETURN v_results->0;
END;
$function$;