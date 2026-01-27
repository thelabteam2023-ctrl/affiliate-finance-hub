
-- Corrigir RPC reset_projeto_operacional_seguro para usar bonus_amount em vez de valor_creditado
CREATE OR REPLACE FUNCTION public.reset_projeto_operacional_seguro(p_projeto_id uuid, p_user_id uuid, p_dry_run boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
  v_resultado JSONB := '{"modulos": [], "bookmakers_afetados": [], "erros": []}'::JSONB;
  v_modulo_info JSONB;
  v_bookmaker RECORD;
  v_aposta RECORD;
  v_cashback RECORD;
  v_giro RECORD;
  v_bonus RECORD;
  v_total_estornos INTEGER := 0;
  v_total_apostas INTEGER := 0;
  v_total_cashback INTEGER := 0;
  v_total_giros INTEGER := 0;
  v_total_bonus INTEGER := 0;
BEGIN
  -- Validar projeto existe
  SELECT workspace_id INTO v_workspace_id
  FROM projetos
  WHERE id = p_projeto_id;
  
  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Projeto não encontrado');
  END IF;
  
  -- ============================================================
  -- MÓDULO 1: APOSTAS (apostas_unificada + apostas_pernas)
  -- ============================================================
  FOR v_aposta IN
    SELECT 
      a.id,
      a.bookmaker_id,
      a.lucro_prejuizo,
      a.pl_consolidado,
      a.moeda_operacao,
      a.stake,
      a.resultado,
      b.moeda as bookmaker_moeda
    FROM apostas_unificada a
    LEFT JOIN bookmakers b ON b.id = a.bookmaker_id
    WHERE a.projeto_id = p_projeto_id
      AND a.status = 'LIQUIDADA'
      AND a.bookmaker_id IS NOT NULL
  LOOP
    v_total_apostas := v_total_apostas + 1;
    
    IF NOT p_dry_run THEN
      -- Gerar estorno no ledger (inverte o lucro/prejuízo)
      INSERT INTO cash_ledger (
        tipo_transacao,
        valor,
        moeda,
        workspace_id,
        user_id,
        origem_bookmaker_id,
        descricao,
        data_transacao,
        status,
        tipo_moeda,
        valor_origem,
        referencia_transacao_id
      ) VALUES (
        'APOSTA_REVERSAO',
        ABS(COALESCE(v_aposta.lucro_prejuizo, 0)),
        COALESCE(v_aposta.moeda_operacao, v_aposta.bookmaker_moeda, 'BRL'),
        v_workspace_id,
        p_user_id,
        v_aposta.bookmaker_id,
        'Reset operacional: reversão aposta ' || v_aposta.id,
        CURRENT_DATE,
        'CONFIRMADO',
        'FIAT',
        ABS(COALESCE(v_aposta.lucro_prejuizo, 0)),
        v_aposta.id::TEXT
      );
      v_total_estornos := v_total_estornos + 1;
    END IF;
  END LOOP;
  
  -- Deletar pernas primeiro (FK)
  IF NOT p_dry_run THEN
    DELETE FROM apostas_pernas 
    WHERE aposta_id IN (SELECT id FROM apostas_unificada WHERE projeto_id = p_projeto_id);
    
    -- Deletar apostas
    DELETE FROM apostas_unificada WHERE projeto_id = p_projeto_id;
  END IF;
  
  v_modulo_info := jsonb_build_object(
    'modulo', 'apostas',
    'registros', v_total_apostas,
    'estornos_gerados', CASE WHEN p_dry_run THEN 0 ELSE v_total_apostas END
  );
  v_resultado := jsonb_set(v_resultado, '{modulos}', v_resultado->'modulos' || v_modulo_info);
  
  -- ============================================================
  -- MÓDULO 2: CASHBACK MANUAL
  -- ============================================================
  FOR v_cashback IN
    SELECT 
      c.id,
      c.bookmaker_id,
      c.valor,
      c.moeda_operacao,
      b.moeda as bookmaker_moeda
    FROM cashback_manual c
    LEFT JOIN bookmakers b ON b.id = c.bookmaker_id
    WHERE c.projeto_id = p_projeto_id
      AND c.bookmaker_id IS NOT NULL
  LOOP
    v_total_cashback := v_total_cashback + 1;
    
    IF NOT p_dry_run THEN
      INSERT INTO cash_ledger (
        tipo_transacao,
        valor,
        moeda,
        workspace_id,
        user_id,
        origem_bookmaker_id,
        descricao,
        data_transacao,
        status,
        tipo_moeda,
        valor_origem,
        referencia_transacao_id
      ) VALUES (
        'CASHBACK_ESTORNO',
        ABS(v_cashback.valor),
        COALESCE(v_cashback.moeda_operacao, v_cashback.bookmaker_moeda, 'BRL'),
        v_workspace_id,
        p_user_id,
        v_cashback.bookmaker_id,
        'Reset operacional: estorno cashback ' || v_cashback.id,
        CURRENT_DATE,
        'CONFIRMADO',
        'FIAT',
        ABS(v_cashback.valor),
        v_cashback.id::TEXT
      );
      v_total_estornos := v_total_estornos + 1;
    END IF;
  END LOOP;
  
  IF NOT p_dry_run THEN
    DELETE FROM cashback_manual WHERE projeto_id = p_projeto_id;
  END IF;
  
  v_modulo_info := jsonb_build_object(
    'modulo', 'cashback_manual',
    'registros', v_total_cashback,
    'estornos_gerados', CASE WHEN p_dry_run THEN 0 ELSE v_total_cashback END
  );
  v_resultado := jsonb_set(v_resultado, '{modulos}', v_resultado->'modulos' || v_modulo_info);
  
  -- ============================================================
  -- MÓDULO 3: GIROS GRÁTIS
  -- ============================================================
  FOR v_giro IN
    SELECT 
      g.id,
      g.bookmaker_id,
      g.valor_retorno,
      b.moeda as bookmaker_moeda
    FROM giros_gratis g
    LEFT JOIN bookmakers b ON b.id = g.bookmaker_id
    WHERE g.projeto_id = p_projeto_id
      AND g.status = 'confirmado'
      AND g.bookmaker_id IS NOT NULL
      AND COALESCE(g.valor_retorno, 0) > 0
  LOOP
    v_total_giros := v_total_giros + 1;
    
    IF NOT p_dry_run THEN
      INSERT INTO cash_ledger (
        tipo_transacao,
        valor,
        moeda,
        workspace_id,
        user_id,
        origem_bookmaker_id,
        descricao,
        data_transacao,
        status,
        tipo_moeda,
        valor_origem,
        referencia_transacao_id
      ) VALUES (
        'GIRO_GRATIS_ESTORNO',
        ABS(v_giro.valor_retorno),
        COALESCE(v_giro.bookmaker_moeda, 'BRL'),
        v_workspace_id,
        p_user_id,
        v_giro.bookmaker_id,
        'Reset operacional: estorno giro grátis ' || v_giro.id,
        CURRENT_DATE,
        'CONFIRMADO',
        'FIAT',
        ABS(v_giro.valor_retorno),
        v_giro.id::TEXT
      );
      v_total_estornos := v_total_estornos + 1;
    END IF;
  END LOOP;
  
  IF NOT p_dry_run THEN
    DELETE FROM giros_gratis WHERE projeto_id = p_projeto_id;
  END IF;
  
  v_modulo_info := jsonb_build_object(
    'modulo', 'giros_gratis',
    'registros', v_total_giros,
    'estornos_gerados', CASE WHEN p_dry_run THEN 0 ELSE v_total_giros END
  );
  v_resultado := jsonb_set(v_resultado, '{modulos}', v_resultado->'modulos' || v_modulo_info);
  
  -- ============================================================
  -- MÓDULO 4: BÔNUS (project_bookmaker_link_bonuses)
  -- Corrigido: usar bonus_amount em vez de valor_creditado
  -- ============================================================
  FOR v_bonus IN
    SELECT 
      bl.id,
      bl.bookmaker_id,
      bl.bonus_amount,
      b.moeda as bookmaker_moeda
    FROM project_bookmaker_link_bonuses bl
    JOIN bookmakers b ON b.id = bl.bookmaker_id
    WHERE b.projeto_id = p_projeto_id
      AND bl.status = 'creditado'
      AND COALESCE(bl.bonus_amount, 0) > 0
  LOOP
    v_total_bonus := v_total_bonus + 1;
    
    IF NOT p_dry_run THEN
      INSERT INTO cash_ledger (
        tipo_transacao,
        valor,
        moeda,
        workspace_id,
        user_id,
        origem_bookmaker_id,
        descricao,
        data_transacao,
        status,
        tipo_moeda,
        valor_origem,
        referencia_transacao_id
      ) VALUES (
        'BONUS_ESTORNO',
        ABS(v_bonus.bonus_amount),
        COALESCE(v_bonus.bookmaker_moeda, 'BRL'),
        v_workspace_id,
        p_user_id,
        v_bonus.bookmaker_id,
        'Reset operacional: estorno bônus ' || v_bonus.id,
        CURRENT_DATE,
        'CONFIRMADO',
        'FIAT',
        ABS(v_bonus.bonus_amount),
        v_bonus.id::TEXT
      );
      v_total_estornos := v_total_estornos + 1;
    END IF;
  END LOOP;
  
  IF NOT p_dry_run THEN
    DELETE FROM project_bookmaker_link_bonuses 
    WHERE bookmaker_id IN (SELECT id FROM bookmakers WHERE projeto_id = p_projeto_id);
  END IF;
  
  v_modulo_info := jsonb_build_object(
    'modulo', 'bonus',
    'registros', v_total_bonus,
    'estornos_gerados', CASE WHEN p_dry_run THEN 0 ELSE v_total_bonus END
  );
  v_resultado := jsonb_set(v_resultado, '{modulos}', v_resultado->'modulos' || v_modulo_info);
  
  -- ============================================================
  -- RECÁLCULO DE SALDOS (apenas se não for dry_run)
  -- ============================================================
  IF NOT p_dry_run THEN
    FOR v_bookmaker IN
      SELECT id, nome FROM bookmakers WHERE projeto_id = p_projeto_id
    LOOP
      PERFORM recalcular_saldo_bookmaker(v_bookmaker.id);
      
      v_resultado := jsonb_set(
        v_resultado, 
        '{bookmakers_afetados}', 
        v_resultado->'bookmakers_afetados' || jsonb_build_object('id', v_bookmaker.id, 'nome', v_bookmaker.nome)
      );
    END LOOP;
  END IF;
  
  -- ============================================================
  -- RESULTADO FINAL
  -- ============================================================
  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'projeto_id', p_projeto_id,
    'total_estornos_gerados', v_total_estornos,
    'resumo', jsonb_build_object(
      'apostas', v_total_apostas,
      'cashback', v_total_cashback,
      'giros_gratis', v_total_giros,
      'bonus', v_total_bonus
    ),
    'modulos', v_resultado->'modulos',
    'bookmakers_afetados', v_resultado->'bookmakers_afetados',
    'mensagem', CASE 
      WHEN p_dry_run THEN 'Simulação concluída. Nenhuma alteração foi feita.'
      ELSE 'Reset operacional executado com sucesso. ' || v_total_estornos || ' estornos gerados.'
    END
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM,
    'error_detail', SQLSTATE
  );
END;
$function$;
