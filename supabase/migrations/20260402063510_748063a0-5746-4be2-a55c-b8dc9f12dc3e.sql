CREATE TABLE IF NOT EXISTS public.financial_debug_log (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  op TEXT NOT NULL,
  bookmaker_id UUID NULL,
  old_project_id UUID NULL,
  new_project_id UUID NULL,
  resolved_project_id UUID NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.financial_debug_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_financial_debug_log_bookmaker_ts
  ON public.financial_debug_log (bookmaker_id, ts DESC);

CREATE INDEX IF NOT EXISTS idx_financial_debug_log_event_type_ts
  ON public.financial_debug_log (event_type, ts DESC);

CREATE OR REPLACE FUNCTION public.get_projeto_dashboard_data(p_projeto_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  v_moeda text;
  v_cotacao_trabalho numeric;
  v_fonte_cotacao text;
  v_bookmaker_ids uuid[];
BEGIN
  SELECT moeda_consolidacao, cotacao_trabalho, fonte_cotacao
  INTO v_moeda, v_cotacao_trabalho, v_fonte_cotacao
  FROM projetos WHERE id = p_projeto_id;

  SELECT array_agg(id) INTO v_bookmaker_ids
  FROM bookmakers WHERE projeto_id = p_projeto_id;

  result := jsonb_build_object(
    'moeda_consolidacao', COALESCE(v_moeda, 'BRL'),
    'cotacao_trabalho', v_cotacao_trabalho,
    'fonte_cotacao', v_fonte_cotacao,

    'apostas', (
      SELECT COALESCE(jsonb_agg(row_to_json(a) ORDER BY a.data_aposta ASC), '[]'::jsonb)
      FROM (
        SELECT id, data_aposta, lucro_prejuizo, pl_consolidado,
               lucro_prejuizo_brl_referencia, stake, stake_total,
               stake_consolidado, moeda_operacao, consolidation_currency,
               forma_registro, estrategia, resultado, bonus_id,
               bookmaker_id, valor_brl_referencia, esporte, status,
               is_multicurrency
        FROM apostas_unificada
        WHERE projeto_id = p_projeto_id
          AND cancelled_at IS NULL
      ) a
    ),

    'apostas_pernas', (
      SELECT COALESCE(jsonb_agg(row_to_json(ap)), '[]'::jsonb)
      FROM (
        SELECT ap.aposta_id, ap.stake, ap.moeda, ap.bookmaker_id,
               ap.lucro_prejuizo, ap.resultado, ap.stake_brl_referencia
        FROM apostas_pernas ap
        INNER JOIN apostas_unificada au ON au.id = ap.aposta_id
        WHERE au.projeto_id = p_projeto_id
          AND au.cancelled_at IS NULL
          AND (au.forma_registro = 'ARBITRAGEM' OR au.is_multicurrency = true)
      ) ap
    ),

    'giros_gratis', (
      SELECT COALESCE(jsonb_agg(row_to_json(g)), '[]'::jsonb)
      FROM (
        SELECT data_registro, valor_retorno, bookmaker_id,
               quantidade_giros, valor_total_giros
        FROM giros_gratis
        WHERE projeto_id = p_projeto_id AND status = 'confirmado'
      ) g
    ),

    'cashback', (
      SELECT COALESCE(jsonb_agg(row_to_json(c)), '[]'::jsonb)
      FROM (
        SELECT data_credito, valor, moeda_operacao, valor_brl_referencia
        FROM cashback_manual
        WHERE projeto_id = p_projeto_id
      ) c
    ),

    'perdas', (
      SELECT COALESCE(jsonb_agg(row_to_json(p)), '[]'::jsonb)
      FROM (
        SELECT valor, status, data_registro, bookmaker_id
        FROM projeto_perdas
        WHERE projeto_id = p_projeto_id
      ) p
    ),

    'ocorrencias_perdas', (
      SELECT COALESCE(jsonb_agg(row_to_json(o)), '[]'::jsonb)
      FROM (
        SELECT valor_perda, resultado_financeiro, status, created_at
        FROM ocorrencias
        WHERE projeto_id = p_projeto_id
          AND perda_registrada_ledger = true
      ) o
    ),

    'conciliacoes', (
      SELECT COALESCE(jsonb_agg(row_to_json(ba)), '[]'::jsonb)
      FROM (
        SELECT saldo_anterior, saldo_novo, diferenca, bookmaker_id, created_at
        FROM bookmaker_balance_audit
        WHERE origem = 'CONCILIACAO_VINCULO'
          AND referencia_tipo = 'projeto'
          AND referencia_id = p_projeto_id
      ) ba
    ),

    'bonus', (
      SELECT COALESCE(jsonb_agg(row_to_json(b)), '[]'::jsonb)
      FROM (
        SELECT credited_at, bonus_amount, currency, tipo_bonus,
               bookmaker_id, created_at
        FROM project_bookmaker_link_bonuses
        WHERE project_id = p_projeto_id
          AND status IN ('credited', 'finalized')
      ) b
    ),

    'bookmakers', (
      SELECT COALESCE(jsonb_agg(row_to_json(bk)), '[]'::jsonb)
      FROM (
        SELECT id, nome, moeda, saldo_atual, saldo_freebet, saldo_bonus,
               saldo_irrecuperavel, parceiro_id, bookmaker_catalogo_id
        FROM bookmakers
        WHERE projeto_id = p_projeto_id
      ) bk
    ),

    'depositos', (
      SELECT COALESCE(jsonb_agg(row_to_json(d)), '[]'::jsonb)
      FROM (
        SELECT id, valor, valor_confirmado, moeda, destino_bookmaker_id, data_transacao
        FROM cash_ledger
        WHERE tipo_transacao IN ('DEPOSITO', 'DEPOSITO_VIRTUAL')
          AND status = 'CONFIRMADO'
          AND projeto_id_snapshot = p_projeto_id
      ) d
    ),

    'saques', (
      SELECT COALESCE(jsonb_agg(row_to_json(s)), '[]'::jsonb)
      FROM (
        SELECT id, valor, valor_confirmado, moeda, origem_bookmaker_id, data_transacao
        FROM cash_ledger
        WHERE tipo_transacao IN ('SAQUE', 'SAQUE_VIRTUAL')
          AND status = 'CONFIRMADO'
          AND projeto_id_snapshot = p_projeto_id
      ) s
    ),

    'ledger_extras', (
      SELECT COALESCE(jsonb_agg(row_to_json(e)), '[]'::jsonb)
      FROM (
        SELECT id, tipo_transacao, valor, moeda, data_transacao,
               ajuste_direcao, ajuste_motivo, destino_bookmaker_id,
               origem_bookmaker_id, projeto_id_snapshot, auditoria_metadata
        FROM cash_ledger
        WHERE status = 'CONFIRMADO'
          AND tipo_transacao IN (
            'AJUSTE_SALDO', 'GANHO_CAMBIAL', 'PERDA_CAMBIAL',
            'FREEBET_CONVERTIDA', 'CREDITO_PROMOCIONAL', 'GIRO_GRATIS_GANHO'
          )
          AND projeto_id_snapshot = p_projeto_id
      ) e
    ),

    'ajustes_pos_limitacao', (
      SELECT COALESCE(jsonb_agg(row_to_json(apl)), '[]'::jsonb)
      FROM (
        SELECT valor, moeda, bookmaker_id, metadata, created_at
        FROM financial_events
        WHERE tipo_evento = 'AJUSTE'
          AND bookmaker_id = ANY(v_bookmaker_ids)
          AND metadata IS NOT NULL
      ) apl
    )
  );

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_dv_count integer;
  v_last_sv_date timestamptz;
  v_adopted_count integer := 0;
  v_cleared_count integer := 0;
  v_virtual_amount numeric := 0;
  v_resolved_project uuid;
BEGIN
  v_resolved_project := NEW.projeto_id;

  INSERT INTO public.financial_debug_log (
    op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
  ) VALUES (
    TG_OP,
    NEW.id,
    OLD.projeto_id,
    NEW.projeto_id,
    v_resolved_project,
    'LINK_START',
    jsonb_build_object(
      'workspace_id', NEW.workspace_id,
      'saldo_atual', NEW.saldo_atual,
      'moeda', NEW.moeda,
      'status', NEW.status
    )
  );

  IF OLD.projeto_id IS NOT NULL THEN
    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (
      TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'SKIP_ALREADY_LINKED',
      jsonb_build_object('reason', 'OLD.projeto_id was not null')
    );
    RETURN NEW;
  END IF;

  IF NEW.projeto_id IS NULL THEN
    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (
      TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'SKIP_NULL_PROJECT',
      jsonb_build_object('reason', 'NEW.projeto_id is null')
    );
    RETURN NEW;
  END IF;

  SELECT MAX(created_at) INTO v_last_sv_date
  FROM public.cash_ledger
  WHERE tipo_transacao = 'SAQUE_VIRTUAL'
    AND origem_bookmaker_id = NEW.id
    AND status = 'CONFIRMADO';

  UPDATE public.cash_ledger
  SET projeto_id_snapshot = v_resolved_project
  WHERE projeto_id_snapshot IS NULL
    AND status = 'CONFIRMADO'
    AND tipo_transacao IN ('DEPOSITO', 'SAQUE')
    AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
    AND (v_last_sv_date IS NULL OR created_at > v_last_sv_date);

  GET DIAGNOSTICS v_adopted_count = ROW_COUNT;

  INSERT INTO public.financial_debug_log (
    op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
  ) VALUES (
    TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
    'ORPHAN_ADOPTION',
    jsonb_build_object(
      'last_sv_date', v_last_sv_date,
      'adopted_count', v_adopted_count,
      'adopted_types', jsonb_build_array('DEPOSITO', 'SAQUE')
    )
  );

  IF v_last_sv_date IS NOT NULL THEN
    UPDATE public.cash_ledger
    SET projeto_id_snapshot = NULL
    WHERE projeto_id_snapshot = v_resolved_project
      AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
      AND created_at < v_last_sv_date
      AND tipo_transacao NOT IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL');

    GET DIAGNOSTICS v_cleared_count = ROW_COUNT;

    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (
      TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'PREVIOUS_CYCLE_CLEAR',
      jsonb_build_object(
        'last_sv_date', v_last_sv_date,
        'cleared_count', v_cleared_count
      )
    );
  END IF;

  IF NEW.saldo_atual <= 0 THEN
    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (
      TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'SKIP_ZERO_BALANCE',
      jsonb_build_object('saldo_atual', NEW.saldo_atual)
    );
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = v_resolved_project
    AND created_at > NOW() - INTERVAL '30 seconds';

  IF v_existing_dv_count > 0 THEN
    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (
      TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
      'SKIP_IDEMPOTENT_DV',
      jsonb_build_object('existing_dv_count', v_existing_dv_count)
    );
    RETURN NEW;
  END IF;

  v_virtual_amount := NEW.saldo_atual;

  INSERT INTO public.cash_ledger (
    workspace_id, user_id, tipo_transacao, tipo_moeda, moeda,
    valor, destino_bookmaker_id, destino_tipo,
    status, data_transacao, projeto_id_snapshot,
    descricao, impacta_caixa_operacional
  ) VALUES (
    NEW.workspace_id, NEW.user_id, 'DEPOSITO_VIRTUAL', 'FIAT', NEW.moeda,
    v_virtual_amount, NEW.id, 'BOOKMAKER',
    'CONFIRMADO', CURRENT_DATE, v_resolved_project,
    'Baseline automático ao vincular ao projeto (saldo_atual=' || v_virtual_amount || ')',
    false
  );

  INSERT INTO public.financial_debug_log (
    op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
  ) VALUES (
    TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, v_resolved_project,
    'DV_CREATED',
    jsonb_build_object(
      'virtual_amount', v_virtual_amount,
      'last_sv_date', v_last_sv_date,
      'adopted_count', v_adopted_count,
      'cleared_count', v_cleared_count
    )
  );

  RETURN NEW;
END;
$function$;