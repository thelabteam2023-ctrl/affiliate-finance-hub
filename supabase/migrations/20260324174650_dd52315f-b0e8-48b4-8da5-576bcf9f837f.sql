
CREATE OR REPLACE FUNCTION public.reprocessar_ledger_workspace(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_ledger RECORD;
    v_processed_count INT := 0;
    v_bookmaker_count INT := 0;
    v_events_created INT := 0;
    v_events_deleted INT := 0;
    v_reconciled INT := 0;
    v_bet_result jsonb;
    v_rec RECORD;
BEGIN
    UPDATE public.bookmakers
    SET saldo_atual = 0, saldo_freebet = 0, updated_at = NOW()
    WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_bookmaker_count = ROW_COUNT;

    DELETE FROM public.financial_events
    WHERE workspace_id = p_workspace_id;
    GET DIAGNOSTICS v_events_deleted = ROW_COUNT;

    UPDATE public.cash_ledger
    SET financial_events_generated = FALSE,
        balance_processed_at = NULL
    WHERE workspace_id = p_workspace_id;

    FOR v_ledger IN
        WITH neutralized_virtual_pairs AS (
          SELECT
            dv.id AS dv_id,
            sv.id AS sv_id
          FROM public.cash_ledger dv
          JOIN public.cash_ledger sv
            ON sv.workspace_id = dv.workspace_id
           AND sv.status = 'CONFIRMADO'
           AND dv.status = 'CONFIRMADO'
           AND dv.tipo_transacao = 'DEPOSITO_VIRTUAL'
           AND sv.tipo_transacao = 'SAQUE_VIRTUAL'
           AND dv.destino_bookmaker_id = sv.origem_bookmaker_id
           AND dv.projeto_id_snapshot IS NOT DISTINCT FROM sv.projeto_id_snapshot
           AND abs(coalesce(dv.valor,0) - coalesce(sv.valor,0)) <= 0.01
        )
        SELECT cl.id
        FROM public.cash_ledger cl
        WHERE cl.workspace_id = p_workspace_id
          AND cl.status = 'CONFIRMADO'
          AND (
            cl.tipo_transacao NOT IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL')
            OR NOT EXISTS (
              SELECT 1
              FROM neutralized_virtual_pairs np
              WHERE np.dv_id = cl.id OR np.sv_id = cl.id
            )
          )
        ORDER BY cl.data_transacao ASC, cl.created_at ASC
    LOOP
        UPDATE public.cash_ledger
        SET updated_at = NOW()
        WHERE id = v_ledger.id;
        v_processed_count := v_processed_count + 1;
    END LOOP;

    v_bet_result := public.regenerar_eventos_apostas_workspace(p_workspace_id);

    SELECT COUNT(*) INTO v_events_created
    FROM public.financial_events
    WHERE workspace_id = p_workspace_id;

    -- ============================================================
    -- SAFETY NET: Reconciliar saldos de TODAS as bookmakers
    -- Garante que saldo_atual = SUM(financial_events.valor)
    -- mesmo que algum trigger tenha falhado silenciosamente
    -- ============================================================
    FOR v_rec IN
        SELECT b.id
        FROM public.bookmakers b
        WHERE b.workspace_id = p_workspace_id
    LOOP
        PERFORM public.reconciliar_saldo_bookmaker(v_rec.id);
        v_reconciled := v_reconciled + 1;
    END LOOP;

    UPDATE public.wallets_crypto wc
    SET balance_locked = COALESCE((
        SELECT SUM(COALESCE(cl.valor_origem, cl.valor))
        FROM public.cash_ledger cl
        WHERE cl.origem_wallet_id = wc.id
          AND cl.status = 'PENDENTE'
          AND cl.workspace_id = p_workspace_id
    ), 0),
    balance_locked_updated_at = NOW()
    FROM public.parceiros p
    WHERE wc.parceiro_id = p.id
      AND p.workspace_id = p_workspace_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'workspace_id', p_workspace_id,
        'bookmakers_reset', v_bookmaker_count,
        'events_deleted', v_events_deleted,
        'ledger_entries_processed', v_processed_count,
        'financial_events_created', v_events_created,
        'bookmakers_reconciled', v_reconciled,
        'bet_events', v_bet_result,
        'processed_at', NOW()
    );
END;
$function$;
