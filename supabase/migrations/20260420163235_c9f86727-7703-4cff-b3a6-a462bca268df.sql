CREATE OR REPLACE FUNCTION public.reverter_movimentacao_caixa(p_transacao_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tx record;
  v_user_id uuid;
  v_role text;
  v_mirror_id uuid;
  v_direcao_oposta text;
  v_now timestamptz := now();
  v_bookmaker_afetado uuid;
  v_deps_apostas int := 0;
  v_deps_movs int := 0;
  v_mirror_origem_bookmaker_id uuid;
  v_mirror_destino_bookmaker_id uuid;
  v_mirror_origem_conta_bancaria_id uuid;
  v_mirror_destino_conta_bancaria_id uuid;
  v_mirror_origem_wallet_id uuid;
  v_mirror_destino_wallet_id uuid;
  v_mirror_origem_parceiro_id uuid;
  v_mirror_destino_parceiro_id uuid;
  v_mirror_origem_tipo text;
  v_mirror_destino_tipo text;
  v_allowed_origem_types constant text[] := ARRAY[
    'CAIXA_OPERACIONAL','PARCEIRO_CONTA','PARCEIRO_WALLET','BOOKMAKER','INVESTIDOR','AJUSTE','BASELINE','MIGRACAO'
  ];
  v_allowed_destino_types constant text[] := ARRAY[
    'CAIXA_OPERACIONAL','PARCEIRO','PARCEIRO_CONTA','PARCEIRO_WALLET','BOOKMAKER','INVESTIDOR','FORNECEDOR','INDICADOR','OPERADOR','AJUSTE'
  ];
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Motivo obrigatório (mín. 5 caracteres)');
  END IF;

  SELECT * INTO v_tx
  FROM public.cash_ledger
  WHERE id = p_transacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Movimentação não encontrada');
  END IF;

  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_tx.workspace_id AND user_id = v_user_id;

  IF v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas owners/admins podem reverter');
  END IF;

  IF v_tx.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta movimentação já foi revertida');
  END IF;

  IF v_tx.descricao IS NOT NULL AND v_tx.descricao LIKE 'ESTORNO:%' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta transação já é um estorno');
  END IF;

  IF (v_now - v_tx.created_at) > INTERVAL '24 hours' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Janela de 24h para reversão expirada');
  END IF;

  IF v_tx.tipo_transacao IN (
    'APORTE','APORTE_FINANCEIRO','APORTE_DIRETO','LIQUIDACAO',
    'DEPOSITO_VIRTUAL','SAQUE_VIRTUAL','SWAP_IN','SWAP_OUT',
    'GANHO_CAMBIAL','PERDA_CAMBIAL'
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', v_tx.tipo_transacao || ' não suporta reversão automática — use o fluxo dedicado'
    );
  END IF;

  IF v_tx.tipo_transacao IN ('DEPOSITO','SAQUE','TRANSFERENCIA','BONUS_CREDITADO') THEN
    v_bookmaker_afetado := COALESCE(v_tx.destino_bookmaker_id, v_tx.origem_bookmaker_id);

    IF v_bookmaker_afetado IS NOT NULL THEN
      SELECT COUNT(*) INTO v_deps_apostas
      FROM public.apostas_unificada
      WHERE bookmaker_id = v_bookmaker_afetado
        AND created_at > v_tx.created_at
        AND status NOT IN ('CANCELADA');

      SELECT COUNT(*) INTO v_deps_movs
      FROM public.cash_ledger
      WHERE id <> p_transacao_id
        AND reversed_at IS NULL
        AND created_at > v_tx.created_at
        AND (origem_bookmaker_id = v_bookmaker_afetado
             OR destino_bookmaker_id = v_bookmaker_afetado);

      IF (v_deps_apostas + v_deps_movs) > 0 THEN
        RETURN jsonb_build_object(
          'success', false,
          'code', 'DEPENDENCIAS_POSTERIORES',
          'message', format(
            'Reversão bloqueada: existem %s aposta(s) e %s movimentação(ões) posteriores no bookmaker afetado. Reverta a cadeia primeiro.',
            v_deps_apostas, v_deps_movs
          ),
          'deps_apostas', v_deps_apostas,
          'deps_movimentacoes', v_deps_movs,
          'bookmaker_id', v_bookmaker_afetado
        );
      END IF;
    END IF;
  END IF;

  v_direcao_oposta := CASE v_tx.tipo_transacao
    WHEN 'DEPOSITO' THEN 'SAIDA'
    WHEN 'BONUS_CREDITADO' THEN 'SAIDA'
    WHEN 'CASHBACK_MANUAL' THEN 'SAIDA'
    WHEN 'BONIFICACAO_ESTRATEGICA' THEN 'SAIDA'
    WHEN 'GIRO_GRATIS' THEN 'SAIDA'
    WHEN 'APOSTA_GREEN' THEN 'SAIDA'
    WHEN 'SAQUE' THEN 'ENTRADA'
    WHEN 'TRANSFERENCIA' THEN 'ENTRADA'
    WHEN 'DESPESA_ADMINISTRATIVA' THEN 'ENTRADA'
    WHEN 'PAGTO_OPERADOR' THEN 'ENTRADA'
    WHEN 'PAGTO_PARCEIRO' THEN 'ENTRADA'
    WHEN 'PAGTO_INVESTIDOR' THEN 'ENTRADA'
    WHEN 'PAGTO_FORNECEDOR' THEN 'ENTRADA'
    WHEN 'ALOCACAO_FORNECEDOR' THEN 'ENTRADA'
    WHEN 'COMISSAO_INDICADOR' THEN 'ENTRADA'
    WHEN 'RENOVACAO_PARCERIA' THEN 'ENTRADA'
    WHEN 'PERDA_OPERACIONAL' THEN 'ENTRADA'
    WHEN 'APOSTA_REVERSAO' THEN 'ENTRADA'
    WHEN 'BONUS_ESTORNO' THEN 'ENTRADA'
    WHEN 'CASHBACK_ESTORNO' THEN 'ENTRADA'
    WHEN 'GIRO_GRATIS_ESTORNO' THEN 'ENTRADA'
    WHEN 'ESTORNO' THEN 'ENTRADA'
    WHEN 'AJUSTE_MANUAL' THEN CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    WHEN 'AJUSTE_RECONCILIACAO' THEN CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    WHEN 'AJUSTE_SALDO' THEN CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    ELSE NULL
  END;

  IF v_direcao_oposta IS NULL THEN
    IF v_tx.ajuste_direcao IS NOT NULL THEN
      v_direcao_oposta := CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END;
    ELSIF v_tx.destino_bookmaker_id IS NOT NULL
       OR v_tx.destino_conta_bancaria_id IS NOT NULL
       OR v_tx.destino_wallet_id IS NOT NULL THEN
      v_direcao_oposta := 'SAIDA';
    ELSIF v_tx.origem_bookmaker_id IS NOT NULL
       OR v_tx.origem_conta_bancaria_id IS NOT NULL
       OR v_tx.origem_wallet_id IS NOT NULL THEN
      v_direcao_oposta := 'ENTRADA';
    ELSE
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Não foi possível determinar a direção do espelho para o tipo ' || v_tx.tipo_transacao
      );
    END IF;
  END IF;

  v_mirror_origem_bookmaker_id := v_tx.destino_bookmaker_id;
  v_mirror_destino_bookmaker_id := v_tx.origem_bookmaker_id;
  v_mirror_origem_conta_bancaria_id := v_tx.destino_conta_bancaria_id;
  v_mirror_destino_conta_bancaria_id := v_tx.origem_conta_bancaria_id;
  v_mirror_origem_wallet_id := v_tx.destino_wallet_id;
  v_mirror_destino_wallet_id := v_tx.origem_wallet_id;
  v_mirror_origem_parceiro_id := v_tx.destino_parceiro_id;
  v_mirror_destino_parceiro_id := v_tx.origem_parceiro_id;
  v_mirror_origem_tipo := v_tx.destino_tipo;
  v_mirror_destino_tipo := v_tx.origem_tipo;

  IF v_mirror_origem_tipo IS NOT NULL AND NOT (v_mirror_origem_tipo = ANY (v_allowed_origem_types)) THEN
    v_mirror_origem_tipo := 'AJUSTE';
    v_mirror_origem_bookmaker_id := NULL;
    v_mirror_origem_conta_bancaria_id := NULL;
    v_mirror_origem_wallet_id := NULL;
    v_mirror_origem_parceiro_id := NULL;
  END IF;

  IF v_mirror_destino_tipo IS NOT NULL AND NOT (v_mirror_destino_tipo = ANY (v_allowed_destino_types)) THEN
    v_mirror_destino_tipo := 'AJUSTE';
    v_mirror_destino_bookmaker_id := NULL;
    v_mirror_destino_conta_bancaria_id := NULL;
    v_mirror_destino_wallet_id := NULL;
    v_mirror_destino_parceiro_id := NULL;
  END IF;

  INSERT INTO public.cash_ledger (
    workspace_id, user_id, tipo_transacao, ajuste_direcao,
    valor, moeda, tipo_moeda, status,
    origem_bookmaker_id, destino_bookmaker_id,
    origem_conta_bancaria_id, destino_conta_bancaria_id,
    origem_wallet_id, destino_wallet_id,
    origem_parceiro_id, destino_parceiro_id,
    origem_tipo, destino_tipo,
    data_transacao, descricao,
    financial_events_generated, projeto_id_snapshot
  ) VALUES (
    v_tx.workspace_id, v_user_id, 'AJUSTE_RECONCILIACAO', v_direcao_oposta,
    v_tx.valor, v_tx.moeda, v_tx.tipo_moeda, 'CONFIRMADO',
    v_mirror_origem_bookmaker_id, v_mirror_destino_bookmaker_id,
    v_mirror_origem_conta_bancaria_id, v_mirror_destino_conta_bancaria_id,
    v_mirror_origem_wallet_id, v_mirror_destino_wallet_id,
    v_mirror_origem_parceiro_id, v_mirror_destino_parceiro_id,
    v_mirror_origem_tipo, v_mirror_destino_tipo,
    v_tx.data_transacao, 'ESTORNO: ' || p_motivo,
    true, v_tx.projeto_id_snapshot
  ) RETURNING id INTO v_mirror_id;

  UPDATE public.cash_ledger
  SET reversed_at = v_now,
      reversed_by_id = v_mirror_id,
      updated_at = v_now
  WHERE id = p_transacao_id;

  INSERT INTO public.audit_logs (
    actor_user_id, workspace_id, action, entity_type, entity_id,
    before_data, after_data, metadata
  ) VALUES (
    v_user_id, v_tx.workspace_id, 'UPDATE', 'cash_ledger', p_transacao_id,
    to_jsonb(v_tx),
    jsonb_build_object('reversed_at', v_now, 'mirror_id', v_mirror_id),
    jsonb_build_object('motivo', p_motivo, 'tipo_origem', v_tx.tipo_transacao)
  );

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Movimentação revertida com sucesso',
    'mirror_id', v_mirror_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reverter_movimentacao_caixa(uuid, text) TO authenticated;