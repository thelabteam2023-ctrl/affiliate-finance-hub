-- Drop old version
DROP FUNCTION IF EXISTS public.fn_reconciliar_saldos_bookmakers();

-- Create new scoped version
CREATE OR REPLACE FUNCTION public.fn_reconciliar_saldos_bookmakers(p_workspace_id UUID DEFAULT NULL)
RETURNS TABLE (
  bookmaker_id UUID,
  nome TEXT,
  moeda TEXT,
  saldo_registrado NUMERIC,
  saldo_calculado NUMERIC,
  delta NUMERIC,
  status_reconciliacao TEXT,
  last_transaction_at TIMESTAMP WITH TIME ZONE
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH ledger_summary AS (
    SELECT 
      COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id) as b_id,
      SUM(
        CASE 
          -- Logic replicating atualizar_saldo_bookmaker_v5/v6 exactly
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
      ELSE '⚠️ DIVERTENTE'
    END as status_reconciliacao,
    ls.last_tx
  FROM bookmakers b
  LEFT JOIN ledger_summary ls ON b.id = ls.b_id
  WHERE (p_workspace_id IS NULL OR b.workspace_id = p_workspace_id)
  ORDER BY ABS(COALESCE(b.saldo_atual, 0) - COALESCE(ls.total_ledger, 0)) DESC;
END;
$$;
