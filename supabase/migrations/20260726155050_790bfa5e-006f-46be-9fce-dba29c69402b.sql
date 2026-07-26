-- =============================================================
-- Perda em Trânsito por Rede Incorreta
-- =============================================================

-- 1. Índice auxiliar em projeto_perdas para consultas por categoria
CREATE INDEX IF NOT EXISTS idx_projeto_perdas_categoria
  ON public.projeto_perdas (workspace_id, categoria);

-- 2. RPC principal: reportar_perda_transit_wallet
DROP FUNCTION IF EXISTS public.reportar_perda_transit_wallet(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.reportar_perda_transit_wallet(
  p_ledger_id     uuid,
  p_motivo        text,
  p_rede          text DEFAULT NULL,
  p_hash          text DEFAULT NULL,
  p_observacao    text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ledger        RECORD;
  v_workspace     uuid;
  v_user          uuid;
  v_projeto       uuid;
  v_perda_id      uuid;
  v_ajuste_id     uuid;
  v_desc          text;
  v_motivo_norm   text;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'MOTIVO_REQUIRED');
  END IF;

  v_motivo_norm := upper(trim(p_motivo));
  IF v_motivo_norm NOT IN ('REDE_INCORRETA', 'ENDERECO_INVALIDO', 'FRAUDE', 'OUTRO') THEN
    RETURN json_build_object('success', false, 'error', 'MOTIVO_INVALIDO');
  END IF;

  -- Buscar ledger
  SELECT * INTO v_ledger FROM cash_ledger WHERE id = p_ledger_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'LEDGER_NOT_FOUND');
  END IF;

  -- Validar workspace
  v_workspace := v_ledger.workspace_id;
  IF v_workspace IS DISTINCT FROM get_current_workspace() THEN
    RETURN json_build_object('success', false, 'error', 'WORKSPACE_MISMATCH');
  END IF;

  -- Só permite em transações pendentes de trânsito
  IF COALESCE(v_ledger.transit_status, '') <> 'PENDING' THEN
    RETURN json_build_object(
      'success', false,
      'error', 'INVALID_TRANSIT_STATUS',
      'current_status', v_ledger.transit_status
    );
  END IF;

  IF v_ledger.origem_wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'ORIGEM_WALLET_REQUIRED');
  END IF;

  v_projeto := v_ledger.projeto_id_snapshot;

  -- 1) Liberar o saldo travado da wallet de origem
  UPDATE wallets_crypto
     SET balance_locked = GREATEST(COALESCE(balance_locked, 0) - v_ledger.valor_usd, 0),
         balance_locked_updated_at = NOW()
   WHERE id = v_ledger.origem_wallet_id;

  -- 2) Registrar unlock no wallet_transit_log
  INSERT INTO wallet_transit_log (
    wallet_id, ledger_id, action, valor_usd, actor_user_id, metadata
  ) VALUES (
    v_ledger.origem_wallet_id,
    v_ledger.id,
    'UNLOCK_LOST',
    v_ledger.valor_usd,
    v_user,
    jsonb_build_object(
      'motivo', v_motivo_norm,
      'rede_incorreta', p_rede,
      'hash_perdido', p_hash,
      'observacao', p_observacao
    )
  );

  -- 3) Marcar ledger original como CANCELADO + transit_status LOST + metadados
  v_desc := format(
    ' [PERDA_%s: %s%s%s]',
    v_motivo_norm,
    COALESCE(p_observacao, 'sem observacao'),
    CASE WHEN p_rede IS NOT NULL THEN ' | rede=' || p_rede ELSE '' END,
    CASE WHEN p_hash IS NOT NULL THEN ' | hash=' || p_hash ELSE '' END
  );

  UPDATE cash_ledger
     SET transit_status  = 'LOST',
         status          = 'CANCELADO',
         status_valor    = 'CANCELADO',
         descricao       = COALESCE(descricao, '') || v_desc,
         auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
           'perda_transit', jsonb_build_object(
             'motivo', v_motivo_norm,
             'rede_incorreta', p_rede,
             'hash_perdido', p_hash,
             'observacao', p_observacao,
             'reportado_por', v_user,
             'reportado_em', NOW()
           )
         ),
         updated_at = NOW()
   WHERE id = p_ledger_id;

  -- 4) Lançar AJUSTE_SALDO negativo na wallet de origem (debita o saldo real de forma auditável)
  INSERT INTO cash_ledger (
    workspace_id,
    user_id,
    data_transacao,
    tipo_transacao,
    tipo_moeda,
    moeda,
    coin,
    valor,
    valor_usd,
    qtd_coin,
    origem_tipo,
    origem_wallet_id,
    descricao,
    status,
    ajuste_natureza,
    ajuste_direcao,
    ajuste_motivo,
    referencia_transacao_id,
    projeto_id_snapshot,
    auditoria_metadata,
    impacta_caixa_operacional
  ) VALUES (
    v_workspace,
    v_user,
    NOW(),
    'AJUSTE_SALDO',
    'CRYPTO',
    v_ledger.moeda,
    v_ledger.coin,
    v_ledger.valor,
    v_ledger.valor_usd,
    v_ledger.qtd_coin,
    'WALLET_CRYPTO',
    v_ledger.origem_wallet_id,
    format('Perda em transito (%s) - conciliacao #%s', v_motivo_norm, p_ledger_id),
    'CONFIRMADO',
    'EXTRAORDINARIO',
    'SAIDA',
    format('Perda %s. Rede: %s. Hash: %s. Obs: %s',
      v_motivo_norm,
      COALESCE(p_rede, '-'),
      COALESCE(p_hash, '-'),
      COALESCE(p_observacao, '-')
    ),
    p_ledger_id,
    v_projeto,
    jsonb_build_object(
      'origem', 'PERDA_TRANSIT_WALLET',
      'ledger_origem', p_ledger_id,
      'motivo', v_motivo_norm,
      'rede_incorreta', p_rede,
      'hash_perdido', p_hash
    ),
    true
  ) RETURNING id INTO v_ajuste_id;

  -- 5) Registrar em projeto_perdas (categoria CRIPTO_REDE_INCORRETA)
  IF v_projeto IS NOT NULL THEN
    INSERT INTO projeto_perdas (
      workspace_id,
      user_id,
      projeto_id,
      valor,
      categoria,
      descricao,
      status,
      data_confirmacao
    ) VALUES (
      v_workspace,
      v_user,
      v_projeto,
      v_ledger.valor_usd,
      'CRIPTO_REDE_INCORRETA',
      format('Perda em transito (%s). Rede: %s. Hash: %s. Obs: %s',
        v_motivo_norm,
        COALESCE(p_rede, '-'),
        COALESCE(p_hash, '-'),
        COALESCE(p_observacao, '-')
      ),
      'CONFIRMADA',
      NOW()
    ) RETURNING id INTO v_perda_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'ledger_id', p_ledger_id,
    'ajuste_id', v_ajuste_id,
    'perda_id', v_perda_id,
    'valor_perdido_usd', v_ledger.valor_usd
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reportar_perda_transit_wallet(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reportar_perda_transit_wallet(uuid, text, text, text, text) TO authenticated;

-- Relaxar check constraint de projeto_perdas se necessário (categoria é texto livre, não enum)
-- Nenhum ajuste extra necessário: coluna categoria é text sem check restritivo.