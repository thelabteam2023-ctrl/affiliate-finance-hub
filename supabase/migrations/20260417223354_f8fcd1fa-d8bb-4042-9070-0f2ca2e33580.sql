-- 1) Idempotência e rastreabilidade
ALTER TABLE public.cash_ledger
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by_id uuid;

CREATE INDEX IF NOT EXISTS idx_cash_ledger_reversed_at ON public.cash_ledger(reversed_at) WHERE reversed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cash_ledger_referencia ON public.cash_ledger(referencia_transacao_id) WHERE referencia_transacao_id IS NOT NULL;

-- 2) Reverter — versão corrigida (sem duplicação de eventos)
CREATE OR REPLACE FUNCTION public.reverter_movimentacao_caixa(p_transacao_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_tx public.cash_ledger;
  v_role text;
  v_mirror_id uuid;
  v_swap_pair_id uuid;
  v_window_hours int := 24;
  v_has_bookmaker boolean;
  v_blocked_types text[] := ARRAY[
    'APORTE','APORTE_FINANCEIRO','APORTE_DIRETO','LIQUIDACAO',
    'DEPOSITO_VIRTUAL','SAQUE_VIRTUAL',
    'SWAP_IN','SWAP_OUT',
    'GANHO_CAMBIAL','PERDA_CAMBIAL'
  ];
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Motivo é obrigatório (mín. 5 caracteres)');
  END IF;

  -- LOCK pessimista
  SELECT * INTO v_tx FROM public.cash_ledger WHERE id = p_transacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação não encontrada');
  END IF;

  -- Idempotência O(1)
  IF v_tx.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta transação já foi revertida');
  END IF;

  -- Já é um estorno?
  IF v_tx.descricao IS NOT NULL AND v_tx.descricao LIKE 'ESTORNO:%' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta transação já é um estorno');
  END IF;

  -- Role
  SELECT role::text INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_tx.workspace_id AND user_id = v_user_id
  LIMIT 1;

  IF v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada (apenas owner/admin)');
  END IF;

  IF v_tx.reconciled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação reconciliada não pode ser revertida');
  END IF;

  IF v_tx.created_at < (now() - (v_window_hours || ' hours')::interval) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Janela de 24h para reversão expirada');
  END IF;

  IF v_tx.tipo_transacao = ANY(v_blocked_types) THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Tipo "' || v_tx.tipo_transacao || '" não suporta reversão automática — use o fluxo dedicado');
  END IF;

  v_has_bookmaker := (v_tx.origem_bookmaker_id IS NOT NULL OR v_tx.destino_bookmaker_id IS NOT NULL);

  -- ============================================================
  -- CAMINHO A: Tem bookmaker → gerar AJUSTE_RECONCILIACAO oposto
  -- (usa caminho já testado do trigger; idempotency_key única)
  -- ============================================================
  IF v_has_bookmaker THEN
    -- Caso especial: TRANSFERENCIA com origem E destino (gera 2 ajustes)
    IF v_tx.tipo_transacao = 'TRANSFERENCIA'
       AND v_tx.origem_bookmaker_id IS NOT NULL
       AND v_tx.destino_bookmaker_id IS NOT NULL THEN

      -- Ajuste 1: devolver à origem (ENTRADA)
      INSERT INTO public.cash_ledger (
        workspace_id, user_id, tipo_transacao, tipo_moeda, moeda, valor,
        data_transacao, descricao, status,
        origem_tipo, destino_tipo, destino_bookmaker_id,
        ajuste_direcao, ajuste_motivo,
        impacta_caixa_operacional, referencia_transacao_id,
        auditoria_metadata, projeto_id_snapshot
      ) VALUES (
        v_tx.workspace_id, v_user_id, 'AJUSTE_RECONCILIACAO', v_tx.tipo_moeda, v_tx.moeda, ABS(v_tx.valor),
        now(), 'ESTORNO: ' || p_motivo, 'CONFIRMADO',
        'AJUSTE','BOOKMAKER', v_tx.origem_bookmaker_id,
        'ENTRADA', 'Reversão de transferência (devolução à origem)',
        false, v_tx.id,
        jsonb_build_object('reverted_by', v_user_id, 'reverted_at', now(),
          'original_tx_id', v_tx.id, 'motivo', p_motivo, 'reversal_leg', 'origem'),
        v_tx.projeto_id_snapshot
      ) RETURNING id INTO v_mirror_id;

      -- Ajuste 2: retirar do destino (SAIDA)
      INSERT INTO public.cash_ledger (
        workspace_id, user_id, tipo_transacao, tipo_moeda, moeda, valor,
        data_transacao, descricao, status,
        origem_tipo, origem_bookmaker_id, destino_tipo,
        ajuste_direcao, ajuste_motivo,
        impacta_caixa_operacional, referencia_transacao_id,
        auditoria_metadata, projeto_id_snapshot
      ) VALUES (
        v_tx.workspace_id, v_user_id, 'AJUSTE_RECONCILIACAO',
        COALESCE(v_tx.tipo_moeda, v_tx.tipo_moeda), COALESCE(v_tx.moeda_destino, v_tx.moeda),
        ABS(COALESCE(v_tx.valor_destino, v_tx.valor)),
        now(), 'ESTORNO: ' || p_motivo, 'CONFIRMADO',
        'BOOKMAKER', v_tx.destino_bookmaker_id, 'AJUSTE',
        'SAIDA', 'Reversão de transferência (retirada do destino)',
        false, v_tx.id,
        jsonb_build_object('reverted_by', v_user_id, 'reverted_at', now(),
          'original_tx_id', v_tx.id, 'motivo', p_motivo, 'reversal_leg', 'destino'),
        v_tx.projeto_id_snapshot
      );

    ELSE
      -- DEPOSITO/SAQUE/AJUSTE/BONUS/CASHBACK/etc: 1 ajuste oposto
      DECLARE
        v_target_bm uuid := COALESCE(v_tx.destino_bookmaker_id, v_tx.origem_bookmaker_id);
        v_direcao text;
      BEGIN
        -- Direção do AJUSTE = oposto do efeito original
        v_direcao := CASE
          WHEN v_tx.tipo_transacao IN ('DEPOSITO','BONUS_CREDITADO','GIRO_GRATIS','CASHBACK','CASHBACK_MANUAL','PERDA_REVERSAO')
            THEN 'SAIDA'  -- original somou → reversão subtrai
          WHEN v_tx.tipo_transacao IN ('SAQUE','BONUS_ESTORNO','GIRO_GRATIS_ESTORNO','CASHBACK_ESTORNO','PERDA_OPERACIONAL')
            THEN 'ENTRADA' -- original subtraiu → reversão soma
          WHEN v_tx.tipo_transacao IN ('AJUSTE_SALDO','AJUSTE_RECONCILIACAO')
            THEN CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
          ELSE NULL
        END;

        IF v_direcao IS NULL THEN
          RAISE EXCEPTION 'Tipo % sem regra de reversão definida', v_tx.tipo_transacao;
        END IF;

        INSERT INTO public.cash_ledger (
          workspace_id, user_id, tipo_transacao, tipo_moeda, moeda, valor,
          data_transacao, descricao, status,
          origem_tipo, destino_tipo, destino_bookmaker_id,
          ajuste_direcao, ajuste_motivo,
          impacta_caixa_operacional, referencia_transacao_id,
          auditoria_metadata, projeto_id_snapshot
        ) VALUES (
          v_tx.workspace_id, v_user_id, 'AJUSTE_RECONCILIACAO', v_tx.tipo_moeda, v_tx.moeda, ABS(v_tx.valor),
          now(), 'ESTORNO: ' || p_motivo, 'CONFIRMADO',
          'AJUSTE','BOOKMAKER', v_target_bm,
          v_direcao, 'Reversão de ' || v_tx.tipo_transacao,
          v_tx.impacta_caixa_operacional, v_tx.id,
          jsonb_build_object('reverted_by', v_user_id, 'reverted_at', now(),
            'original_tx_id', v_tx.id, 'original_tipo', v_tx.tipo_transacao, 'motivo', p_motivo),
          v_tx.projeto_id_snapshot
        ) RETURNING id INTO v_mirror_id;
      END;
    END IF;

  ELSE
    -- ============================================================
    -- CAMINHO B: Sem bookmaker (parceiro↔conta, conta↔parceiro)
    -- Espelho com origem/destino invertidos — não dispara trigger de financial_events
    -- ============================================================
    INSERT INTO public.cash_ledger (
      workspace_id, user_id, tipo_transacao, tipo_moeda, moeda, valor,
      data_transacao, descricao, status,
      origem_tipo, origem_conta_bancaria_id, origem_parceiro_id, origem_wallet_id,
      destino_tipo, destino_conta_bancaria_id, destino_parceiro_id, destino_wallet_id,
      coin, qtd_coin, cotacao, cotacao_snapshot_at,
      moeda_origem, moeda_destino, valor_origem, valor_destino,
      cotacao_origem_usd, cotacao_destino_usd, valor_usd, valor_usd_referencia,
      metodo_origem, metodo_destino,
      impacta_caixa_operacional, referencia_transacao_id,
      auditoria_metadata, projeto_id_snapshot
    ) VALUES (
      v_tx.workspace_id, v_user_id, v_tx.tipo_transacao, v_tx.tipo_moeda, v_tx.moeda, v_tx.valor,
      now(), 'ESTORNO: ' || p_motivo, 'CONFIRMADO',
      v_tx.destino_tipo, v_tx.destino_conta_bancaria_id, v_tx.destino_parceiro_id, v_tx.destino_wallet_id,
      v_tx.origem_tipo, v_tx.origem_conta_bancaria_id, v_tx.origem_parceiro_id, v_tx.origem_wallet_id,
      v_tx.coin, v_tx.qtd_coin, v_tx.cotacao, v_tx.cotacao_snapshot_at,
      v_tx.moeda_destino, v_tx.moeda_origem, v_tx.valor_destino, v_tx.valor_origem,
      v_tx.cotacao_destino_usd, v_tx.cotacao_origem_usd, v_tx.valor_usd, v_tx.valor_usd_referencia,
      v_tx.metodo_destino, v_tx.metodo_origem,
      v_tx.impacta_caixa_operacional, v_tx.id,
      jsonb_build_object('reverted_by', v_user_id, 'reverted_at', now(),
        'original_tx_id', v_tx.id, 'motivo', p_motivo),
      v_tx.projeto_id_snapshot
    ) RETURNING id INTO v_mirror_id;
  END IF;

  -- Marca a original como revertida (idempotência)
  UPDATE public.cash_ledger
  SET reversed_at = now(), reversed_by_id = v_mirror_id
  WHERE id = v_tx.id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Movimentação revertida com sucesso',
    'mirror_id', v_mirror_id
  );
END;
$function$;

-- 3) Excluir — adiciona lock pessimista
CREATE OR REPLACE FUNCTION public.excluir_movimentacao_caixa(p_transacao_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_tx public.cash_ledger;
  v_role text;
  v_window_minutes int := 30;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Não autenticado');
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) < 5 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Motivo é obrigatório (mín. 5 caracteres)');
  END IF;

  SELECT * INTO v_tx FROM public.cash_ledger WHERE id = p_transacao_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação não encontrada');
  END IF;

  IF v_tx.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação já revertida não pode ser excluída');
  END IF;

  SELECT role::text INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_tx.workspace_id AND user_id = v_user_id
  LIMIT 1;

  IF v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Permissão negada (apenas owner/admin)');
  END IF;

  IF v_tx.reconciled_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação reconciliada não pode ser excluída');
  END IF;

  IF v_tx.created_at < (now() - (v_window_minutes || ' minutes')::interval) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Janela de 30 min para exclusão expirada — use Reverter');
  END IF;

  IF v_tx.tipo_transacao IN ('APORTE', 'APORTE_FINANCEIRO', 'APORTE_DIRETO', 'LIQUIDACAO',
                              'DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL') THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Tipo "' || v_tx.tipo_transacao || '" não pode ser excluído diretamente');
  END IF;

  IF COALESCE(v_tx.financial_events_generated, false) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Transação já gerou eventos financeiros — use Reverter');
  END IF;

  -- Snapshot completo em audit_logs
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

  -- SWAP: deletar par
  IF v_tx.tipo_transacao IN ('SWAP_OUT', 'SWAP_IN') THEN
    DECLARE v_swap_pair_id uuid;
    BEGIN
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
      LIMIT 1
      FOR UPDATE;

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
    END;
  END IF;

  DELETE FROM public.cash_ledger WHERE id = v_tx.id;

  RETURN jsonb_build_object('success', true, 'message', 'Movimentação excluída com sucesso');
END;
$function$;