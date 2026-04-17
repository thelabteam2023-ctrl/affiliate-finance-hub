-- =====================================================
-- HOTFIX P0: Reverter/Excluir movimentações do Caixa
-- =====================================================

-- 1. Garantir colunas de auditoria (idempotente)
ALTER TABLE public.cash_ledger
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_by_id UUID;

CREATE INDEX IF NOT EXISTS idx_cash_ledger_reversed_at
  ON public.cash_ledger(reversed_at) WHERE reversed_at IS NOT NULL;

-- =====================================================
-- 2. RPC: reverter_movimentacao_caixa (corrigida)
-- =====================================================
CREATE OR REPLACE FUNCTION public.reverter_movimentacao_caixa(
  p_transacao_id UUID,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_tx RECORD;
  v_role TEXT;
  v_mirror_id UUID;
  v_direcao_oposta TEXT;
  v_age_hours NUMERIC;
  v_tipos_bloqueados TEXT[] := ARRAY[
    'APORTE','APORTE_FINANCEIRO','APORTE_DIRETO','LIQUIDACAO',
    'DEPOSITO_VIRTUAL','SAQUE_VIRTUAL','SWAP_IN','SWAP_OUT',
    'GANHO_CAMBIAL','PERDA_CAMBIAL'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  -- Lock pessimista
  SELECT * INTO v_tx
  FROM public.cash_ledger
  WHERE id = p_transacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação não encontrada');
  END IF;

  -- Validar role do usuário no workspace
  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_tx.workspace_id AND user_id = v_user_id;

  IF v_role NOT IN ('owner','admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas owners/admins podem reverter');
  END IF;

  -- Já revertida?
  IF v_tx.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta movimentação já foi revertida');
  END IF;

  -- Já é um estorno?
  IF v_tx.descricao IS NOT NULL AND v_tx.descricao LIKE 'ESTORNO:%' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta transação já é um estorno');
  END IF;

  -- Tipo bloqueado?
  IF v_tx.tipo_transacao = ANY(v_tipos_bloqueados) THEN
    RETURN jsonb_build_object('success', false, 'message',
      v_tx.tipo_transacao || ' não suporta reversão automática — use o fluxo dedicado');
  END IF;

  -- Janela de 24h
  v_age_hours := EXTRACT(EPOCH FROM (NOW() - v_tx.created_at)) / 3600;
  IF v_age_hours > 24 THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Janela de 24h para reversão expirada (' || ROUND(v_age_hours, 1) || 'h)');
  END IF;

  -- Já processou eventos? OK, vamos gerar evento espelho via AJUSTE
  -- Determinar direção oposta baseado no tipo
  v_direcao_oposta := CASE v_tx.tipo_transacao
    WHEN 'DEPOSITO' THEN 'SAIDA'
    WHEN 'SAQUE' THEN 'ENTRADA'
    WHEN 'TRANSFERENCIA' THEN 'ENTRADA' -- ajusta inverso na origem/destino
    WHEN 'PAGTO_PARCEIRO' THEN 'ENTRADA'
    WHEN 'PAGTO_FORNECEDOR' THEN 'ENTRADA'
    WHEN 'PAGTO_OPERADOR' THEN 'ENTRADA'
    WHEN 'COMISSAO_INDICADOR' THEN 'ENTRADA'
    WHEN 'BONUS_INDICADOR' THEN 'ENTRADA'
    WHEN 'DESPESA_ADMINISTRATIVA' THEN 'ENTRADA'
    WHEN 'RENOVACAO_PARCERIA' THEN 'ENTRADA'
    WHEN 'BONIFICACAO_ESTRATEGICA' THEN 'ENTRADA'
    WHEN 'ESTORNO_COMISSAO_INDICADOR' THEN 'SAIDA'
    WHEN 'AJUSTE_MANUAL' THEN
      CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    WHEN 'AJUSTE_SALDO' THEN
      CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    WHEN 'AJUSTE_RECONCILIACAO' THEN
      CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    WHEN 'CONCILIACAO' THEN
      CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    ELSE 'SAIDA'
  END;

  -- Criar espelho como AJUSTE_RECONCILIACAO (neutraliza sem duplicar tipo)
  INSERT INTO public.cash_ledger (
    workspace_id, user_id, tipo_transacao,
    valor, moeda, tipo_moeda, data_transacao,
    origem_tipo, origem_bookmaker_id, origem_conta_bancaria_id,
    origem_wallet_id, origem_parceiro_id,
    destino_tipo, destino_bookmaker_id, destino_conta_bancaria_id,
    destino_wallet_id, destino_parceiro_id,
    descricao, status,
    referencia_transacao_id,
    ajuste_direcao, ajuste_motivo,
    cotacao, cotacao_snapshot_at,
    projeto_id_snapshot,
    auditoria_metadata
  ) VALUES (
    v_tx.workspace_id, v_user_id, 'AJUSTE_RECONCILIACAO',
    v_tx.valor, v_tx.moeda, v_tx.tipo_moeda, v_tx.data_transacao,
    -- Inverte origem/destino para neutralizar
    v_tx.destino_tipo, v_tx.destino_bookmaker_id, v_tx.destino_conta_bancaria_id,
    v_tx.destino_wallet_id, v_tx.destino_parceiro_id,
    v_tx.origem_tipo, v_tx.origem_bookmaker_id, v_tx.origem_conta_bancaria_id,
    v_tx.origem_wallet_id, v_tx.origem_parceiro_id,
    'ESTORNO: ' || COALESCE(p_motivo, 'sem motivo'),
    'CONFIRMADO',
    v_tx.id,
    v_direcao_oposta,
    'Estorno de ' || v_tx.tipo_transacao || ': ' || COALESCE(p_motivo, ''),
    v_tx.cotacao, v_tx.cotacao_snapshot_at,
    v_tx.projeto_id_snapshot,
    jsonb_build_object(
      'reverted_by', v_user_id,
      'reverted_at', NOW(),
      'original_tipo', v_tx.tipo_transacao,
      'motivo', p_motivo
    )
  )
  RETURNING id INTO v_mirror_id;

  -- Marcar original como revertida
  UPDATE public.cash_ledger
  SET reversed_at = NOW(),
      reversed_by_id = v_user_id,
      updated_at = NOW()
  WHERE id = v_tx.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Movimentação revertida com sucesso',
    'mirror_id', v_mirror_id
  );
END;
$$;

-- =====================================================
-- 3. RPC: excluir_movimentacao_caixa (corrigida)
-- =====================================================
CREATE OR REPLACE FUNCTION public.excluir_movimentacao_caixa(
  p_transacao_id UUID,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_tx RECORD;
  v_role TEXT;
  v_age_min NUMERIC;
  v_par_id UUID;
  v_tipos_bloqueados TEXT[] := ARRAY[
    'APORTE','APORTE_FINANCEIRO','APORTE_DIRETO','LIQUIDACAO',
    'DEPOSITO_VIRTUAL','SAQUE_VIRTUAL'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  SELECT * INTO v_tx
  FROM public.cash_ledger
  WHERE id = p_transacao_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação não encontrada');
  END IF;

  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_tx.workspace_id AND user_id = v_user_id;

  IF v_role NOT IN ('owner','admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas owners/admins podem excluir');
  END IF;

  IF v_tx.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Movimentação já revertida não pode ser excluída');
  END IF;

  IF v_tx.tipo_transacao = ANY(v_tipos_bloqueados) THEN
    RETURN jsonb_build_object('success', false, 'message',
      v_tx.tipo_transacao || ' não pode ser excluído diretamente');
  END IF;

  IF COALESCE(v_tx.financial_events_generated, false) THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Já gerou eventos financeiros — use Reverter');
  END IF;

  v_age_min := EXTRACT(EPOCH FROM (NOW() - v_tx.created_at)) / 60;
  IF v_age_min > 30 THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Janela de 30 min para exclusão expirada (' || ROUND(v_age_min, 1) || ' min) — use Reverter');
  END IF;

  -- Audit log com snapshot
  INSERT INTO public.audit_logs (
    workspace_id, actor_user_id, action, entity_type, entity_id,
    before_data, metadata
  ) VALUES (
    v_tx.workspace_id, v_user_id, 'delete', 'cash_ledger', v_tx.id,
    to_jsonb(v_tx),
    jsonb_build_object('motivo', p_motivo, 'deleted_at', NOW())
  );

  -- SWAP: detectar par e excluir junto
  IF v_tx.tipo_transacao IN ('SWAP_IN','SWAP_OUT') THEN
    SELECT id INTO v_par_id
    FROM public.cash_ledger
    WHERE referencia_transacao_id = v_tx.id
       OR (id = v_tx.referencia_transacao_id);
    IF v_par_id IS NOT NULL THEN
      INSERT INTO public.audit_logs (
        workspace_id, actor_user_id, action, entity_type, entity_id,
        before_data, metadata
      )
      SELECT workspace_id, v_user_id, 'delete', 'cash_ledger', id,
             to_jsonb(cash_ledger.*),
             jsonb_build_object('motivo', 'Par SWAP de ' || v_tx.id, 'deleted_at', NOW())
      FROM public.cash_ledger WHERE id = v_par_id;
      DELETE FROM public.cash_ledger WHERE id = v_par_id;
    END IF;
  END IF;

  DELETE FROM public.cash_ledger WHERE id = v_tx.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Movimentação excluída com sucesso'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverter_movimentacao_caixa(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.excluir_movimentacao_caixa(UUID, TEXT) TO authenticated;