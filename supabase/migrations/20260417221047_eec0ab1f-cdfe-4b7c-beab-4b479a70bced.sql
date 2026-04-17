-- ============================================================================
-- RPC: reverter_movimentacao_caixa
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reverter_movimentacao_caixa(
  p_transacao_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tx public.cash_ledger;
  v_role text;
  v_mirror_id uuid;
  v_swap_pair_id uuid;
  v_swap_mirror_id uuid;
  v_swap_tx public.cash_ledger;
  v_window_hours int := 24;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Motivo é obrigatório (mín. 5 caracteres)');
  END IF;

  SELECT * INTO v_tx FROM public.cash_ledger WHERE id = p_transacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação não encontrada');
  END IF;

  -- Role check (owner/admin no workspace)
  SELECT role::text INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_tx.workspace_id AND user_id = v_user_id
  LIMIT 1;

  IF v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada (apenas owner/admin)');
  END IF;

  -- Janela de tempo
  IF v_tx.created_at < (now() - (v_window_hours || ' hours')::interval) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Janela de 24h para reversão expirada');
  END IF;

  -- Bloqueios
  IF v_tx.tipo_transacao IN ('APORTE', 'APORTE_FINANCEIRO', 'APORTE_DIRETO', 'LIQUIDACAO') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Use o fluxo dedicado de Investidores para reverter aportes/liquidações');
  END IF;

  -- Já é um estorno?
  IF v_tx.descricao IS NOT NULL AND v_tx.descricao LIKE 'ESTORNO:%' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta transação já é um estorno');
  END IF;

  -- Já foi revertida?
  IF EXISTS (
    SELECT 1 FROM public.cash_ledger
    WHERE referencia_transacao_id = v_tx.id
      AND descricao LIKE 'ESTORNO:%'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta transação já foi revertida');
  END IF;

  -- Inserir espelho (origem ↔ destino invertidos)
  INSERT INTO public.cash_ledger (
    workspace_id, user_id, tipo_transacao, tipo_moeda, moeda, valor,
    data_transacao, descricao, status,
    origem_tipo, origem_bookmaker_id, origem_conta_bancaria_id, origem_parceiro_id, origem_wallet_id,
    destino_tipo, destino_bookmaker_id, destino_conta_bancaria_id, destino_parceiro_id, destino_wallet_id,
    coin, qtd_coin, cotacao, cotacao_snapshot_at,
    moeda_origem, moeda_destino, valor_origem, valor_destino,
    cotacao_origem_usd, cotacao_destino_usd, valor_usd, valor_usd_referencia,
    metodo_origem, metodo_destino,
    impacta_caixa_operacional,
    referencia_transacao_id,
    auditoria_metadata,
    projeto_id_snapshot,
    investidor_id, nome_investidor, operador_id
  ) VALUES (
    v_tx.workspace_id, v_user_id, v_tx.tipo_transacao, v_tx.tipo_moeda, v_tx.moeda, v_tx.valor,
    now(), 'ESTORNO: ' || p_motivo, COALESCE(v_tx.status, 'CONFIRMADO'),
    -- swap origem/destino
    v_tx.destino_tipo, v_tx.destino_bookmaker_id, v_tx.destino_conta_bancaria_id, v_tx.destino_parceiro_id, v_tx.destino_wallet_id,
    v_tx.origem_tipo, v_tx.origem_bookmaker_id, v_tx.origem_conta_bancaria_id, v_tx.origem_parceiro_id, v_tx.origem_wallet_id,
    v_tx.coin, v_tx.qtd_coin, v_tx.cotacao, v_tx.cotacao_snapshot_at,
    v_tx.moeda_destino, v_tx.moeda_origem, v_tx.valor_destino, v_tx.valor_origem,
    v_tx.cotacao_destino_usd, v_tx.cotacao_origem_usd, v_tx.valor_usd, v_tx.valor_usd_referencia,
    v_tx.metodo_destino, v_tx.metodo_origem,
    v_tx.impacta_caixa_operacional,
    v_tx.id,
    jsonb_build_object(
      'reverted_by', v_user_id,
      'reverted_at', now(),
      'original_tx_id', v_tx.id,
      'motivo', p_motivo
    ),
    v_tx.projeto_id_snapshot,
    v_tx.investidor_id, v_tx.nome_investidor, v_tx.operador_id
  ) RETURNING id INTO v_mirror_id;

  -- Para SWAP: reverter o par
  IF v_tx.tipo_transacao IN ('SWAP_OUT', 'SWAP_IN') THEN
    -- Encontrar a contraparte (mesmo conversao_referencia_id ou referencia mútua)
    SELECT id INTO v_swap_pair_id
    FROM public.cash_ledger
    WHERE id != v_tx.id
      AND workspace_id = v_tx.workspace_id
      AND (
        (v_tx.conversao_referencia_id IS NOT NULL AND conversao_referencia_id = v_tx.conversao_referencia_id)
        OR referencia_transacao_id = v_tx.id
        OR id = v_tx.referencia_transacao_id
      )
      AND tipo_transacao IN ('SWAP_OUT', 'SWAP_IN')
      AND tipo_transacao != v_tx.tipo_transacao
      AND (descricao IS NULL OR descricao NOT LIKE 'ESTORNO:%')
    LIMIT 1;

    IF v_swap_pair_id IS NOT NULL THEN
      SELECT * INTO v_swap_tx FROM public.cash_ledger WHERE id = v_swap_pair_id;

      INSERT INTO public.cash_ledger (
        workspace_id, user_id, tipo_transacao, tipo_moeda, moeda, valor,
        data_transacao, descricao, status,
        origem_tipo, origem_bookmaker_id, origem_conta_bancaria_id, origem_parceiro_id, origem_wallet_id,
        destino_tipo, destino_bookmaker_id, destino_conta_bancaria_id, destino_parceiro_id, destino_wallet_id,
        coin, qtd_coin, cotacao, cotacao_snapshot_at,
        moeda_origem, moeda_destino, valor_origem, valor_destino,
        cotacao_origem_usd, cotacao_destino_usd, valor_usd, valor_usd_referencia,
        metodo_origem, metodo_destino,
        impacta_caixa_operacional,
        referencia_transacao_id,
        auditoria_metadata,
        projeto_id_snapshot,
        investidor_id, nome_investidor, operador_id
      ) VALUES (
        v_swap_tx.workspace_id, v_user_id, v_swap_tx.tipo_transacao, v_swap_tx.tipo_moeda, v_swap_tx.moeda, v_swap_tx.valor,
        now(), 'ESTORNO: ' || p_motivo, COALESCE(v_swap_tx.status, 'CONFIRMADO'),
        v_swap_tx.destino_tipo, v_swap_tx.destino_bookmaker_id, v_swap_tx.destino_conta_bancaria_id, v_swap_tx.destino_parceiro_id, v_swap_tx.destino_wallet_id,
        v_swap_tx.origem_tipo, v_swap_tx.origem_bookmaker_id, v_swap_tx.origem_conta_bancaria_id, v_swap_tx.origem_parceiro_id, v_swap_tx.origem_wallet_id,
        v_swap_tx.coin, v_swap_tx.qtd_coin, v_swap_tx.cotacao, v_swap_tx.cotacao_snapshot_at,
        v_swap_tx.moeda_destino, v_swap_tx.moeda_origem, v_swap_tx.valor_destino, v_swap_tx.valor_origem,
        v_swap_tx.cotacao_destino_usd, v_swap_tx.cotacao_origem_usd, v_swap_tx.valor_usd, v_swap_tx.valor_usd_referencia,
        v_swap_tx.metodo_destino, v_swap_tx.metodo_origem,
        v_swap_tx.impacta_caixa_operacional,
        v_swap_tx.id,
        jsonb_build_object(
          'reverted_by', v_user_id,
          'reverted_at', now(),
          'original_tx_id', v_swap_tx.id,
          'motivo', p_motivo,
          'swap_pair_of', v_mirror_id
        ),
        v_swap_tx.projeto_id_snapshot,
        v_swap_tx.investidor_id, v_swap_tx.nome_investidor, v_swap_tx.operador_id
      ) RETURNING id INTO v_swap_mirror_id;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Movimentação revertida com sucesso',
    'mirror_id', v_mirror_id,
    'swap_mirror_id', v_swap_mirror_id
  );
END;
$$;

-- ============================================================================
-- RPC: excluir_movimentacao_caixa
-- ============================================================================
CREATE OR REPLACE FUNCTION public.excluir_movimentacao_caixa(
  p_transacao_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_tx public.cash_ledger;
  v_role text;
  v_swap_pair_id uuid;
  v_window_minutes int := 30;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Motivo é obrigatório (mín. 5 caracteres)');
  END IF;

  SELECT * INTO v_tx FROM public.cash_ledger WHERE id = p_transacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação não encontrada');
  END IF;

  SELECT role::text INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_tx.workspace_id AND user_id = v_user_id
  LIMIT 1;

  IF v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada (apenas owner/admin)');
  END IF;

  IF v_tx.created_at < (now() - (v_window_minutes || ' minutes')::interval) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Janela de 30 min para exclusão expirada — use Reverter');
  END IF;

  IF v_tx.tipo_transacao IN ('APORTE', 'APORTE_FINANCEIRO', 'APORTE_DIRETO', 'LIQUIDACAO') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Aportes/liquidações não podem ser excluídos diretamente');
  END IF;

  IF COALESCE(v_tx.financial_events_generated, false) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação já gerou eventos financeiros — use Reverter');
  END IF;

  -- Snapshot em audit_logs antes de deletar
  INSERT INTO public.audit_logs (
    actor_user_id, action, entity_type, entity_id, entity_name,
    workspace_id, before_data, metadata
  ) VALUES (
    v_user_id, 'delete'::audit_action, 'cash_ledger', v_tx.id,
    'Movimentação ' || v_tx.tipo_transacao,
    v_tx.workspace_id,
    to_jsonb(v_tx),
    jsonb_build_object('motivo', p_motivo, 'deleted_at', now())
  );

  -- Para SWAP: deletar par junto
  IF v_tx.tipo_transacao IN ('SWAP_OUT', 'SWAP_IN') THEN
    SELECT id INTO v_swap_pair_id
    FROM public.cash_ledger
    WHERE id != v_tx.id
      AND workspace_id = v_tx.workspace_id
      AND (
        (v_tx.conversao_referencia_id IS NOT NULL AND conversao_referencia_id = v_tx.conversao_referencia_id)
        OR referencia_transacao_id = v_tx.id
        OR id = v_tx.referencia_transacao_id
      )
      AND tipo_transacao IN ('SWAP_OUT', 'SWAP_IN')
      AND tipo_transacao != v_tx.tipo_transacao
    LIMIT 1;

    IF v_swap_pair_id IS NOT NULL THEN
      INSERT INTO public.audit_logs (
        actor_user_id, action, entity_type, entity_id, entity_name,
        workspace_id, before_data, metadata
      )
      SELECT v_user_id, 'delete'::audit_action, 'cash_ledger', cl.id,
             'Movimentação ' || cl.tipo_transacao || ' (par swap)',
             cl.workspace_id, to_jsonb(cl),
             jsonb_build_object('motivo', p_motivo, 'deleted_at', now(), 'swap_pair_of', v_tx.id)
      FROM public.cash_ledger cl WHERE cl.id = v_swap_pair_id;

      DELETE FROM public.cash_ledger WHERE id = v_swap_pair_id;
    END IF;
  END IF;

  DELETE FROM public.cash_ledger WHERE id = v_tx.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Movimentação excluída com sucesso'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverter_movimentacao_caixa(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_movimentacao_caixa(uuid, text) TO authenticated;