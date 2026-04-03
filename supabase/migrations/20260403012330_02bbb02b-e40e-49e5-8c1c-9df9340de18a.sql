
CREATE OR REPLACE FUNCTION public.close_project_cycle(
  _ciclo_id uuid,
  _workspace_id uuid,
  _force_close boolean DEFAULT false,
  _observacoes text DEFAULT NULL
)
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
  _lucro_apostas numeric;
  _lucro_bruto numeric;
  _lucro_liquido numeric;
  _volume_apostado numeric;
  _qtd_apostas int;
  _roi numeric;
  _ticket_medio numeric;
  _perdas_confirmadas numeric;
  _cashback_total numeric;
  _giros_gratis_total numeric;
  _excedente numeric;
  _observacoes_finais text;
  _valor_participacao numeric;
  _start_utc timestamptz;
  _end_utc timestamptz;
  _op_projeto record;
  _valor_pagamento_operador numeric;
  _lucro_base_operador numeric;
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

  -- Período do ciclo em UTC
  _start_utc := (_ciclo.data_inicio::text || ' 00:00:00')::timestamptz;
  _end_utc := (_ciclo.data_fim_prevista::text || ' 23:59:59.999999')::timestamptz;

  -- Apostas abertas
  SELECT COUNT(*) INTO _apostas_abertas
  FROM apostas_unificada
  WHERE projeto_id = _ciclo.projeto_id
    AND workspace_id = _workspace_id
    AND data_aposta >= _start_utc
    AND data_aposta <= _end_utc
    AND status = 'ABERTA';

  IF _apostas_abertas > 0 AND NOT _force_close THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', format('Existem %s apostas abertas no período', _apostas_abertas),
      'apostas_abertas', _apostas_abertas
    );
  END IF;

  -- Perdas pendentes
  SELECT COUNT(*) INTO _perdas_pendentes
  FROM apostas_unificada
  WHERE projeto_id = _ciclo.projeto_id
    AND workspace_id = _workspace_id
    AND data_aposta >= _start_utc
    AND data_aposta <= _end_utc
    AND status = 'LIQUIDADA'
    AND resultado = 'PERDA'
    AND COALESCE(lucro_prejuizo, 0) = 0;

  -- Lucro das apostas
  SELECT COALESCE(SUM(lucro_prejuizo), 0)
  INTO _lucro_apostas
  FROM apostas_unificada
  WHERE projeto_id = _ciclo.projeto_id
    AND workspace_id = _workspace_id
    AND data_aposta >= _start_utc
    AND data_aposta <= _end_utc
    AND status = 'LIQUIDADA';

  -- Volume e qtd
  SELECT COALESCE(SUM(COALESCE(stake_real, stake, 0)), 0), COUNT(*)
  INTO _volume_apostado, _qtd_apostas
  FROM apostas_unificada
  WHERE projeto_id = _ciclo.projeto_id
    AND workspace_id = _workspace_id
    AND data_aposta >= _start_utc
    AND data_aposta <= _end_utc
    AND status = 'LIQUIDADA';

  -- Cashback
  SELECT COALESCE(SUM(
    CASE WHEN tipo_transacao IN ('CASHBACK', 'GIRO_GRATIS') THEN valor ELSE 0 END
  ), 0)
  INTO _cashback_total
  FROM cash_ledger
  WHERE projeto_id_snapshot = _ciclo.projeto_id
    AND workspace_id = _workspace_id
    AND data_transacao >= _start_utc
    AND data_transacao <= _end_utc
    AND tipo_transacao = 'CASHBACK'
    AND status = 'CONFIRMADO';

  -- Giros grátis
  SELECT COALESCE(SUM(valor), 0)
  INTO _giros_gratis_total
  FROM cash_ledger
  WHERE projeto_id_snapshot = _ciclo.projeto_id
    AND workspace_id = _workspace_id
    AND data_transacao >= _start_utc
    AND data_transacao <= _end_utc
    AND tipo_transacao = 'GIRO_GRATIS'
    AND status = 'CONFIRMADO';

  -- Perdas confirmadas (do ledger)
  SELECT COALESCE(SUM(valor), 0)
  INTO _perdas_confirmadas
  FROM cash_ledger
  WHERE projeto_id_snapshot = _ciclo.projeto_id
    AND workspace_id = _workspace_id
    AND data_transacao >= _start_utc
    AND data_transacao <= _end_utc
    AND tipo_transacao = 'PERDA_OPERACIONAL'
    AND status = 'CONFIRMADO';

  -- Lucro bruto = lucro apostas + cashback + giros
  _lucro_bruto := _lucro_apostas + _cashback_total + _giros_gratis_total;

  -- Lucro líquido = bruto - perdas
  _lucro_liquido := _lucro_bruto - _perdas_confirmadas;

  -- ROI
  _roi := CASE WHEN _volume_apostado > 0 THEN (_lucro_bruto / _volume_apostado * 100) ELSE 0 END;
  _ticket_medio := CASE WHEN _qtd_apostas > 0 THEN (_volume_apostado / _qtd_apostas) ELSE 0 END;

  -- Excedente
  _excedente := 0;
  IF _ciclo.tipo_gatilho != 'TEMPO' AND _ciclo.meta_volume IS NOT NULL THEN
    _excedente := GREATEST(0, _volume_apostado - _ciclo.meta_volume);
  END IF;

  -- Observações
  _observacoes_finais := COALESCE(_observacoes, '');

  -- Fechar ciclo
  UPDATE projeto_ciclos
  SET status = 'FECHADO',
      data_fechamento = NOW(),
      lucro_bruto = _lucro_bruto,
      lucro_liquido = _lucro_liquido,
      volume_apostado = _volume_apostado,
      qtd_apostas = _qtd_apostas,
      roi = _roi,
      ticket_medio = _ticket_medio,
      perdas_confirmadas = _perdas_confirmadas,
      cashback_total = _cashback_total,
      giros_gratis_total = _giros_gratis_total,
      excedente = _excedente,
      observacoes = _observacoes_finais
  WHERE id = _ciclo_id;

  -- =====================================================================
  -- INVESTOR PARTICIPATION (multi-investor model + legacy single-investor)
  -- =====================================================================
  _valor_participacao := 0;
  
  -- First try multi-investor model (projeto_investidores)
  DECLARE
    _pi record;
    _inv_tipo text;
    _inv_lucro_base numeric;
    _inv_valor numeric;
    _inv_status text;
    _found_multi boolean := false;
  BEGIN
    FOR _pi IN 
      SELECT pi.investidor_id, pi.percentual_participacao, pi.base_calculo
      FROM projeto_investidores pi
      WHERE pi.projeto_id = _ciclo.projeto_id AND pi.ativo = true
    LOOP
      _found_multi := true;
      
      -- Determine lucro base per investor config
      _inv_lucro_base := CASE
        WHEN COALESCE(_pi.base_calculo, 'LUCRO_LIQUIDO') = 'LUCRO_BRUTO' THEN _lucro_bruto
        ELSE _lucro_liquido
      END;
      
      -- Determine investor type for status
      SELECT COALESCE(i.tipo, 'externo') INTO _inv_tipo
      FROM investidores i WHERE i.id = _pi.investidor_id;
      
      _inv_status := CASE WHEN _inv_tipo = 'proprio' THEN 'RECONHECIDO' ELSE 'A_PAGAR' END;
      
      IF _inv_lucro_base > 0 THEN
        _inv_valor := _inv_lucro_base * (_pi.percentual_participacao / 100);
        _valor_participacao := _valor_participacao + _inv_valor;
        
        INSERT INTO participacao_ciclos (
          user_id, workspace_id, projeto_id, ciclo_id, investidor_id,
          percentual_aplicado, base_calculo, lucro_base,
          valor_participacao, status, data_apuracao
        ) VALUES (
          _user_id, _workspace_id, _ciclo.projeto_id, _ciclo_id, _pi.investidor_id,
          _pi.percentual_participacao, COALESCE(_pi.base_calculo, 'LUCRO_LIQUIDO'),
          _inv_lucro_base, _inv_valor, _inv_status, NOW()
        )
        ON CONFLICT ON CONSTRAINT uq_participacao_ciclo
        DO UPDATE SET
          percentual_aplicado = EXCLUDED.percentual_aplicado,
          base_calculo = EXCLUDED.base_calculo,
          lucro_base = EXCLUDED.lucro_base,
          valor_participacao = EXCLUDED.valor_participacao,
          status = EXCLUDED.status,
          data_apuracao = EXCLUDED.data_apuracao,
          updated_at = NOW();
      ELSE
        -- Zero or negative profit: update existing record with zero values
        UPDATE participacao_ciclos
        SET lucro_base = _inv_lucro_base,
            valor_participacao = 0,
            status = _inv_status,
            updated_at = NOW()
        WHERE ciclo_id = _ciclo_id AND investidor_id = _pi.investidor_id;
      END IF;
    END LOOP;
    
    -- Fallback to legacy single-investor if no multi-investor records
    IF NOT _found_multi AND _projeto.investidor_id IS NOT NULL AND _projeto.percentual_investidor > 0 THEN
      DECLARE
        _lucro_base numeric;
      BEGIN
        _lucro_base := CASE
          WHEN _projeto.base_calculo_investidor = 'LUCRO_BRUTO' THEN _lucro_bruto
          ELSE _lucro_liquido
        END;
        
        -- Determine investor type
        SELECT COALESCE(i.tipo, 'externo') INTO _inv_tipo
        FROM investidores i WHERE i.id = _projeto.investidor_id;
        
        _inv_status := CASE WHEN _inv_tipo = 'proprio' THEN 'RECONHECIDO' ELSE 'A_PAGAR' END;

        IF _lucro_base > 0 THEN
          _valor_participacao := _lucro_base * (_projeto.percentual_investidor / 100);

          INSERT INTO participacao_ciclos (
            user_id, workspace_id, projeto_id, ciclo_id, investidor_id,
            percentual_aplicado, base_calculo, lucro_base,
            valor_participacao, status, data_apuracao
          ) VALUES (
            _user_id, _workspace_id, _ciclo.projeto_id, _ciclo_id, _projeto.investidor_id,
            _projeto.percentual_investidor, COALESCE(_projeto.base_calculo_investidor, 'LUCRO_LIQUIDO'),
            _lucro_base, _valor_participacao, _inv_status, NOW()
          )
          ON CONFLICT ON CONSTRAINT uq_participacao_ciclo
          DO UPDATE SET
            percentual_aplicado = EXCLUDED.percentual_aplicado,
            base_calculo = EXCLUDED.base_calculo,
            lucro_base = EXCLUDED.lucro_base,
            valor_participacao = EXCLUDED.valor_participacao,
            status = EXCLUDED.status,
            data_apuracao = EXCLUDED.data_apuracao,
            updated_at = NOW();
        END IF;
      END;
    END IF;
  END;

  -- =====================================================================
  -- OPERATOR PAYMENT
  -- =====================================================================
  _valor_pagamento_operador := 0;
  _lucro_base_operador := 0;
  FOR _op_projeto IN
    SELECT op.operador_id, op.percentual_comissao, op.base_calculo_comissao
    FROM operador_projetos op
    WHERE op.projeto_id = _ciclo.projeto_id AND op.ativo = true
  LOOP
    _lucro_base_operador := CASE
      WHEN _op_projeto.base_calculo_comissao = 'LUCRO_BRUTO' THEN _lucro_bruto
      ELSE _lucro_liquido
    END;

    IF _lucro_base_operador > 0 THEN
      _valor_pagamento_operador := _lucro_base_operador * (_op_projeto.percentual_comissao / 100);
    END IF;
  END LOOP;

  -- =====================================================================
  -- Create next cycle if applicable
  -- =====================================================================
  IF _ciclo.tipo_gatilho = 'TEMPO' THEN
    INSERT INTO projeto_ciclos (
      projeto_id, workspace_id, numero_ciclo,
      data_inicio, data_fim_prevista, status,
      tipo_gatilho, metrica_acumuladora
    )
    SELECT
      _ciclo.projeto_id, _workspace_id, _ciclo.numero_ciclo + 1,
      (_ciclo.data_fim_prevista + interval '1 day')::date,
      ((_ciclo.data_fim_prevista + interval '1 day')::date + (_ciclo.data_fim_prevista - _ciclo.data_inicio))::date,
      'EM_ANDAMENTO',
      _ciclo.tipo_gatilho, _ciclo.metrica_acumuladora
    WHERE NOT EXISTS (
      SELECT 1 FROM projeto_ciclos
      WHERE projeto_id = _ciclo.projeto_id
        AND numero_ciclo = _ciclo.numero_ciclo + 1
    );
  END IF;

  -- Audit log
  INSERT INTO audit_logs (
    actor_user_id, workspace_id, entity_type, entity_id,
    action, after_data
  ) VALUES (
    _user_id, _workspace_id, 'projeto_ciclo', _ciclo_id,
    'FECHAMENTO_CICLO',
    jsonb_build_object(
      'projeto_id', _ciclo.projeto_id, 'numero_ciclo', _ciclo.numero_ciclo,
      'tipo_gatilho', _ciclo.tipo_gatilho, 'qtd_apostas', _qtd_apostas,
      'volume_apostado', _volume_apostado, 'roi', _roi,
      'perdas_confirmadas', _perdas_confirmadas, 'excedente', _excedente,
      'cashback_total', _cashback_total, 'giros_gratis_total', _giros_gratis_total,
      'valor_participacao_investidor', _valor_participacao,
      'valor_pagamento_operador', _valor_pagamento_operador
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'data', jsonb_build_object(
      'ciclo_id', _ciclo_id,
      'numero_ciclo', _ciclo.numero_ciclo,
      'lucro_bruto', _lucro_bruto,
      'lucro_liquido', _lucro_liquido,
      'roi', _roi,
      'perdas_confirmadas', _perdas_confirmadas,
      'excedente', _excedente,
      'valor_participacao', _valor_participacao,
      'valor_pagamento_operador', _valor_pagamento_operador,
      'qtd_apostas', _qtd_apostas,
      'volume_apostado', _volume_apostado,
      'investidor_percentual', COALESCE(_projeto.percentual_investidor, 0)
    )
  );
END;
$$;
