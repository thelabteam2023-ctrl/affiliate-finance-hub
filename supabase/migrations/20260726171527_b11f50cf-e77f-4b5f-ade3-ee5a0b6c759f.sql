CREATE OR REPLACE FUNCTION public.reportar_perda_transit_wallet(
  p_ledger_id uuid,
  p_motivo text,
  p_rede text DEFAULT NULL,
  p_hash text DEFAULT NULL,
  p_observacao text DEFAULT NULL
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ledger        RECORD;
  v_workspace     uuid;
  v_user          uuid;
  v_projeto       uuid;
  v_perda_id      uuid;
  v_ajuste_id     uuid;
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
  IF v_motivo_norm NOT IN ('REDE_INCORRETA','ENDERECO_INVALIDO','FRAUDE','OUTRO') THEN
    RETURN json_build_object('success', false, 'error', 'MOTIVO_INVALIDO');
  END IF;

  SELECT * INTO v_ledger FROM cash_ledger WHERE id = p_ledger_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'LEDGER_NOT_FOUND');
  END IF;

  v_workspace := v_ledger.workspace_id;
  IF v_workspace IS DISTINCT FROM get_current_workspace() THEN
    RETURN json_build_object('success', false, 'error', 'WORKSPACE_MISMATCH');
  END IF;

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

  -- 1) Destravar saldo (se estava travado)
  BEGIN
    PERFORM revert_wallet_transit(p_ledger_id, 'LOST', v_motivo_norm);
  EXCEPTION WHEN OTHERS THEN
    -- se não estava travado, seguimos
    NULL;
  END;

  -- 2) Marcar ledger original como CANCELADO + LOST
  UPDATE cash_ledger
     SET status         = 'CANCELADO',
         transit_status = 'LOST',
         descricao      = COALESCE(descricao,'') ||
                          format(' [PERDA_%s: %s%s%s]',
                            v_motivo_norm,
                            COALESCE(p_rede,''),
                            CASE WHEN p_hash IS NOT NULL THEN ' hash='||p_hash ELSE '' END,
                            CASE WHEN p_observacao IS NOT NULL THEN ' obs='||p_observacao ELSE '' END
                          ),
         auditoria_metadata = COALESCE(auditoria_metadata,'{}'::jsonb) ||
           jsonb_build_object(
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

  -- 3) AJUSTE_SALDO de débito na wallet (origem)
  INSERT INTO cash_ledger (
    workspace_id, user_id, data_transacao,
    tipo_transacao, tipo_moeda, moeda, coin,
    valor, valor_usd, qtd_coin,
    origem_tipo, origem_wallet_id,
    descricao, status,
    ajuste_natureza, ajuste_direcao, ajuste_motivo,
    referencia_transacao_id, projeto_id_snapshot,
    auditoria_metadata, impacta_caixa_operacional
  ) VALUES (
    v_workspace, v_user, NOW(),
    'AJUSTE_SALDO', 'CRYPTO', v_ledger.moeda, v_ledger.coin,
    v_ledger.valor, v_ledger.valor_usd, v_ledger.qtd_coin,
    'PARCEIRO_WALLET', v_ledger.origem_wallet_id,
    format('Perda em transito (%s) - conciliacao #%s', v_motivo_norm, p_ledger_id),
    'CONFIRMADO',
    'EXTRAORDINARIO', 'SAIDA', 'PERDA_TRANSIT_WALLET',
    p_ledger_id, v_projeto,
    jsonb_build_object(
      'origem', 'PERDA_TRANSIT_WALLET',
      'ledger_original', p_ledger_id,
      'motivo', v_motivo_norm,
      'rede', p_rede,
      'hash', p_hash,
      'observacao', p_observacao
    ),
    false
  ) RETURNING id INTO v_ajuste_id;

  -- 4) Registrar em projeto_perdas (se houver projeto vinculado)
  IF v_projeto IS NOT NULL THEN
    INSERT INTO projeto_perdas (
      workspace_id, projeto_id, valor_perda_usd,
      motivo, descricao, ledger_id_ref, created_by
    ) VALUES (
      v_workspace, v_projeto, ABS(COALESCE(v_ledger.valor_usd, 0)),
      'PERDA_TRANSIT_'||v_motivo_norm,
      format('Perda em transito: %s | rede=%s | hash=%s | obs=%s',
        v_motivo_norm, COALESCE(p_rede,'-'), COALESCE(p_hash,'-'), COALESCE(p_observacao,'-')),
      v_ajuste_id, v_user
    ) RETURNING id INTO v_perda_id;
  END IF;

  RETURN json_build_object(
    'success', true,
    'ledger_original_id', p_ledger_id,
    'ajuste_ledger_id', v_ajuste_id,
    'projeto_perda_id', v_perda_id,
    'valor_perdido_usd', ABS(COALESCE(v_ledger.valor_usd, 0)),
    'motivo', v_motivo_norm
  );
END;
$function$;