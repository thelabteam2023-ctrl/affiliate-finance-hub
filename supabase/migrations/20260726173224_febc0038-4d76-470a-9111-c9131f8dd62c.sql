CREATE OR REPLACE FUNCTION public.reportar_perda_transit_wallet(
  p_ledger_id uuid, p_motivo text,
  p_rede text DEFAULT NULL::text,
  p_hash text DEFAULT NULL::text,
  p_observacao text DEFAULT NULL::text
)
RETURNS json
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
  v_perda_ledger  uuid;
  v_motivo_norm   text;
  v_valor_usd     numeric;
  v_existing      uuid;
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

  IF v_ledger.origem_wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'ORIGEM_WALLET_REQUIRED');
  END IF;

  v_projeto := v_ledger.projeto_id_snapshot;
  v_valor_usd := ABS(COALESCE(v_ledger.valor_usd, 0));

  -- IDEMPOTÊNCIA
  SELECT id INTO v_existing
    FROM cash_ledger
   WHERE referencia_transacao_id = p_ledger_id
     AND tipo_transacao = 'PERDA_ATIVO'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    SELECT id INTO v_perda_id FROM projeto_perdas WHERE ledger_id_ref = v_existing LIMIT 1;
    RETURN json_build_object(
      'success', true, 'idempotent', true,
      'ledger_original_id', p_ledger_id,
      'perda_ledger_id', v_existing,
      'projeto_perda_id', v_perda_id,
      'valor_perdido_usd', v_valor_usd, 'motivo', v_motivo_norm
    );
  END IF;

  BEGIN
    PERFORM revert_wallet_transit(p_ledger_id, 'LOST', v_motivo_norm);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  UPDATE cash_ledger
     SET status         = 'CANCELADO',
         transit_status = 'LOST',
         descricao      = COALESCE(descricao,'') ||
                          format(' [PERDA_ATIVO_%s: %s%s%s]',
                            v_motivo_norm, COALESCE(p_rede,''),
                            CASE WHEN p_hash IS NOT NULL THEN ' hash='||p_hash ELSE '' END,
                            CASE WHEN p_observacao IS NOT NULL THEN ' obs='||p_observacao ELSE '' END),
         auditoria_metadata = COALESCE(auditoria_metadata,'{}'::jsonb) ||
           jsonb_build_object('perda_ativo', jsonb_build_object(
             'categoria', v_motivo_norm, 'rede_incorreta', p_rede,
             'hash_perdido', p_hash, 'observacao', p_observacao,
             'reportado_por', v_user, 'reportado_em', NOW())),
         updated_at = NOW()
   WHERE id = p_ledger_id;

  -- CONVENÇÃO alinhada a PERDA_OPERACIONAL: valores POSITIVOS + impacta_caixa=true
  INSERT INTO cash_ledger (
    workspace_id, user_id, data_transacao,
    tipo_transacao, tipo_moeda, moeda, coin,
    valor, valor_usd, qtd_coin,
    origem_tipo, origem_wallet_id,
    descricao, status,
    referencia_transacao_id, projeto_id_snapshot,
    auditoria_metadata, impacta_caixa_operacional
  ) VALUES (
    v_workspace, v_user, NOW(),
    'PERDA_ATIVO', 'CRYPTO', v_ledger.moeda, v_ledger.coin,
    ABS(COALESCE(v_ledger.valor, 0)),
    ABS(COALESCE(v_ledger.valor_usd, 0)),
    ABS(COALESCE(v_ledger.qtd_coin, 0)),
    'PARCEIRO_WALLET', v_ledger.origem_wallet_id,
    format('Ativo perdido (%s) - conciliacao #%s', v_motivo_norm, p_ledger_id),
    'CONFIRMADO',
    p_ledger_id, v_projeto,
    jsonb_build_object(
      'origem', 'PERDA_ATIVO', 'categoria', v_motivo_norm,
      'ledger_original', p_ledger_id, 'rede', p_rede,
      'hash', p_hash, 'observacao', p_observacao
    ),
    true
  ) RETURNING id INTO v_perda_ledger;

  INSERT INTO projeto_perdas (
    workspace_id, user_id, projeto_id, bookmaker_id,
    valor, valor_usd, moeda,
    categoria, descricao, status, data_registro, ledger_id_ref
  ) VALUES (
    v_workspace, v_user, v_projeto, NULL,
    ABS(COALESCE(v_ledger.valor, 0)),
    v_valor_usd, v_ledger.moeda,
    'PERDA_ATIVO_'||v_motivo_norm,
    format('Ativo perdido: %s | rede=%s | hash=%s | obs=%s | ledger_origem=%s',
      v_motivo_norm, COALESCE(p_rede,'-'), COALESCE(p_hash,'-'),
      COALESCE(p_observacao,'-'), p_ledger_id),
    'CONFIRMADA', NOW(), v_perda_ledger
  ) RETURNING id INTO v_perda_id;

  RETURN json_build_object(
    'success', true,
    'ledger_original_id', p_ledger_id,
    'perda_ledger_id', v_perda_ledger,
    'projeto_perda_id', v_perda_id,
    'valor_perdido_usd', v_valor_usd,
    'motivo', v_motivo_norm
  );
END;
$function$;