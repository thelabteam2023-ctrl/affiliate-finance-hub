-- 1) Trava de fechamento/desvinculação sem quitação contábil
CREATE OR REPLACE FUNCTION public.validate_bookmaker_resolution_requires_ledger_zero()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_unlink boolean := false;
  v_is_closing boolean := false;
BEGIN
  v_is_unlink := OLD.projeto_id IS NOT NULL AND NEW.projeto_id IS NULL;

  v_is_closing := (
    coalesce(OLD.estado_conta, '') IS DISTINCT FROM coalesce(NEW.estado_conta, '')
    AND lower(coalesce(NEW.estado_conta, '')) IN ('encerrada', 'inativa', 'desvinculada', 'arquivada', 'resolvida')
  ) OR (
    coalesce(OLD.status, '') IS DISTINCT FROM coalesce(NEW.status, '')
    AND lower(coalesce(NEW.status, '')) IN ('inativa', 'desvinculada', 'arquivada', 'resolvida')
  );

  IF (v_is_unlink OR v_is_closing)
     AND (abs(coalesce(NEW.saldo_atual, 0)) > 0.01 OR abs(coalesce(NEW.saldo_freebet, 0)) > 0.01) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Não é permitido encerrar/desvincular bookmaker com saldo diferente de zero.',
      DETAIL = format('Bookmaker %s ainda possui saldo_atual=%s e saldo_freebet=%s. Quite via SAQUE ou AJUSTE_SALDO antes de concluir.', NEW.id, coalesce(NEW.saldo_atual,0), coalesce(NEW.saldo_freebet,0)),
      HINT = 'Use um lançamento contábil auditável para zerar o saldo antes de encerrar ou desvincular a conta.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_bookmaker_resolution_requires_ledger_zero ON public.bookmakers;
CREATE TRIGGER trg_validate_bookmaker_resolution_requires_ledger_zero
BEFORE UPDATE ON public.bookmakers
FOR EACH ROW
EXECUTE FUNCTION public.validate_bookmaker_resolution_requires_ledger_zero();

-- 2) Reprocessamento seguro: ignora pares virtuais neutralizados (DV + SV) para o mesmo bookmaker/projeto/valor
CREATE OR REPLACE FUNCTION public.reprocessar_ledger_workspace(p_workspace_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_ledger RECORD;
    v_processed_count INT := 0;
    v_bookmaker_count INT := 0;
    v_events_created INT := 0;
    v_events_deleted INT := 0;
    v_bet_result jsonb;
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
        'bet_events', v_bet_result,
        'processed_at', NOW()
    );
END;
$$;