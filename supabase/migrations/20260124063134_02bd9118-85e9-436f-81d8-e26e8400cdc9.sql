
-- =====================================================
-- CORREÇÃO: Sincronizar valor_destino com valor_confirmado (Conciliação)
-- =====================================================
-- O valor_confirmado é a fonte de verdade pois representa o valor
-- que REALMENTE caiu na casa após conciliação manual.
-- O KPI "Depositado" deve usar este valor para refletir capital operacional real.

UPDATE public.cash_ledger
SET
  valor_destino = valor_confirmado,
  auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
    'correcao_valor_destino_por_conciliacao', true,
    'correcao_data', now(),
    'valor_destino_anterior', valor_destino,
    'motivo', 'Sincronizado com valor_confirmado da conciliação'
  )
WHERE tipo_transacao = 'DEPOSITO'
  AND status = 'CONFIRMADO'
  AND valor_confirmado IS NOT NULL
  AND valor_destino IS DISTINCT FROM valor_confirmado;

-- Log de registros afetados
COMMENT ON TABLE cash_ledger IS 'Correção 2026-01-24: valor_destino sincronizado com valor_confirmado para depósitos conciliados. KPI Depositado agora reflete capital operacional real.';
