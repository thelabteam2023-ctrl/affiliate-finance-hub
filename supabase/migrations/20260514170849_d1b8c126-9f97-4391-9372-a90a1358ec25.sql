-- 1. Function for global reconciliation (Read-Only)
CREATE OR REPLACE FUNCTION public.fn_reconciliar_saldos_bookmakers()
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
      COALESCE(origem_bookmaker_id, destino_bookmaker_id) as b_id,
      SUM(
        CASE 
          -- Logic replicating atualizar_saldo_bookmaker_v5 exactly
          WHEN origem_bookmaker_id IS NOT NULL AND status = 'CONFIRMADO' THEN
            CASE 
              WHEN tipo_transacao = 'APOSTA_STAKE' THEN -COALESCE(debito_real, valor_origem, valor)
              WHEN tipo_transacao = 'APOSTA_REVERSAO' THEN -COALESCE(valor_origem, valor)
              WHEN tipo_transacao IN ('SAQUE', 'TRANSFERENCIA', 'TRANSFERENCIA_INTERNA', 'BONUS_ESTORNO', 'AJUSTE_NEGATIVO', 'PERDA_OPERACIONAL', 'PERDA_CAMBIAL', 'FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA', 'CASHBACK_ESTORNO', 'GIRO_GRATIS_ESTORNO') THEN -COALESCE(valor_origem, valor)
              ELSE 0
            END
          WHEN destino_bookmaker_id IS NOT NULL AND status = 'CONFIRMADO' THEN
            CASE 
              WHEN tipo_transacao IN ('APOSTA_GREEN', 'APOSTA_MEIO_GREEN') THEN COALESCE(valor_destino, valor)
              WHEN tipo_transacao = 'APOSTA_MEIO_RED' THEN COALESCE(debito_real, 0) / 2
              WHEN tipo_transacao IN ('APOSTA_VOID', 'APOSTA_REEMBOLSO') THEN COALESCE(debito_real, valor_destino, valor)
              WHEN tipo_transacao = 'APOSTA_REVERSAO' THEN COALESCE(valor_destino, valor)
              WHEN tipo_transacao IN ('DEPOSITO', 'TRANSFERENCIA', 'TRANSFERENCIA_INTERNA', 'BONUS_CREDITADO', 'AJUSTE_SALDO', 'AJUSTE_MANUAL', 'AJUSTE_POSITIVO', 'CONCILIACAO', 'GANHO_CAMBIAL', 'FREEBET_CREDITADA', 'FREEBET_ESTORNO', 'FREEBET_CONVERTIDA', 'CASHBACK_MANUAL', 'CREDITO_CASHBACK', 'GIRO_GRATIS', 'PERDA_REVERSAO') THEN COALESCE(valor_destino, valor)
              ELSE 0
            END
          ELSE 0
        END
      ) as total_ledger,
      MAX(created_at) as last_tx
    FROM cash_ledger
    WHERE status = 'CONFIRMADO'
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
  ORDER BY ABS(COALESCE(b.saldo_atual, 0) - COALESCE(ls.total_ledger, 0)) DESC;
END;
$$;

-- 2. Function for Deep Ledger Timeline (Read-Only)
CREATE OR REPLACE FUNCTION public.fn_ledger_profundo_bookmaker(p_bookmaker_id UUID)
RETURNS TABLE (
  ledger_id UUID,
  created_at TIMESTAMP WITH TIME ZONE,
  tipo_transacao TEXT,
  descricao TEXT,
  moeda TEXT,
  impacto NUMERIC,
  running_balance NUMERIC,
  audit_saldo_anterior NUMERIC,
  audit_saldo_novo NUMERIC,
  audit_id UUID
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH raw_impacts AS (
    SELECT 
      cl.id,
      cl.created_at,
      cl.tipo_transacao,
      cl.descricao,
      cl.moeda,
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
            WHEN cl.tipo_transacao IN ('APOSTA_GREEN', 'APOSTA_MEIO_GREEN') THEN COALESCE(cl.valor_destino, cl.valor)
            WHEN cl.tipo_transacao = 'APOSTA_MEIO_RED' THEN COALESCE(cl.debito_real, 0) / 2
            WHEN cl.tipo_transacao IN ('APOSTA_VOID', 'APOSTA_REEMBOLSO') THEN COALESCE(cl.debito_real, cl.valor_destino, cl.valor)
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
    ba.id as audit_id
  FROM with_running wr
  LEFT JOIN bookmaker_balance_audit ba ON ba.referencia_id = wr.id AND ba.bookmaker_id = p_bookmaker_id
  ORDER BY wr.created_at DESC, wr.id DESC;
END;
$$;
