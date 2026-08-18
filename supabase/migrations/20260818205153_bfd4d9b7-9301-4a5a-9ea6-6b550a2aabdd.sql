-- V17: Classificacao economica dos ajustes de saldo (paridade grafico x KPI)

-- 1) Remove sobrecarga morta de 3 argumentos (ambiguidade PostgREST)
DROP FUNCTION IF EXISTS public.get_projetos_lucro_operacional(uuid[], text, text);

-- 2) get_projetos_lucro_operacional(4 args): corrige direcoes invalidas
--    ('CREDITO'/'DEBITO' -> 'ENTRADA'/'SAIDA') e aplica classificacao economica
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.get_projetos_lucro_operacional(uuid[],text,text,jsonb)'::regprocedure);

  d := replace(d, 'cl.ajuste_direcao = ''CREDITO''', 'cl.ajuste_direcao = ''ENTRADA''');
  d := replace(d, 'cl.ajuste_direcao = ''DEBITO''', 'cl.ajuste_direcao = ''SAIDA''');

  d := replace(
    d,
    'AND cl.tipo_transacao IN (''AJUSTE_SALDO'', ''RESULTADO_CAMBIAL'')
            AND cl.status = ''CONFIRMADO''',
    'AND cl.tipo_transacao IN (''AJUSTE_SALDO'', ''RESULTADO_CAMBIAL'')
            AND cl.status = ''CONFIRMADO''
            AND cl.reversed_at IS NULL
            AND COALESCE(cl.ajuste_natureza, ''RECONCILIACAO_OPERACIONAL'') = ''RECONCILIACAO_OPERACIONAL''
            AND COALESCE(cl.ajuste_motivo, '''') NOT IN (''BONUS_CANCELAMENTO'', ''PROMO_LIMIT'')'
  );

  IF position('''CREDITO''' in d) > 0 OR position('''DEBITO''' in d) > 0 THEN
    RAISE EXCEPTION 'Direcoes invalidas remanescentes em get_projetos_lucro_operacional';
  END IF;

  EXECUTE d;
END
$do$;

-- 3) get_projeto_lucro_operacional_daily: incluir ajustes de saldo operacionais
--    no grafico de Evolucao do Lucro (paridade com o KPI canonico)
DO $do$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.get_projeto_lucro_operacional_daily(uuid,jsonb,text,text)'::regprocedure);

  IF position('ajustes_daily' in d) > 0 THEN
    RETURN;
  END IF;

  d := replace(
    d,
    '  all_events AS (',
    '  ajustes_daily AS (
    SELECT
      (cl.data_transacao AT TIME ZONE ''America/Sao_Paulo'')::date AS dia,
      CASE WHEN UPPER(COALESCE(cl.moeda, ''BRL'')) IN (''USDT'', ''USDC'') THEN ''USD'' ELSE UPPER(COALESCE(cl.moeda, ''BRL'')) END AS moeda,
      CASE WHEN cl.ajuste_direcao = ''SAIDA'' THEN -COALESCE(cl.valor, 0) ELSE COALESCE(cl.valor, 0) END AS val
    FROM cash_ledger cl
    WHERE cl.tipo_transacao = ''AJUSTE_SALDO''
      AND cl.status = ''CONFIRMADO''
      AND cl.reversed_at IS NULL
      AND COALESCE(cl.ajuste_natureza, ''RECONCILIACAO_OPERACIONAL'') = ''RECONCILIACAO_OPERACIONAL''
      AND COALESCE(cl.ajuste_motivo, '''') NOT IN (''BONUS_CANCELAMENTO'', ''PROMO_LIMIT'')
      AND (cl.projeto_id_snapshot = p_projeto_id OR cl.origem_bookmaker_id = ANY(v_bm_ids) OR cl.destino_bookmaker_id = ANY(v_bm_ids))
      AND (v_start_ts IS NULL OR cl.data_transacao >= v_start_ts) AND (v_end_ts IS NULL OR cl.data_transacao <= v_end_ts)
  ),
  all_events AS ('
  );

  d := replace(
    d,
    '    UNION ALL SELECT dia, moeda, val FROM operational_losses_daily',
    '    UNION ALL SELECT dia, moeda, val FROM operational_losses_daily
    UNION ALL SELECT dia, moeda, val FROM ajustes_daily'
  );

  IF position('ajustes_daily' in d) = 0 THEN
    RAISE EXCEPTION 'Falha ao injetar ajustes_daily';
  END IF;

  EXECUTE d;
END
$do$;