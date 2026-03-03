
-- Fix check_cycle_closing_requirements: aplicar timezone operacional para filtrar apenas apostas DO ciclo
CREATE OR REPLACE FUNCTION public.check_cycle_closing_requirements(_ciclo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ciclo record;
  _apostas_abertas int;
  _perdas_pendentes int;
  _metrics record;
  _start_utc timestamptz;
  _end_utc timestamptz;
BEGIN
  SELECT * INTO _ciclo FROM projeto_ciclos WHERE id = _ciclo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Ciclo não encontrado');
  END IF;

  -- CRÍTICO: Converter datas do ciclo para UTC usando timezone operacional (America/Sao_Paulo)
  -- Dia operacional: 00:00 São Paulo = 03:00 UTC (início)
  -- Fim do dia: 23:59:59 São Paulo = 02:59:59 UTC do dia seguinte
  _start_utc := (_ciclo.data_inicio::date)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  _end_utc := ((_ciclo.data_fim_prevista::date + interval '1 day') ::timestamp AT TIME ZONE 'America/Sao_Paulo') - interval '1 second';

  -- Apostas pendentes APENAS dentro do período do ciclo (timezone-aware)
  SELECT COUNT(*) INTO _apostas_abertas
  FROM apostas_unificada
  WHERE projeto_id = _ciclo.projeto_id
    AND data_aposta >= _start_utc
    AND data_aposta <= _end_utc
    AND status = 'PENDENTE';

  -- Perdas pendentes dentro do período
  SELECT COUNT(*) INTO _perdas_pendentes
  FROM projeto_perdas
  WHERE projeto_id = _ciclo.projeto_id
    AND data_registro >= _ciclo.data_inicio
    AND data_registro <= _ciclo.data_fim_prevista
    AND status = 'PENDENTE';

  -- Métricas preview
  SELECT 
    COUNT(*) as qtd,
    COALESCE(SUM(COALESCE(stake_total, stake, 0)), 0) as volume,
    COALESCE(SUM(COALESCE(lucro_prejuizo, 0)), 0) as lucro
  INTO _metrics
  FROM apostas_unificada
  WHERE projeto_id = _ciclo.projeto_id
    AND data_aposta >= _start_utc
    AND data_aposta <= _end_utc
    AND status = 'LIQUIDADA';

  RETURN jsonb_build_object(
    'ciclo_id', _ciclo_id,
    'status', _ciclo.status,
    'can_close', _apostas_abertas = 0 AND _perdas_pendentes = 0,
    'pendencias', jsonb_build_object(
      'apostas_abertas', _apostas_abertas,
      'perdas_pendentes', _perdas_pendentes
    ),
    'preview_metrics', jsonb_build_object(
      'qtd_apostas', _metrics.qtd,
      'volume', _metrics.volume,
      'lucro_preview', _metrics.lucro
    )
  );
END;
$$;
