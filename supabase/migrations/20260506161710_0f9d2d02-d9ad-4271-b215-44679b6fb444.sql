-- 1. Adicionar colunas de override (repetindo caso falhou antes, mas usando IF NOT EXISTS)
ALTER TABLE public.apostas_unificada 
ADD COLUMN IF NOT EXISTS is_manual_override BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS manual_override_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS manual_override_by UUID,
ADD COLUMN IF NOT EXISTS manual_override_reason TEXT;

-- 2. Atualizar a trigger de proteção
CREATE OR REPLACE FUNCTION public.fn_apostas_unificada_arbitragem_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ctx text;
  v_changed_resultado boolean;
  v_changed_lp boolean;
  v_changed_status_liquidada boolean;
BEGIN
  -- Aplica somente a registros de arbitragem
  IF NEW.forma_registro <> 'ARBITRAGEM' THEN
    RETURN NEW;
  END IF;

  -- Detectar mudanças relevantes
  v_changed_resultado :=
    (NEW.resultado IS DISTINCT FROM OLD.resultado);
  v_changed_lp :=
    (NEW.lucro_prejuizo IS DISTINCT FROM OLD.lucro_prejuizo)
    OR (NEW.lucro_prejuizo_brl_referencia IS DISTINCT FROM OLD.lucro_prejuizo_brl_referencia)
    OR (NEW.pl_consolidado IS DISTINCT FROM OLD.pl_consolidado);
  v_changed_status_liquidada :=
    (NEW.status IS DISTINCT FROM OLD.status)
    AND (NEW.status = 'LIQUIDADA' OR OLD.status = 'LIQUIDADA');

  IF NOT (v_changed_resultado OR v_changed_lp OR v_changed_status_liquidada) THEN
    RETURN NEW;
  END IF;

  -- PERMISSÃO 1: Se o override está sendo ATIVADO ou já está ATIVO, permite o UPDATE.
  IF NEW.is_manual_override = true THEN
    RETURN NEW;
  END IF;

  -- PERMISSÃO 2: Verificar contexto autorizado (setado por funções internas como fn_recalc_pai_surebet)
  BEGIN
    v_ctx := current_setting('app.surebet_recalc_context', true);
  EXCEPTION WHEN OTHERS THEN
    v_ctx := NULL;
  END;

  IF v_ctx = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Bloqueio de integridade Surebet: UPDATE direto de resultado/lucro/status em apostas_unificada (id=%) não é permitido. '
    'Surebets devem ser liquidadas via RPC ou usando o modo Manual Override. '
    'Origem do problema: provável uso de UPDATE manual fora do fluxo controlado.',
    NEW.id
    USING ERRCODE = 'check_violation';
END;
$function$;

-- 3. Atualizar fn_recalc_pai_surebet
CREATE OR REPLACE FUNCTION public.fn_recalc_pai_surebet(p_surebet_id uuid)
 RETURNS TABLE(todas_liquidadas boolean, lucro_total numeric, stake_total numeric, resultado_geral text, is_multicurrency boolean, pl_consolidado numeric, stake_consolidado numeric, consolidation_currency text)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_moeda_consolidacao TEXT;
  v_entry RECORD;
  v_rate NUMERIC;
  v_todas_liquidadas BOOLEAN := true;
  v_lucro_total_calc NUMERIC := 0;
  v_stake_total_calc NUMERIC := 0;
  v_is_multicurrency_calc BOOLEAN := false;
  v_rates JSONB;
  v_brl_rate_from NUMERIC;
  v_brl_rate_to NUMERIC;
  v_res_geral TEXT;
  v_is_override BOOLEAN;
  v_current_lucro NUMERIC;
  v_current_res TEXT;
  v_projeto_id UUID;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  
  -- Verificar se existe override manual e pegar projeto_id
  SELECT is_manual_override, lucro_prejuizo, resultado, projeto_id
  INTO v_is_override, v_current_lucro, v_current_res, v_projeto_id
  FROM public.apostas_unificada 
  WHERE id = p_surebet_id;

  SELECT 
    proj.moeda_consolidacao,
    jsonb_build_object(
      'USD', COALESCE(proj.cotacao_trabalho, 1),
      'EUR', COALESCE(proj.cotacao_trabalho_eur, 1),
      'GBP', COALESCE(proj.cotacao_trabalho_gbp, 1),
      'MYR', COALESCE(proj.cotacao_trabalho_myr, 1),
      'MXN', COALESCE(proj.cotacao_trabalho_mxn, 1),
      'ARS', COALESCE(proj.cotacao_trabalho_ars, 1),
      'COP', COALESCE(proj.cotacao_trabalho_cop, 1),
      'BRL', 1
    )
  INTO v_moeda_consolidacao, v_rates
  FROM public.projetos proj
  WHERE proj.id = v_projeto_id;

  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  SELECT COALESCE(bool_and(ap.resultado IS NOT NULL AND ap.resultado != 'PENDENTE'), false)
  INTO v_todas_liquidadas
  FROM public.apostas_pernas ap
  WHERE ap.aposta_id = p_surebet_id;

  FOR v_entry IN
    SELECT ae.moeda, ae.stake, ae.odd, ap.resultado, ae.fonte_saldo
    FROM public.apostas_perna_entradas ae
    JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
    WHERE ap.aposta_id = p_surebet_id
  LOOP
    IF v_entry.moeda != v_moeda_consolidacao THEN
      v_is_multicurrency_calc := true;
    END IF;

    v_brl_rate_from := COALESCE((v_rates->>UPPER(v_entry.moeda))::NUMERIC, 1);
    v_brl_rate_to := COALESCE((v_rates->>UPPER(v_moeda_consolidacao))::NUMERIC, 1);

    v_rate := CASE 
      WHEN v_entry.moeda = v_moeda_consolidacao THEN 1 
      WHEN v_brl_rate_to > 0 THEN v_brl_rate_from / v_brl_rate_to 
      ELSE 1 
    END;

    DECLARE
      v_entry_lucro NUMERIC := 0;
      v_is_fb BOOLEAN := (v_entry.fonte_saldo = 'FREEBET');
    BEGIN
      CASE v_entry.resultado
        WHEN 'GREEN' THEN 
          v_entry_lucro := CASE WHEN v_is_fb THEN v_entry.stake * (v_entry.odd - 1) ELSE (v_entry.stake * v_entry.odd) - v_entry.stake END;
        WHEN 'RED' THEN 
          v_entry_lucro := CASE WHEN v_is_fb THEN 0 ELSE -v_entry.stake END;
        WHEN 'VOID' THEN 
          v_entry_lucro := 0;
        WHEN 'MEIO_GREEN' THEN 
          v_entry_lucro := CASE WHEN v_is_fb THEN (v_entry.stake * (v_entry.odd - 1)) / 2 ELSE (v_entry.stake + (v_entry.stake * (v_entry.odd - 1) / 2)) - v_entry.stake END;
        WHEN 'MEIO_RED' THEN 
          v_entry_lucro := CASE WHEN v_is_fb THEN 0 ELSE -(v_entry.stake / 2) END;
        ELSE 
          v_entry_lucro := 0; 
      END CASE;

      v_lucro_total_calc := v_lucro_total_calc + v_entry_lucro * v_rate;
      v_stake_total_calc := v_stake_total_calc + (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END) * v_rate;
    END;
  END LOOP;

  v_lucro_total_calc := ROUND(v_lucro_total_calc, 4);
  v_stake_total_calc := ROUND(v_stake_total_calc, 4);

  -- Se houver override, mantemos os valores atuais da aposta unificada
  IF v_is_override = true THEN
    v_lucro_total_calc := v_current_lucro;
    v_res_geral := v_current_res;
  ELSE
    v_res_geral := CASE 
      WHEN v_todas_liquidadas AND v_lucro_total_calc > 0.001 THEN 'GREEN'
      WHEN v_todas_liquidadas AND v_lucro_total_calc < -0.001 THEN 'RED'
      WHEN v_todas_liquidadas THEN 'VOID'
      ELSE 'PENDENTE'
    END;
  END IF;

  RETURN QUERY SELECT
    v_todas_liquidadas,
    v_lucro_total_calc,
    v_stake_total_calc,
    v_res_geral,
    v_is_multicurrency_calc,
    v_lucro_total_calc,
    v_stake_total_calc,
    v_moeda_consolidacao;
END;
$function$;

-- 4. Criar RPC para Override Controlado
CREATE OR REPLACE FUNCTION public.rpc_override_surebet_v1(
  p_aposta_id UUID,
  p_novo_resultado TEXT,
  p_novo_lucro NUMERIC,
  p_perna_id_ajuste UUID,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_old_lucro NUMERIC;
  v_delta NUMERIC;
  v_workspace_id UUID;
  v_projeto_id UUID;
  v_bookmaker_id UUID;
  v_moeda TEXT;
  v_user_id UUID := auth.uid();
  v_forma_reg TEXT;
BEGIN
  -- 1. Validar aposta
  SELECT workspace_id, projeto_id, lucro_prejuizo, forma_registro
  INTO v_workspace_id, v_projeto_id, v_old_lucro, v_forma_reg
  FROM public.apostas_unificada
  WHERE id = p_aposta_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
  END IF;

  IF v_forma_reg <> 'ARBITRAGEM' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Override manual só é permitido para Surebets (ARBITRAGEM)');
  END IF;

  -- 2. Calcular Delta
  v_delta := p_novo_lucro - COALESCE(v_old_lucro, 0);

  -- 3. Identificar casa/moeda para o ajuste do Ledger
  IF p_perna_id_ajuste IS NOT NULL THEN
    SELECT bookmaker_id, moeda INTO v_bookmaker_id, v_moeda
    FROM public.apostas_pernas
    WHERE id = p_perna_id_ajuste AND aposta_id = p_aposta_id;
  ELSE
    SELECT bookmaker_id, moeda INTO v_bookmaker_id, v_moeda
    FROM public.apostas_pernas
    WHERE aposta_id = p_aposta_id
    ORDER BY ordem ASC LIMIT 1;
  END IF;

  IF v_bookmaker_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Não foi possível identificar uma casa para o ajuste financeiro');
  END IF;

  -- 4. Criar Evento Financeiro de Ajuste (Ledger) se houver delta
  IF ABS(v_delta) > 0.0001 THEN
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      origem, valor, moeda, idempotency_key, descricao, created_by, metadata
    ) VALUES (
      v_bookmaker_id, p_aposta_id, v_workspace_id, 'AJUSTE', 'OVERRIDE',
      'manual_override', v_delta, v_moeda,
      'override_' || p_aposta_id || '_' || extract(epoch from now()),
      'Ajuste manual de lucro (Surebet): ' || p_motivo,
      v_user_id,
      jsonb_build_object('old_lucro', v_old_lucro, 'new_lucro', p_novo_lucro, 'delta', v_delta, 'perna_id', p_perna_id_ajuste)
    );
  END IF;

  -- 5. Atualizar Aposta Unificada
  UPDATE public.apostas_unificada SET
    is_manual_override = true,
    manual_override_at = NOW(),
    manual_override_by = v_user_id,
    manual_override_reason = p_motivo,
    lucro_prejuizo = p_novo_lucro,
    pl_consolidado = p_novo_lucro,
    resultado = p_novo_resultado,
    updated_at = NOW()
  WHERE id = p_aposta_id;

  RETURN jsonb_build_object(
    'success', true, 
    'message', 'Override aplicado com sucesso', 
    'delta', v_delta,
    'house_adjusted', v_bookmaker_id
  );
END;
$function$;
