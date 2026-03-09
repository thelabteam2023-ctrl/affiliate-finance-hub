
-- Fix corrupted strategy values from browser auto-translation
-- Map translated Portuguese labels back to internal IDs

UPDATE public.apostas_unificada
SET estrategia = CASE estrategia
  WHEN 'Apostador' THEN 'PUNTER'
  WHEN 'Punter' THEN 'PUNTER'
  WHEN 'Aposta certa' THEN 'SUREBET'
  WHEN 'Surebet' THEN 'SUREBET'
  WHEN 'Aposta de valor' THEN 'VALUEBET'
  WHEN 'ValueBet' THEN 'VALUEBET'
  WHEN 'Extração de Freebet' THEN 'EXTRACAO_FREEBET'
  WHEN 'Extração de Bônus' THEN 'EXTRACAO_BONUS'
  WHEN 'Duplo Verde' THEN 'DUPLO_GREEN'
  WHEN 'Duplo Green' THEN 'DUPLO_GREEN'
  ELSE estrategia
END
WHERE estrategia IN (
  'Apostador', 'Punter',
  'Aposta certa', 'Surebet', 
  'Aposta de valor', 'ValueBet',
  'Extração de Freebet', 'Extração de Bônus',
  'Duplo Verde', 'Duplo Green'
);
