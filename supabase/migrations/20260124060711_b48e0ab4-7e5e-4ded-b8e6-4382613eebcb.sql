
-- =====================================================
-- CORREÇÃO RETROATIVA: Depósitos com valor_destino = valor_origem
-- =====================================================
-- PROBLEMA: Registros legados foram salvos com valor_destino = valor_origem,
-- ignorando a taxa/spread entre wallet (origem) e casa (destino).
-- SOLUÇÃO: Recalcular valor_destino usando cotacao quando disponível,
-- e aplicar paridade 1:1 para stablecoins (USDT/USDC -> USD).

-- 1. Corrigir depósitos USDT -> USD com cotação registrada
-- Fórmula: valor_destino = valor_origem / cotacao
UPDATE cash_ledger
SET 
  valor_destino = ROUND((valor_origem / cotacao)::numeric, 2),
  auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
    'correcao_retroativa', true,
    'correcao_data', now(),
    'valor_destino_anterior', valor_destino,
    'motivo', 'Recalculado usando cotacao registrada'
  )
WHERE tipo_transacao = 'DEPOSITO'
  AND status = 'CONFIRMADO'
  AND cotacao IS NOT NULL
  AND cotacao > 1
  AND moeda_origem = 'USDT'
  AND moeda_destino = 'USD'
  AND valor_destino = valor_origem
  AND valor_destino IS NOT NULL
  AND valor_origem IS NOT NULL;

-- 2. Corrigir depósitos USDT -> EUR com cotação registrada
-- (mesmo tratamento)
UPDATE cash_ledger
SET 
  valor_destino = ROUND((valor_origem / cotacao)::numeric, 2),
  auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
    'correcao_retroativa', true,
    'correcao_data', now(),
    'valor_destino_anterior', valor_destino,
    'motivo', 'Recalculado usando cotacao EUR registrada'
  )
WHERE tipo_transacao = 'DEPOSITO'
  AND status = 'CONFIRMADO'
  AND cotacao IS NOT NULL
  AND cotacao > 1
  AND moeda_origem = 'USDT'
  AND moeda_destino = 'EUR'
  AND valor_destino = valor_origem
  AND valor_destino IS NOT NULL
  AND valor_origem IS NOT NULL;

-- 3. Preencher campos NULL usando bookmaker.moeda como referência
-- Para registros sem moeda_origem/moeda_destino mas com tipo_moeda = 'CRYPTO'
UPDATE cash_ledger cl
SET 
  moeda_origem = 'USDT',
  moeda_destino = b.moeda,
  valor_destino = COALESCE(cl.valor_destino, cl.valor),
  valor_origem = COALESCE(cl.valor_origem, cl.valor),
  auditoria_metadata = COALESCE(cl.auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
    'correcao_retroativa', true,
    'correcao_data', now(),
    'motivo', 'Preenchido moedas usando bookmaker.moeda'
  )
FROM bookmakers b
WHERE cl.destino_bookmaker_id = b.id
  AND cl.tipo_transacao = 'DEPOSITO'
  AND cl.status = 'CONFIRMADO'
  AND cl.tipo_moeda = 'CRYPTO'
  AND (cl.moeda_origem IS NULL OR cl.moeda_destino IS NULL);

-- 4. Para depósitos BRL -> BRL, garantir consistência (sem conversão necessária)
UPDATE cash_ledger
SET 
  valor_destino = valor,
  valor_origem = valor,
  auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
    'correcao_retroativa', true,
    'correcao_data', now(),
    'motivo', 'BRL->BRL: sem conversão, valores normalizados'
  )
WHERE tipo_transacao = 'DEPOSITO'
  AND status = 'CONFIRMADO'
  AND moeda_origem = 'BRL'
  AND moeda_destino = 'BRL'
  AND (valor_destino IS NULL OR valor_origem IS NULL);

-- 5. Log de auditoria geral
COMMENT ON TABLE cash_ledger IS 'Correção retroativa aplicada em 2026-01-24: valor_destino recalculado para refletir valor real creditado na casa (conciliação), separando do valor que saiu da wallet (valor_origem).';
