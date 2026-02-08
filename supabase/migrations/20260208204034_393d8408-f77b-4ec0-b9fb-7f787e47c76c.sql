
-- Fix close_project_cycle to use apostas_unificada instead of legacy tables
CREATE OR REPLACE FUNCTION public.close_project_cycle(_ciclo_id uuid, _workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _user_role text;
  _ciclo record;
  _projeto record;
  _apostas_abertas int;
  _perdas_pendentes int;
  _lucro_bruto numeric;
  _lucro_liquido numeric;
  _volume_apostado numeric;
  _qtd_apostas int;
  _roi numeric;
  _ticket_medio numeric;
  _perdas_confirmadas numeric;
  _excedente numeric;
  _observacoes_finais text;
  _valor_participacao numeric;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não autenticado');
  END IF;

  SELECT role::text INTO _user_role
  FROM workspace_members
  WHERE user_id = _user_id AND workspace_id = _workspace_id AND is_active = true;

  IF _user_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Usuário não pertence ao workspace');
  END IF;

  IF _user_role NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas proprietários e administradores podem fechar ciclos');
  END IF;

  SELECT * INTO _ciclo FROM projeto_ciclos WHERE id = _ciclo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ciclo não encontrado');
  END IF;

  IF _ciclo.status = 'FECHADO' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ciclo já está fechado', 'already_closed', true);
  END IF;

  IF _ciclo.status = 'CANCELADO' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não é possível fechar um ciclo cancelado');
  END IF;

  SELECT * INTO _projeto FROM projetos WHERE id = _ciclo.projeto_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Projeto não encontrado');
  END IF;

  IF _projeto.workspace_id != _workspace_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Ciclo não pertence ao workspace informado');
  END IF;

  -- ========== VERIFICAÇÕES DE PENDÊNCIAS (usando apostas_unificada) ==========
  SELECT COUNT(*) INTO _apostas_abertas
  FROM apostas_unificada
  WHERE projeto_id = _ciclo.projeto_id
    AND data_aposta >= _ciclo.data_inicio
    AND data_aposta <= _ciclo.data_fim_prevista
    AND status = 'PENDENTE';

  SELECT COUNT(*) INTO _perdas_pendentes
  FROM projeto_perdas
  WHERE projeto_id = _ciclo.projeto_id
    AND data_registro >= _ciclo.data_inicio
    AND data_registro <= _ciclo.data_fim_prevista
    AND status = 'PENDENTE';

  IF _apostas_abertas > 0 OR _perdas_pendentes > 0 THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Existem pendências que impedem o fechamento',
      'pendencias', jsonb_build_object(
        'apostas_abertas', _apostas_abertas,
        'perdas_pendentes', _perdas_pendentes
      )
    );
  END IF;

  -- ========== CALCULAR MÉTRICAS (usando apostas_unificada) ==========
  SELECT 
    COALESCE(COUNT(*), 0),
    COALESCE(SUM(COALESCE(stake_total, stake, 0)), 0),
    COALESCE(SUM(COALESCE(lucro_prejuizo, 0)), 0)
  INTO _qtd_apostas, _volume_apostado, _lucro_bruto
  FROM apostas_unificada
  WHERE projeto_id = _ciclo.projeto_id
    AND data_aposta >= _ciclo.data_inicio
    AND data_aposta <= _ciclo.data_fim_prevista
    AND status = 'LIQUIDADA';

  -- Calcular perdas confirmadas
  SELECT COALESCE(SUM(valor), 0) INTO _perdas_confirmadas
  FROM projeto_perdas
  WHERE projeto_id = _ciclo.projeto_id
    AND data_registro >= _ciclo.data_inicio
    AND data_registro <= _ciclo.data_fim_prevista
    AND status = 'CONFIRMADA';

  _lucro_liquido := _lucro_bruto - _perdas_confirmadas;
  _roi := CASE WHEN _volume_apostado > 0 THEN (_lucro_liquido / _volume_apostado) * 100 ELSE 0 END;
  _ticket_medio := CASE WHEN _qtd_apostas > 0 THEN _volume_apostado / _qtd_apostas ELSE 0 END;

  _excedente := 0;
  IF _ciclo.tipo_gatilho != 'TEMPO' AND _ciclo.meta_volume IS NOT NULL THEN
    IF _ciclo.metrica_acumuladora = 'VOLUME_APOSTADO' AND _volume_apostado > _ciclo.meta_volume THEN
      _excedente := _volume_apostado - _ciclo.meta_volume;
    ELSIF _ciclo.metrica_acumuladora = 'LUCRO' AND _lucro_liquido > _ciclo.meta_volume THEN
      _excedente := _lucro_liquido - _ciclo.meta_volume;
    END IF;
  END IF;

  _observacoes_finais := format(
    '📊 Métricas: %s apostas | Volume: R$ %s | Ticket Médio: R$ %s | ROI: %s%%',
    _qtd_apostas, ROUND(_volume_apostado, 2), ROUND(_ticket_medio, 2), ROUND(_roi, 2)
  );
  
  IF _perdas_confirmadas > 0 THEN
    _observacoes_finais := _observacoes_finais || format(' | Perdas: R$ %s', ROUND(_perdas_confirmadas, 2));
  END IF;

  IF _ciclo.observacoes IS NOT NULL AND _ciclo.observacoes != '' THEN
    _observacoes_finais := _ciclo.observacoes || E'\n\n' || _observacoes_finais;
  END IF;

  -- ========== FECHAR CICLO ==========
  UPDATE projeto_ciclos SET
    status = 'FECHADO',
    data_fim_real = CURRENT_DATE,
    lucro_bruto = _lucro_bruto,
    lucro_liquido = _lucro_liquido,
    valor_acumulado = CASE 
      WHEN _ciclo.metrica_acumuladora = 'VOLUME_APOSTADO' THEN _volume_apostado 
      ELSE _lucro_liquido 
    END,
    excedente_proximo = _excedente,
    gatilho_fechamento = 'MANUAL',
    data_fechamento = NOW(),
    observacoes = _observacoes_finais
  WHERE id = _ciclo_id;

  -- ========== PARTICIPAÇÃO INVESTIDOR ==========
  IF _projeto.investidor_id IS NOT NULL AND _projeto.percentual_investidor > 0 THEN
    DECLARE
      _lucro_base numeric;
    BEGIN
      _lucro_base := CASE 
        WHEN _projeto.base_calculo_investidor = 'LUCRO_BRUTO' THEN _lucro_bruto 
        ELSE _lucro_liquido 
      END;

      IF _lucro_base > 0 THEN
        _valor_participacao := _lucro_base * (_projeto.percentual_investidor / 100);

        INSERT INTO participacao_ciclos (
          user_id, projeto_id, ciclo_id, investidor_id,
          percentual_aplicado, base_calculo, lucro_base,
          valor_participacao, status, data_apuracao
        ) VALUES (
          _user_id, _ciclo.projeto_id, _ciclo_id, _projeto.investidor_id,
          _projeto.percentual_investidor, COALESCE(_projeto.base_calculo_investidor, 'LUCRO_LIQUIDO'),
          _lucro_base, _valor_participacao, 'A_PAGAR', NOW()
        );
      END IF;
    END;
  END IF;

  -- ========== AUDITORIA ==========
  INSERT INTO audit_logs (
    actor_user_id, workspace_id, entity_type, entity_id, entity_name, action,
    before_data, after_data, metadata
  ) VALUES (
    _user_id, _workspace_id, 'projeto_ciclo', _ciclo_id,
    format('Ciclo %s', _ciclo.numero_ciclo), 'CLOSE',
    jsonb_build_object('status', _ciclo.status, 'data_fim_real', _ciclo.data_fim_real),
    jsonb_build_object('status', 'FECHADO', 'data_fim_real', CURRENT_DATE, 'lucro_bruto', _lucro_bruto, 'lucro_liquido', _lucro_liquido),
    jsonb_build_object(
      'projeto_id', _ciclo.projeto_id, 'numero_ciclo', _ciclo.numero_ciclo,
      'tipo_gatilho', _ciclo.tipo_gatilho, 'qtd_apostas', _qtd_apostas,
      'volume_apostado', _volume_apostado, 'roi', _roi,
      'perdas_confirmadas', _perdas_confirmadas, 'excedente', _excedente,
      'valor_participacao_investidor', _valor_participacao
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'metrics', jsonb_build_object(
      'qtd_apostas', _qtd_apostas,
      'volume', _volume_apostado,
      'lucro_bruto', _lucro_bruto,
      'lucro_liquido', _lucro_liquido,
      'roi', _roi,
      'perdas_confirmadas', _perdas_confirmadas,
      'excedente', _excedente,
      'valor_participacao', _valor_participacao
    )
  );
END;
$$;

-- Fix check_cycle_closing_requirements to use apostas_unificada
CREATE OR REPLACE FUNCTION public.check_cycle_closing_requirements(_ciclo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ciclo record;
  _apostas_abertas int;
  _perdas_pendentes int;
  _metrics record;
BEGIN
  SELECT * INTO _ciclo FROM projeto_ciclos WHERE id = _ciclo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Ciclo não encontrado');
  END IF;

  SELECT COUNT(*) INTO _apostas_abertas
  FROM apostas_unificada
  WHERE projeto_id = _ciclo.projeto_id
    AND data_aposta >= _ciclo.data_inicio
    AND data_aposta <= _ciclo.data_fim_prevista
    AND status = 'PENDENTE';

  SELECT COUNT(*) INTO _perdas_pendentes
  FROM projeto_perdas
  WHERE projeto_id = _ciclo.projeto_id
    AND data_registro >= _ciclo.data_inicio
    AND data_registro <= _ciclo.data_fim_prevista
    AND status = 'PENDENTE';

  SELECT 
    COUNT(*) as qtd,
    COALESCE(SUM(COALESCE(stake_total, stake, 0)), 0) as volume,
    COALESCE(SUM(COALESCE(lucro_prejuizo, 0)), 0) as lucro
  INTO _metrics
  FROM apostas_unificada
  WHERE projeto_id = _ciclo.projeto_id
    AND data_aposta >= _ciclo.data_inicio
    AND data_aposta <= _ciclo.data_fim_prevista
    AND status = 'LIQUIDADA';

  RETURN jsonb_build_object(
    'ciclo_id', _ciclo_id,
    'status', _ciclo.status,
    'can_close', _apostas_abertas = 0 AND _perdas_pendentes = 0,
    'pendencias', jsonb_build_object(
      'apostas_abertas', _apostas_abertas,
      'perdas_pendentes', _perdas_pendentes
    ),
    'preview_metrics', jsonb_build_object(
      'qtd_apostas', _metrics.qtd,
      'volume', _metrics.volume,
      'lucro_preview', _metrics.lucro
    )
  );
END;
$$;
