-- Liquidação por perna: enquanto houver perna sem resultado, o pai fica PENDENTE
-- (antes: status 'PARCIAL' + resultado 'PENDENTE', que os consumidores liam como concluída)
DO $mig$
DECLARE
  d text;
  d2 text;
BEGIN
  -- 1) liquidar_perna_surebet_v1
  d := pg_get_functiondef('public.liquidar_perna_surebet_v1(uuid,text,uuid)'::regprocedure);
  d2 := regexp_replace(
          d,
          'status\s*=\s*CASE WHEN v_todas_liquidadas THEN ''LIQUIDADA'' ELSE ''PARCIAL'' END',
          'status = CASE WHEN v_todas_liquidadas THEN ''LIQUIDADA'' ELSE ''PENDENTE'' END'
        );
  d2 := regexp_replace(
          d2,
          'resultado\s*=\s*CASE WHEN v_todas_liquidadas THEN v_resultado_final ELSE ''PENDENTE'' END',
          'resultado = CASE WHEN v_todas_liquidadas THEN v_resultado_final ELSE NULL END'
        );
  IF d2 = d THEN
    RAISE EXCEPTION 'liquidar_perna_surebet_v1: padrão PARCIAL/PENDENTE não encontrado';
  END IF;
  EXECUTE d2;

  -- 2) deletar_perna_surebet_v1: ao remover a perna pendente, o pai precisa fechar
  d := pg_get_functiondef('public.deletar_perna_surebet_v1(uuid)'::regprocedure);
  d2 := regexp_replace(
          d,
          'UPDATE apostas_unificada SET\s*\n\s*stake_total = v_stake_total,',
          'UPDATE apostas_unificada SET' || chr(10) ||
          '      status = CASE WHEN v_todas_liquidadas THEN ''LIQUIDADA'' ELSE ''PENDENTE'' END,' || chr(10) ||
          '      resultado = CASE WHEN v_todas_liquidadas THEN v_resultado_final ELSE NULL END,' || chr(10) ||
          '      stake_total = v_stake_total,'
        );
  IF d2 = d THEN
    RAISE EXCEPTION 'deletar_perna_surebet_v1: padrão de UPDATE não encontrado';
  END IF;
  EXECUTE d2;
END
$mig$;