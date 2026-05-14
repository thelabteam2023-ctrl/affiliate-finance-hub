-- Drop existing functions to change return type
DROP FUNCTION IF EXISTS public.fn_ledger_profundo_bookmaker(uuid);
DROP FUNCTION IF EXISTS public.fn_reconciliar_saldos_bookmakers(uuid);

-- Recreate fn_ledger_profundo_bookmaker
CREATE OR REPLACE FUNCTION public.fn_ledger_profundo_bookmaker(p_bookmaker_id uuid)
 RETURNS TABLE(
   ledger_id uuid, 
   created_at timestamp with time zone, 
   tipo_transacao text, 
   descricao text, 
   moeda text, 
   impacto numeric, 
   running_balance numeric, 
   audit_saldo_anterior numeric, 
   audit_saldo_novo numeric, 
   audit_id uuid,
   referencia_id uuid
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH raw_impacts AS (
    SELECT 
      cl.id,
      cl.created_at,
      cl.tipo_transacao,
      cl.descricao,
      cl.moeda,
      cl.referencia_transacao_id,
      CASE 
        WHEN cl.origem_bookmaker_id = p_bookmaker_id THEN
          CASE 
            WHEN cl.tipo_transacao = 'APOSTA_STAKE' THEN -COALESCE(cl.debito_real, cl.valor_origem, cl.valor)
            WHEN cl.tipo_transacao = 'APOSTA_REVERSAO' THEN -COALESCE(cl.valor_origem, cl.valor)
            WHEN cl.tipo_transacao IN ('SAQUE', 'TRANSFERENCIA', 'TRANSFERENCIA_INTERNA', 'BONUS_ESTORNO', 'AJUSTE_NEGATIVO', 'PERDA_OPERACIONAL', 'PERDA_CAMBIAL', 'FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA', 'CASHBACK_ESTORNO', 'GIRO_GRATIS_ESTORNO') THEN -COALESCE(cl.valor_origem, cl.valor)
            ELSE 0
          END
        WHEN cl.destino_bookmaker_id = p_bookmaker_id THEN
          CASE 
            WHEN cl.tipo_transacao IN ('APOSTA_GREEN', 'APOSTA_MEIO_GREEN', 'APOSTA_RED', 'APOSTA_MEIO_RED', 'APOSTA_VOID', 'APOSTA_REEMBOLSO') THEN COALESCE(cl.valor_destino, cl.valor)
            WHEN cl.tipo_transacao = 'APOSTA_REVERSAO' THEN COALESCE(cl.valor_destino, cl.valor)
            WHEN cl.tipo_transacao IN ('DEPOSITO', 'TRANSFERENCIA', 'TRANSFERENCIA_INTERNA', 'BONUS_CREDITADO', 'AJUSTE_SALDO', 'AJUSTE_MANUAL', 'AJUSTE_POSITIVO', 'CONCILIACAO', 'GANHO_CAMBIAL', 'FREEBET_CREDITADA', 'FREEBET_ESTORNO', 'FREEBET_CONVERTIDA', 'CASHBACK_MANUAL', 'CREDITO_CASHBACK', 'GIRO_GRATIS', 'PERDA_REVERSAO') THEN COALESCE(cl.valor_destino, cl.valor)
            ELSE 0
          END
        ELSE 0
      END as delta
    FROM cash_ledger cl
    WHERE (cl.origem_bookmaker_id = p_bookmaker_id OR cl.destino_bookmaker_id = p_bookmaker_id)
      AND cl.status = 'CONFIRMADO'
  ),
  with_running AS (
    SELECT 
      ri.*,
      SUM(ri.delta) OVER (ORDER BY ri.created_at ASC, ri.id ASC) as rb
    FROM raw_impacts ri
  )
  SELECT 
    wr.id,
    wr.created_at,
    wr.tipo_transacao,
    wr.descricao,
    wr.moeda,
    wr.delta,
    wr.rb,
    ba.saldo_anterior,
    ba.saldo_novo,
    ba.id as audit_id,
    wr.referencia_transacao_id
  FROM with_running wr
  LEFT JOIN bookmaker_balance_audit ba ON ba.referencia_id = wr.id AND ba.bookmaker_id = p_bookmaker_id
  ORDER BY wr.created_at DESC, wr.id DESC;
END;
$function$;

-- Recreate fn_reconciliar_saldos_bookmakers
CREATE OR REPLACE FUNCTION public.fn_reconciliar_saldos_bookmakers(p_workspace_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(
   bookmaker_id uuid, 
   nome text, 
   moeda text, 
   saldo_registrado numeric, 
   saldo_calculado numeric, 
   delta numeric, 
   status_reconciliacao text, 
   last_transaction_at timestamp with time zone,
   stake_em_risco numeric
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH ledger_summary AS (
    SELECT 
      COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id) as b_id,
      SUM(
        CASE 
          WHEN cl.origem_bookmaker_id IS NOT NULL AND cl.status = 'CONFIRMADO' THEN
            CASE 
              WHEN cl.tipo_transacao = 'APOSTA_STAKE' THEN -COALESCE(cl.debito_real, cl.valor_origem, cl.valor)
              WHEN cl.tipo_transacao = 'APOSTA_REVERSAO' THEN -COALESCE(cl.valor_origem, cl.valor)
              WHEN cl.tipo_transacao IN ('SAQUE', 'TRANSFERENCIA', 'TRANSFERENCIA_INTERNA', 'BONUS_ESTORNO', 'AJUSTE_NEGATIVO', 'PERDA_OPERACIONAL', 'PERDA_CAMBIAL', 'FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA', 'CASHBACK_ESTORNO', 'GIRO_GRATIS_ESTORNO') THEN -COALESCE(cl.valor_origem, cl.valor)
              ELSE 0
            END
          WHEN cl.destino_bookmaker_id IS NOT NULL AND cl.status = 'CONFIRMADO' THEN
            CASE 
              WHEN cl.tipo_transacao IN ('APOSTA_GREEN', 'APOSTA_MEIO_GREEN') THEN COALESCE(cl.valor_destino, cl.valor)
              WHEN cl.tipo_transacao = 'APOSTA_MEIO_RED' THEN COALESCE(cl.debito_real, 0) / 2
              WHEN cl.tipo_transacao IN ('APOSTA_VOID', 'APOSTA_REEMBOLSO') THEN COALESCE(cl.debito_real, cl.valor_destino, cl.valor)
              WHEN cl.tipo_transacao = 'APOSTA_REVERSAO' THEN COALESCE(cl.valor_destino, cl.valor)
              WHEN cl.tipo_transacao IN ('DEPOSITO', 'TRANSFERENCIA', 'TRANSFERENCIA_INTERNA', 'BONUS_CREDITADO', 'AJUSTE_SALDO', 'AJUSTE_MANUAL', 'AJUSTE_POSITIVO', 'CONCILIACAO', 'GANHO_CAMBIAL', 'FREEBET_CREDITADA', 'FREEBET_ESTORNO', 'FREEBET_CONVERTIDA', 'CASHBACK_MANUAL', 'CREDITO_CASHBACK', 'GIRO_GRATIS', 'PERDA_REVERSAO') THEN COALESCE(cl.valor_destino, cl.valor)
              ELSE 0
            END
          ELSE 0
        END
      ) as total_ledger,
      MAX(cl.created_at) as last_tx
    FROM cash_ledger cl
    JOIN bookmakers b ON (b.id = cl.origem_bookmaker_id OR b.id = cl.destino_bookmaker_id)
    WHERE cl.status = 'CONFIRMADO'
      AND (p_workspace_id IS NULL OR b.workspace_id = p_workspace_id)
    GROUP BY 1
  ),
  stakes_risco AS (
    SELECT 
      au.bookmaker_id as b_id,
      SUM(au.stake) as total_stake_risco
    FROM apostas_unificada au
    WHERE au.status = 'ABERTA'
      AND (p_workspace_id IS NULL OR au.workspace_id = p_workspace_id)
    GROUP BY 1
  )
  SELECT 
    b.id,
    b.nome,
    b.moeda,
    COALESCE(b.saldo_atual, 0) as saldo_registrado,
    COALESCE(ls.total_ledger, 0) as saldo_calculado,
    COALESCE(b.saldo_atual, 0) - COALESCE(ls.total_ledger, 0) as delta,
    CASE 
      WHEN ABS(COALESCE(b.saldo_atual, 0) - COALESCE(ls.total_ledger, 0)) < 0.01 THEN '✅ OK'
      ELSE '⚠️ DIVERGENTE'
    END as status_reconciliacao,
    ls.last_tx,
    COALESCE(sr.total_stake_risco, 0) as stake_em_risco
  FROM bookmakers b
  LEFT JOIN ledger_summary ls ON b.id = ls.b_id
  LEFT JOIN stakes_risco sr ON b.id = sr.b_id
  WHERE (p_workspace_id IS NULL OR b.workspace_id = p_workspace_id)
  ORDER BY ABS(COALESCE(b.saldo_atual, 0) - COALESCE(ls.total_ledger, 0)) DESC;
END;
$function$;