-- ============================================================================
-- P3: Hardening Estrito + Detecção de Dependências Downstream
-- ============================================================================

-- 1) Função para detectar dependências de uma transação no caixa operacional
CREATE OR REPLACE FUNCTION public.get_movimentacao_dependencies(
  p_transacao_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx record;
  v_bookmaker_id uuid;
  v_apostas_count int := 0;
  v_apostas_detalhes jsonb := '[]'::jsonb;
  v_movs_count int := 0;
  v_movs_detalhes jsonb := '[]'::jsonb;
  v_total int := 0;
BEGIN
  SELECT * INTO v_tx FROM public.cash_ledger WHERE id = p_transacao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Determina bookmaker afetado: prioriza destino (depósito/transferência), depois origem
  v_bookmaker_id := COALESCE(v_tx.destino_bookmaker_id, v_tx.origem_bookmaker_id);

  IF v_bookmaker_id IS NULL THEN
    RETURN jsonb_build_object(
      'found', true,
      'bookmaker_afetado', null,
      'total_dependencias', 0,
      'apostas', '[]'::jsonb,
      'movimentacoes', '[]'::jsonb
    );
  END IF;

  -- Apostas posteriores ao evento (qualquer status que tenha consumido saldo)
  SELECT
    COUNT(*),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'data', created_at,
      'estrategia', estrategia,
      'evento', evento,
      'stake', COALESCE(stake_total, stake_real, stake, 0),
      'moeda', COALESCE(moeda_operacao, 'BRL'),
      'status', status,
      'resultado', resultado
    ) ORDER BY created_at), '[]'::jsonb)
  INTO v_apostas_count, v_apostas_detalhes
  FROM public.apostas_unificada
  WHERE bookmaker_id = v_bookmaker_id
    AND created_at > v_tx.created_at
    AND status NOT IN ('CANCELADA');

  -- Outras movimentações posteriores no mesmo bookmaker (saídas que dependem do saldo)
  SELECT
    COUNT(*),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'data', created_at,
      'tipo', tipo_transacao,
      'valor', valor,
      'moeda', moeda,
      'descricao', LEFT(COALESCE(descricao, ''), 60)
    ) ORDER BY created_at), '[]'::jsonb)
  INTO v_movs_count, v_movs_detalhes
  FROM public.cash_ledger
  WHERE id <> p_transacao_id
    AND reversed_at IS NULL
    AND created_at > v_tx.created_at
    AND (
      origem_bookmaker_id = v_bookmaker_id   -- saídas
      OR destino_bookmaker_id = v_bookmaker_id  -- entradas que podem ser revertidas
    );

  v_total := v_apostas_count + v_movs_count;

  RETURN jsonb_build_object(
    'found', true,
    'bookmaker_afetado', v_bookmaker_id,
    'tipo_origem', v_tx.tipo_transacao,
    'data_origem', v_tx.created_at,
    'total_dependencias', v_total,
    'apostas_count', v_apostas_count,
    'movimentacoes_count', v_movs_count,
    'apostas', v_apostas_detalhes,
    'movimentacoes', v_movs_detalhes
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_movimentacao_dependencies(uuid) TO authenticated;


-- 2) Hardening da RPC reverter_movimentacao_caixa: modo estrito
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
  v_tx record;
  v_user_id uuid;
  v_role text;
  v_workspace_id uuid;
  v_mirror_id uuid;
  v_direcao_oposta text;
  v_now timestamptz := now();
  v_bookmaker_afetado uuid;
  v_deps_apostas int := 0;
  v_deps_movs int := 0;
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

  -- Permissão owner/admin no workspace
  SELECT role INTO v_role
  FROM public.workspace_members
  WHERE workspace_id = v_tx.workspace_id AND user_id = v_user_id;

  IF v_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Apenas owners/admins podem reverter');
  END IF;

  -- Idempotência
  IF v_tx.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta movimentação já foi revertida');
  END IF;

  IF v_tx.descricao IS NOT NULL AND v_tx.descricao LIKE 'ESTORNO:%' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Esta transação já é um estorno');
  END IF;

  -- Janela de 24h
  IF (v_now - v_tx.created_at) > INTERVAL '24 hours' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Janela de 24h para reversão expirada');
  END IF;

  -- Tipos bloqueados
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

  -- ====================================================================
  -- MODO ESTRITO: bloquear se houver atividade posterior no bookmaker
  -- Aplica-se apenas a tipos que afetam saldo de bookmaker:
  -- DEPOSITO, SAQUE, TRANSFERENCIA, BONUS_CREDITADO
  -- ====================================================================
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

  -- Mapeamento de direção oposta para o espelho
  v_direcao_oposta := CASE v_tx.tipo_transacao
    WHEN 'DEPOSITO' THEN 'SAIDA'
    WHEN 'SAQUE' THEN 'ENTRADA'
    WHEN 'TRANSFERENCIA' THEN 'ENTRADA'
    WHEN 'AJUSTE_MANUAL' THEN
      CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    WHEN 'AJUSTE_RECONCILIACAO' THEN
      CASE WHEN v_tx.ajuste_direcao = 'ENTRADA' THEN 'SAIDA' ELSE 'ENTRADA' END
    WHEN 'BONUS_CREDITADO' THEN 'SAIDA'
    WHEN 'CASHBACK_MANUAL' THEN 'SAIDA'
    WHEN 'DESPESA_ADMINISTRATIVA' THEN 'ENTRADA'
    WHEN 'PAGTO_OPERADOR' THEN 'ENTRADA'
    WHEN 'PAGTO_PARCEIRO' THEN 'ENTRADA'
    WHEN 'PAGTO_INVESTIDOR' THEN 'ENTRADA'
    ELSE 'AJUSTE'
  END;

  -- Cria espelho preservando data_transacao original
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
    -- inverter origem ↔ destino
    v_tx.destino_bookmaker_id, v_tx.origem_bookmaker_id,
    v_tx.destino_conta_bancaria_id, v_tx.origem_conta_bancaria_id,
    v_tx.destino_wallet_id, v_tx.origem_wallet_id,
    v_tx.destino_parceiro_id, v_tx.origem_parceiro_id,
    v_tx.destino_tipo, v_tx.origem_tipo,
    v_tx.data_transacao, 'ESTORNO: ' || p_motivo,
    true, v_tx.projeto_id_snapshot
  ) RETURNING id INTO v_mirror_id;

  -- Marca original como revertida
  UPDATE public.cash_ledger
  SET reversed_at = v_now,
      reversed_by_id = v_mirror_id::text
  WHERE id = p_transacao_id;

  -- Auditoria
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
$$;

GRANT EXECUTE ON FUNCTION public.reverter_movimentacao_caixa(uuid, text) TO authenticated;