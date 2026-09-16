-- Reaplica os filtros V17 (direcoes ENTRADA/SAIDA, natureza do ajuste, PROMO_LIMIT)
-- sobre a versao corrigida da funcao de lucro operacional.
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

  d := replace(
    d,
    'cl.ajuste_motivo = ''BONUS_CANCELAMENTO''',
    'cl.ajuste_motivo IN (''BONUS_CANCELAMENTO'', ''PROMO_LIMIT'')'
  );

  IF position('''CREDITO''' in d) > 0 OR position('''DEBITO''' in d) > 0 THEN
    RAISE EXCEPTION 'Direcoes invalidas remanescentes em get_projetos_lucro_operacional';
  END IF;
  IF position('ajuste_natureza' in d) = 0 THEN
    RAISE EXCEPTION 'Filtro de natureza nao aplicado';
  END IF;
  IF position('PROMO_LIMIT'', ' in d) = 0 AND position(''', ''PROMO_LIMIT''' in d) = 0 THEN
    RAISE EXCEPTION 'Filtro PROMO_LIMIT nao aplicado';
  END IF;

  EXECUTE d;
END
$do$;