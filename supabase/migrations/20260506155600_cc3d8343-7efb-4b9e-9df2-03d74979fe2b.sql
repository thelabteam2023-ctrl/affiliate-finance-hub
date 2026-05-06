-- 1. REFORÇO DO GATILHO DE STAKE (IDEMPOTÊNCIA TOTAL)
CREATE OR REPLACE FUNCTION public.fn_perna_auto_stake_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_moeda TEXT;
  v_workspace_id UUID;
  v_user_id UUID;
  v_skip TEXT;
BEGIN
  -- 1. Verificações básicas
  IF NEW.bookmaker_id IS NULL OR COALESCE(NEW.stake, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- 2. Respeitar flag de supressão (usada por RPCs que já criam o evento)
  BEGIN
    v_skip := current_setting('app.skip_perna_auto_stake', true);
  EXCEPTION WHEN OTHERS THEN
    v_skip := NULL;
  END;
  IF v_skip = 'on' THEN
    RETURN NEW;
  END IF;

  -- 3. Idempotência Robusta: Não duplicar se já existe QUALQUER evento de stake
  -- vinculado a esta aposta/perna, independentemente do formato da chave.
  IF EXISTS (
    SELECT 1 FROM public.financial_events
    WHERE aposta_id = NEW.aposta_id
      AND bookmaker_id = NEW.bookmaker_id
      AND tipo_evento IN ('STAKE', 'FREEBET_STAKE')
      AND valor = -NEW.stake
      AND (
        idempotency_key = 'stake_perna_' || NEW.id
        OR idempotency_key LIKE 'stake_' || NEW.aposta_id || '%'
        OR idempotency_key LIKE '%perna_' || NEW.id || '%'
      )
  ) THEN
    RETURN NEW;
  END IF;

  -- 4. Coleta de metadados
  SELECT moeda, workspace_id INTO v_moeda, v_workspace_id
  FROM public.bookmakers WHERE id = NEW.bookmaker_id;

  SELECT user_id INTO v_user_id FROM public.apostas_unificada WHERE id = NEW.aposta_id;

  -- 5. Inserção do evento no Ledger
  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, created_by
  ) VALUES (
    NEW.bookmaker_id, NEW.aposta_id, v_workspace_id,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR COALESCE(NEW.stake_freebet, 0) > 0 THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR COALESCE(NEW.stake_freebet, 0) > 0 THEN 'FREEBET' ELSE 'NORMAL' END,
    -NEW.stake,
    COALESCE(NEW.moeda, v_moeda),
    'stake_perna_' || NEW.id,
    'Débito automático de stake (Gatilho de Integridade)',
    v_user_id
  );

  RETURN NEW;
END;
$function$;

-- 2. DEDUPLICAÇÃO GLOBAL (STAKES DUPLICADOS)
-- Identifica eventos criados pelo trigger que possuem um "irmão" criado pela RPC.
WITH duplicate_stakes AS (
  SELECT 
    fe_trigger.id as trigger_event_id,
    fe_trigger.bookmaker_id,
    fe_trigger.aposta_id,
    fe_trigger.workspace_id,
    fe_trigger.valor,
    fe_trigger.moeda,
    fe_trigger.tipo_uso
  FROM public.financial_events fe_trigger
  JOIN public.financial_events fe_rpc ON 
    fe_rpc.aposta_id = fe_trigger.aposta_id AND 
    fe_rpc.bookmaker_id = fe_trigger.bookmaker_id AND
    fe_rpc.valor = fe_trigger.valor AND
    fe_rpc.moeda = fe_trigger.moeda AND
    fe_rpc.tipo_evento = fe_trigger.tipo_evento
  WHERE fe_trigger.idempotency_key LIKE 'stake_perna_%'
    AND fe_rpc.idempotency_key NOT LIKE 'stake_perna_%'
    AND fe_trigger.tipo_evento IN ('STAKE', 'FREEBET_STAKE')
    -- Evitar re-estornar o que já foi estornado
    AND NOT EXISTS (
      SELECT 1 FROM public.financial_events r 
      WHERE r.reversed_event_id = fe_trigger.id
    )
)
INSERT INTO public.financial_events (
  bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
  origem, valor, moeda, idempotency_key, reversed_event_id, descricao
)
SELECT 
  ds.bookmaker_id, ds.aposta_id, ds.workspace_id, 'REVERSAL', ds.tipo_uso,
  'ledger_recovery_dedup', -ds.valor, ds.moeda,
  'recovery_rev_' || ds.trigger_event_id, ds.trigger_event_id,
  'Estorno de stake duplicado (Trigger vs RPC) - Auditoria Global'
FROM duplicate_stakes ds
ON CONFLICT (idempotency_key) DO NOTHING;

-- 3. AJUSTE DA FUNÇÃO DE P&L (RECALC)
CREATE OR REPLACE FUNCTION public.fn_recalc_pai_surebet(p_surebet_id UUID)
RETURNS TABLE (
  todas_liquidadas BOOLEAN,
  lucro_total NUMERIC,
  stake_total NUMERIC,
  resultado_geral TEXT,
  is_multicurrency BOOLEAN,
  pl_consolidado NUMERIC,
  stake_consolidado NUMERIC,
  consolidation_currency TEXT
) AS $$
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
BEGIN
  PERFORM set_config('app.surebet_recalc_context', 'on', true);
  
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
          -- PENDING: Se a aposta ainda não está liquidada, não subtraímos o stake do lucro consolidado
          -- para evitar confusão de "lucro negativo" na listagem enquanto a operação ocorre.
          -- O débito já ocorreu no Ledger, mas o lucro consolidado da Surebet reflete o RESULTADO.
          v_entry_lucro := 0; 
      END CASE;

      v_lucro_total_calc := v_lucro_total_calc + v_entry_lucro * v_rate;
      v_stake_total_calc := v_stake_total_calc + (CASE WHEN v_is_fb THEN 0 ELSE v_entry.stake END) * v_rate;
    END;
  END LOOP;

  v_lucro_total_calc := ROUND(v_lucro_total_calc, 4);
  v_stake_total_calc := ROUND(v_stake_total_calc, 4);

  v_res_geral := CASE 
    WHEN v_todas_liquidadas AND v_lucro_total_calc > 0.001 THEN 'GREEN'
    WHEN v_todas_liquidadas AND v_lucro_total_calc < -0.001 THEN 'RED'
    WHEN v_todas_liquidadas THEN 'VOID'
    ELSE 'PENDENTE'
  END;

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
$$ LANGUAGE plpgsql;

-- 4. RECALCULAR TODAS AS APOSTAS ATIVAS PARA ATUALIZAR STATUS E LUCRO
DO $$
DECLARE
  v_ap_id UUID;
BEGIN
  FOR v_ap_id IN 
    SELECT DISTINCT aposta_id FROM public.financial_events 
    WHERE tipo_evento = 'REVERSAL' AND origem = 'ledger_recovery_dedup'
  LOOP
    PERFORM public.fn_recalc_pai_surebet(v_ap_id);
    
    -- Atualizar aposta_unificada com os novos valores calculados
    UPDATE public.apostas_unificada au
    SET 
      (status, resultado, stake_total, lucro_prejuizo, is_multicurrency, pl_consolidado, stake_consolidado, consolidation_currency) = 
      (SELECT 
         CASE WHEN r.todas_liquidadas THEN 'LIQUIDADA' ELSE 'PENDENTE' END,
         r.resultado_geral, r.stake_total, r.lucro_total, r.is_multicurrency, r.pl_consolidado, r.stake_consolidado, r.consolidation_currency
       FROM public.fn_recalc_pai_surebet(v_ap_id) r)
    WHERE au.id = v_ap_id;
  END LOOP;
END;
$$;

-- 5. ATUALIZAR VIEW DE AUDITORIA
DROP VIEW IF EXISTS public.v_bookmaker_saldo_audit;
CREATE VIEW public.v_bookmaker_saldo_audit AS
SELECT
  b.id AS bookmaker_id,
  b.nome,
  b.workspace_id,
  b.moeda,
  b.saldo_atual AS saldo_materializado,
  COALESCE(SUM(CASE
    WHEN fe.tipo_uso = 'NORMAL' AND COALESCE(fe.event_scope::text, 'REAL') = 'REAL'
      THEN fe.valor ELSE 0 END), 0)::numeric AS saldo_calculado_eventos,
  (b.saldo_atual - COALESCE(SUM(CASE
    WHEN fe.tipo_uso = 'NORMAL' AND COALESCE(fe.event_scope::text, 'REAL') = 'REAL'
      THEN fe.valor ELSE 0 END), 0))::numeric AS divergencia
FROM public.bookmakers b
LEFT JOIN public.financial_events fe ON fe.bookmaker_id = b.id
GROUP BY b.id, b.nome, b.workspace_id, b.moeda, b.saldo_atual;
