CREATE OR REPLACE FUNCTION public.fn_ledger_profundo_bookmaker(p_bookmaker_id uuid)
 RETURNS TABLE(ledger_id uuid, created_at timestamp with time zone, tipo_transacao text, descricao text, moeda text, impacto numeric, running_balance numeric, audit_saldo_anterior numeric, audit_saldo_novo numeric, audit_id uuid, referencia_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH raw_events AS (
    -- Unifica financial_events que é a fonte da verdade para o saldo
    SELECT 
      fe.id,
      fe.created_at,
      fe.tipo_evento::text as tipo_transacao,
      fe.descricao,
      fe.moeda,
      fe.valor as delta,
      fe.aposta_id as referencia_id
    FROM financial_events fe
    WHERE fe.bookmaker_id = p_bookmaker_id
      AND fe.tipo_uso = 'NORMAL'
      AND COALESCE(fe.event_scope, 'REAL') = 'REAL'
  ),
  with_running AS (
    SELECT 
      re.*,
      SUM(re.delta) OVER (ORDER BY re.created_at ASC, re.id ASC) as rb
    FROM raw_events re
  )
  SELECT 
    wr.id,
    wr.created_at,
    wr.tipo_transacao,
    wr.descricao,
    wr.moeda,
    wr.delta,
    wr.rb,
    (wr.rb - wr.delta) as audit_saldo_anterior,
    wr.rb as audit_saldo_novo,
    NULL::uuid as audit_id,
    wr.referencia_id
  FROM with_running wr
  ORDER BY wr.created_at DESC, wr.id DESC;
END;
$function$;