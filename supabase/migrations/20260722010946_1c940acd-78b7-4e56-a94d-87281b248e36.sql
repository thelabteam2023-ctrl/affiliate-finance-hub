
-- =============================================================================
-- AUDITORIA REVERSÃO FINANCEIRA — Rollback total
-- =============================================================================
-- (1) get_projeto_dashboard_data: passa a filtrar linhas revertidas de cash_ledger
--     nos blocos ledger_extras / depositos / saques.
-- (2) Trigger tr_cash_ledger_reversal_invalidate_snapshots: quando uma linha
--     recebe reversed_at, invalida (deleta) capital_snapshots do workspace a
--     partir daquela data — o próximo snapshot-capital-diario reconstrói.
-- (3) recompute_capital_snapshot(workspace, from_date): helper opcional para
--     provocar recomputação sob demanda.
-- =============================================================================

-- (1) get_projeto_dashboard_data ---------------------------------------------
DROP FUNCTION IF EXISTS public.get_projeto_dashboard_data(uuid);
CREATE OR REPLACE FUNCTION public.get_projeto_dashboard_data(p_projeto_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  v_moeda text;
  v_cotacao_trabalho numeric;
  v_fonte_cotacao text;
BEGIN
  SELECT moeda_consolidacao, cotacao_trabalho, fonte_cotacao
  INTO v_moeda, v_cotacao_trabalho, v_fonte_cotacao
  FROM projetos WHERE id = p_projeto_id;

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
      SELECT COALESCE(jsonb_agg(row_to_json(ae_mapped)), '[]'::jsonb)
      FROM (
        SELECT 
          ap.aposta_id, 
          ae.stake, 
          ae.moeda, 
          ae.bookmaker_id,
          CASE 
            WHEN ap.resultado = 'GREEN' THEN ae.stake * (ae.odd - 1)
            WHEN ap.resultado = 'RED' THEN -ae.stake
            WHEN ap.resultado = 'MEIO_GREEN' THEN (ae.stake * (ae.odd - 1) / 2)
            WHEN ap.resultado = 'MEIO_RED' THEN -(ae.stake / 2)
            WHEN ap.resultado = 'VOID' THEN 0
            ELSE 0
          END as lucro_prejuizo,
          ap.resultado, 
          ae.stake_brl_referencia
        FROM apostas_perna_entradas ae
        JOIN apostas_pernas ap ON ap.id = ae.perna_id
        INNER JOIN apostas_unificada au ON au.id = ap.aposta_id
        WHERE au.projeto_id = p_projeto_id
          AND au.cancelled_at IS NULL
      ) ae_mapped
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

    'giros_gratis', (SELECT COALESCE(jsonb_agg(g), '[]'::jsonb) FROM (SELECT * FROM giros_gratis WHERE projeto_id = p_projeto_id AND status = 'confirmado') g),
    'cashback', (SELECT COALESCE(jsonb_agg(c), '[]'::jsonb) FROM (SELECT * FROM cashback_manual WHERE projeto_id = p_projeto_id) c),
    'perdas', (SELECT COALESCE(jsonb_agg(p), '[]'::jsonb) FROM (SELECT * FROM projeto_perdas WHERE projeto_id = p_projeto_id) p),
    'bonus', (SELECT COALESCE(jsonb_agg(b), '[]'::jsonb) FROM (SELECT * FROM project_bookmaker_link_bonuses WHERE project_id = p_projeto_id AND status IN ('credited', 'finalized')) b),

    -- Blocos de cash_ledger: filtrar linhas revertidas (auditoria de reversão)
    'ledger_extras', (
        SELECT COALESCE(jsonb_agg(le), '[]'::jsonb) 
        FROM (
            SELECT * FROM cash_ledger 
            WHERE projeto_id_snapshot = p_projeto_id 
              AND status = 'CONFIRMADO'
              AND reversed_at IS NULL
        ) le
    ),
    'depositos', (
        SELECT COALESCE(jsonb_agg(d), '[]'::jsonb) 
        FROM (
            SELECT * FROM cash_ledger 
            WHERE projeto_id_snapshot = p_projeto_id 
              AND tipo_transacao IN ('DEPOSITO', 'DEPOSITO_VIRTUAL')
              AND status = 'CONFIRMADO'
              AND reversed_at IS NULL
        ) d
    ),
    'saques', (
        SELECT COALESCE(jsonb_agg(s), '[]'::jsonb) 
        FROM (
            SELECT * FROM cash_ledger 
            WHERE projeto_id_snapshot = p_projeto_id 
              AND tipo_transacao IN ('SAQUE', 'SAQUE_VIRTUAL')
              AND status = 'CONFIRMADO'
              AND reversed_at IS NULL
        ) s
    ),
    'conciliacoes', (
        SELECT COALESCE(jsonb_agg(ba), '[]'::jsonb) 
        FROM (
            SELECT ba.*, b.moeda 
            FROM bookmaker_balance_audit ba
            JOIN bookmakers b ON b.id = ba.bookmaker_id
            WHERE ba.referencia_tipo = 'projeto' 
              AND ba.referencia_id = p_projeto_id
              AND ba.origem = 'CONCILIACAO_VINCULO'
        ) ba
    )
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_projeto_dashboard_data(uuid) TO authenticated, service_role;

-- (2) Trigger: invalidação de capital_snapshots ao reverter ------------------
CREATE OR REPLACE FUNCTION public.fn_cash_ledger_reversal_invalidate_snapshots()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reversed_at IS NOT NULL AND (OLD.reversed_at IS NULL) THEN
    DELETE FROM public.capital_snapshots
     WHERE workspace_id = NEW.workspace_id
       AND snapshot_date >= (NEW.data_transacao AT TIME ZONE 'UTC')::date;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_cash_ledger_reversal_invalidate_snapshots ON public.cash_ledger;
CREATE TRIGGER tr_cash_ledger_reversal_invalidate_snapshots
AFTER UPDATE OF reversed_at ON public.cash_ledger
FOR EACH ROW
EXECUTE FUNCTION public.fn_cash_ledger_reversal_invalidate_snapshots();

-- (3) Helper: recompute_capital_snapshot -------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_capital_snapshot(
  p_workspace_id uuid,
  p_from_date    date DEFAULT current_date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.capital_snapshots
   WHERE workspace_id = p_workspace_id
     AND snapshot_date >= p_from_date;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  -- O cron `snapshot-capital-diario` reconstruirá os snapshots ausentes.
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_capital_snapshot(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_capital_snapshot(uuid, date) TO service_role;
