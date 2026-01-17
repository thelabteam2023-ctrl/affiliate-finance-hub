-- Migração para sincronizar apostas legadas que têm pernas JSON mas não têm registros em apostas_pernas
-- Isso corrige o cálculo de saldo_em_aposta para apostas criadas antes do dual-write

-- Inserir pernas faltantes para apostas pendentes
INSERT INTO public.apostas_pernas (
  aposta_id,
  bookmaker_id,
  ordem,
  selecao,
  selecao_livre,
  odd,
  stake,
  moeda,
  stake_brl_referencia,
  cotacao_snapshot,
  cotacao_snapshot_at,
  resultado,
  lucro_prejuizo,
  lucro_prejuizo_brl_referencia,
  gerou_freebet,
  valor_freebet_gerada
)
SELECT 
  au.id AS aposta_id,
  (perna->>'bookmaker_id')::uuid AS bookmaker_id,
  (ROW_NUMBER() OVER (PARTITION BY au.id ORDER BY (perna->>'bookmaker_id'))) - 1 AS ordem,
  COALESCE(perna->>'selecao', 'N/A') AS selecao,
  perna->>'selecao_livre' AS selecao_livre,
  COALESCE((perna->>'odd')::numeric, 0) AS odd,
  COALESCE((perna->>'stake')::numeric, 0) AS stake,
  COALESCE(perna->>'moeda', 'BRL') AS moeda,
  (perna->>'stake_brl_referencia')::numeric AS stake_brl_referencia,
  (perna->>'cotacao_snapshot')::numeric AS cotacao_snapshot,
  CASE 
    WHEN perna->>'cotacao_snapshot_at' IS NOT NULL 
    THEN (perna->>'cotacao_snapshot_at')::timestamptz 
    ELSE NULL 
  END AS cotacao_snapshot_at,
  perna->>'resultado' AS resultado,
  (perna->>'lucro_prejuizo')::numeric AS lucro_prejuizo,
  (perna->>'lucro_prejuizo_brl_referencia')::numeric AS lucro_prejuizo_brl_referencia,
  COALESCE((perna->>'gerou_freebet')::boolean, false) AS gerou_freebet,
  (perna->>'valor_freebet_gerada')::numeric AS valor_freebet_gerada
FROM apostas_unificada au
CROSS JOIN jsonb_array_elements(au.pernas::jsonb) AS perna
WHERE au.pernas IS NOT NULL 
  AND jsonb_array_length(au.pernas::jsonb) > 0
  AND (perna->>'bookmaker_id') IS NOT NULL
  -- Apenas apostas que NÃO têm registros em apostas_pernas
  AND NOT EXISTS (
    SELECT 1 FROM apostas_pernas ap WHERE ap.aposta_id = au.id
  )
ON CONFLICT DO NOTHING;