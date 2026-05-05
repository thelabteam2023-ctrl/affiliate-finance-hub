-- 1. Limpeza estrutural (Garantir que não há redundância)
DO $$ 
BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'apostas_perna_entradas' AND column_name = 'aposta_id') THEN
        ALTER TABLE public.apostas_perna_entradas DROP COLUMN aposta_id;
    END IF;
END $$;

-- 2. Atualizar liquidar_aposta_v4
CREATE OR REPLACE FUNCTION public.liquidar_aposta_v4(p_aposta_id uuid, p_resultado text, p_lucro_prejuizo numeric DEFAULT NULL::numeric)
 RETURNS TABLE(success boolean, events_created integer, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_entry RECORD;
  v_events_count INTEGER := 0;
  v_payout_entry NUMERIC;
  v_is_perna_vencedora BOOLEAN;
  v_perna_resultado TEXT;
BEGIN
  SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  IF v_aposta.id IS NULL THEN RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT; RETURN; END IF;
  IF v_aposta.status = 'LIQUIDADA' THEN RETURN QUERY SELECT FALSE, 0, 'Aposta já liquidada'::TEXT; RETURN; END IF;

  -- 1. Se for ARBITRAGEM, a liquidação é feita no nível da perna
  IF p_resultado IN ('VOID', 'CANCELADA') THEN
    UPDATE public.apostas_pernas ap SET resultado = 'VOID' WHERE ap.aposta_id = p_aposta_id;
  END IF;

  -- 2. Processar cada entrada financeira
  FOR v_entry IN
    SELECT ae.*, ap.resultado as perna_resultado, ap.ordem as perna_ordem
    FROM public.apostas_perna_entradas ae
    JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
    WHERE ap.aposta_id = p_aposta_id
  LOOP
    v_perna_resultado := COALESCE(v_entry.perna_resultado, 'PENDENTE');
    
    -- Calcular Payout da Entrada
    v_payout_entry := 0;
    IF v_perna_resultado = 'GREEN' THEN
      v_payout_entry := v_entry.stake * v_entry.odd;
    ELSIF v_perna_resultado = 'MEIO_GREEN' THEN
      v_payout_entry := v_entry.stake + (v_entry.stake * (v_entry.odd - 1) / 2);
    ELSIF v_perna_resultado = 'VOID' THEN
      v_payout_entry := v_entry.stake;
    ELSIF v_perna_resultado = 'MEIO_RED' THEN
      v_payout_entry := v_entry.stake / 2;
    END IF;

    -- Registrar Payout se houver
    IF v_payout_entry > 0 THEN
      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, descricao, processed_at
      ) VALUES (
        v_entry.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
        CASE WHEN v_entry.fonte_saldo = 'FREEBET' THEN 'FREEBET_RETURN' ELSE 'PAYOUT' END,
        CASE WHEN v_entry.fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
        v_payout_entry, v_entry.moeda,
        'payout_' || p_aposta_id || '_entry' || v_entry.id,
        format('Retorno Entrada Perna %s (%s)', v_entry.perna_ordem, v_perna_resultado),
        NOW()
      );
      v_events_count := v_events_count + 1;
    END IF;
  END LOOP;

  -- 3. Atualizar Status Final
  PERFORM public.fn_recalc_pai_surebet(p_aposta_id);

  RETURN QUERY SELECT TRUE, v_events_count, 'Aposta liquidada com sucesso'::TEXT;
END;
$function$;

-- 3. Atualizar fn_recalc_pai_surebet
CREATE OR REPLACE FUNCTION public.fn_recalc_pai_surebet(p_surebet_id uuid)
 RETURNS TABLE(todas_liquidadas boolean, lucro_total numeric, stake_total numeric, resultado_geral text, is_multicurrency boolean, pl_consolidado numeric, stake_consolidado numeric, consolidation_currency text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  
  -- Obter configurações do projeto
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
  JOIN public.apostas_unificada au ON au.projeto_id = proj.id
  WHERE au.id = p_surebet_id;

  v_moeda_consolidacao := COALESCE(v_moeda_consolidacao, 'BRL');

  -- Verificar se todas as pernas lógicas estão liquidadas
  SELECT bool_and(ap.resultado IS NOT NULL AND ap.resultado != 'PENDENTE')
  INTO v_todas_liquidadas
  FROM public.apostas_pernas ap
  WHERE ap.aposta_id = p_surebet_id;

  -- Iterar por todas as entradas financeiras de todas as pernas desta surebet
  FOR v_entry IN
    SELECT 
      ae.moeda, ae.stake, ae.odd, ap.resultado,
      ae.stake_brl_referencia, ae.cotacao_snapshot
    FROM public.apostas_perna_entradas ae
    JOIN public.apostas_pernas ap ON ap.id = ae.perna_id
    WHERE ap.aposta_id = p_surebet_id
  LOOP
    IF v_entry.moeda != v_moeda_consolidacao THEN
      v_is_multicurrency_calc := true;
    END IF;

    -- Lógica de conversão
    v_brl_rate_from := COALESCE((v_rates->>UPPER(v_entry.moeda))::NUMERIC, 1);
    v_brl_rate_to := COALESCE((v_rates->>UPPER(v_moeda_consolidacao))::NUMERIC, 1);

    IF v_entry.moeda = v_moeda_consolidacao THEN
      v_rate := 1;
    ELSIF v_brl_rate_to > 0 THEN
      v_rate := v_brl_rate_from / v_brl_rate_to;
    ELSE
      v_rate := 1;
    END IF;

    DECLARE
      v_entry_payout NUMERIC := 0;
      v_entry_lucro NUMERIC := 0;
    BEGIN
      IF v_entry.resultado = 'GREEN' THEN
        v_entry_payout := v_entry.stake * v_entry.odd;
        v_entry_lucro := v_entry_payout - v_entry.stake;
      ELSIF v_entry.resultado = 'RED' THEN
        v_entry_lucro := -v_entry.stake;
      ELSIF v_entry.resultado = 'VOID' THEN
        v_entry_lucro := 0;
      ELSIF v_entry.resultado = 'MEIO_GREEN' THEN
        v_entry_payout := v_entry.stake + (v_entry.stake * (v_entry.odd - 1) / 2);
        v_entry_lucro := v_entry_payout - v_entry.stake;
      ELSIF v_entry.resultado = 'MEIO_RED' THEN
        v_entry_lucro := -(v_entry.stake / 2);
      ELSE
        v_entry_lucro := 0;
      END IF;

      v_lucro_total_calc := v_lucro_total_calc + v_entry_lucro * v_rate;
      v_stake_total_calc := v_stake_total_calc + v_entry.stake * v_rate;
    END;
  END LOOP;

  v_lucro_total_calc := ROUND(v_lucro_total_calc, 4);
  v_stake_total_calc := ROUND(v_stake_total_calc, 4);

  RETURN QUERY SELECT
    COALESCE(v_todas_liquidadas, false),
    v_lucro_total_calc,
    v_stake_total_calc,
    CASE 
      WHEN v_todas_liquidadas AND v_lucro_total_calc > 0 THEN 'GREEN'
      WHEN v_todas_liquidadas AND v_lucro_total_calc < 0 THEN 'RED'
      WHEN v_todas_liquidadas THEN 'VOID'
      ELSE NULL::TEXT
    END,
    v_is_multicurrency_calc,
    v_lucro_total_calc,
    v_stake_total_calc,
    v_moeda_consolidacao;
END;
$function$;

-- 4. Atualizar reverter_liquidacao_v4
CREATE OR REPLACE FUNCTION public.reverter_liquidacao_v4(p_aposta_id uuid)
 RETURNS TABLE(success boolean, message text, reversals_created integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
  v_count INTEGER := 0;
  v_had_orphan_result BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  SELECT * INTO v_aposta FROM public.apostas_unificada au WHERE au.id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT, 0;
    RETURN;
  END IF;
  
  v_had_orphan_result := (
    v_aposta.status = 'PENDENTE' 
    AND v_aposta.resultado IS NOT NULL 
    AND v_aposta.resultado <> 'PENDENTE'
  );

  IF v_aposta.status = 'LIQUIDADA' THEN
    FOR v_event IN 
      SELECT fe.* FROM public.financial_events fe
      WHERE fe.aposta_id = p_aposta_id 
        AND fe.tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
        AND NOT EXISTS (
          SELECT 1 FROM public.financial_events r 
          WHERE r.reversed_event_id = fe.id
        )
    LOOP
      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, reversed_event_id, descricao, 
        processed_at, created_by
      ) VALUES (
        v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
        -v_event.valor, v_event.moeda,
        'reversal_' || v_event.id::TEXT,
        v_event.id,
        'Reversão de liquidação', now(), auth.uid()
      );
      v_count := v_count + 1;
    END LOOP;
  ELSIF NOT v_had_orphan_result THEN
    RETURN QUERY SELECT FALSE, 'Aposta não está liquidada e não há resíduo a limpar'::TEXT, 0;
    RETURN;
  END IF;
  
  UPDATE public.apostas_unificada 
  SET status = 'PENDENTE',
      resultado = NULL,
      lucro_prejuizo = NULL,
      lucro_prejuizo_brl_referencia = NULL,
      pl_consolidado = NULL,
      retorno_consolidado = NULL,
      updated_at = now()
  WHERE id = p_aposta_id;
  
  UPDATE public.apostas_pernas ap
  SET resultado = NULL,
      lucro_prejuizo = NULL,
      lucro_prejuizo_brl_referencia = NULL,
      updated_at = now()
  WHERE ap.aposta_id = p_aposta_id;
  
  IF v_had_orphan_result AND v_count = 0 THEN
    RETURN QUERY SELECT TRUE, 'Resíduo órfão de liquidação limpo (sem eventos a reverter)'::TEXT, 0;
  ELSE
    RETURN QUERY SELECT TRUE, 'Liquidação revertida com sucesso'::TEXT, v_count;
  END IF;
END;
$function$;

-- 5. Atualizar deletar_aposta_v4
CREATE OR REPLACE FUNCTION public.deletar_aposta_v4(p_aposta_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_net RECORD;
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  SELECT * INTO v_aposta FROM public.apostas_unificada au WHERE au.id = p_aposta_id FOR UPDATE;

  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;

  FOR v_net IN
    SELECT fe.bookmaker_id, fe.moeda, SUM(fe.valor) as total_impact
    FROM public.financial_events fe
    WHERE fe.aposta_id = p_aposta_id
    GROUP BY fe.bookmaker_id, fe.moeda
  LOOP
    IF v_net.total_impact != 0 THEN
      INSERT INTO public.financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, descricao, processed_at
      ) VALUES (
        v_net.bookmaker_id, p_aposta_id, v_aposta.workspace_id, 'REVERSAL', 'NORMAL',
        -v_net.total_impact, v_net.moeda,
        'del_rev_' || p_aposta_id || '_' || v_net.bookmaker_id || '_' || v_net.moeda,
        'Reversão por exclusão de aposta', now()
      );
    END IF;
  END LOOP;

  DELETE FROM public.apostas_perna_entradas ape 
  USING public.apostas_pernas ap 
  WHERE ape.perna_id = ap.id AND ap.aposta_id = p_aposta_id;

  DELETE FROM public.apostas_pernas ap WHERE ap.aposta_id = p_aposta_id;
  DELETE FROM public.apostas_unificada au WHERE au.id = p_aposta_id;

  RETURN QUERY SELECT TRUE, 'Aposta e registros financeiros removidos com sucesso'::TEXT;
END;
$function$;
