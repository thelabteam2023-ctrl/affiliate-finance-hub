
-- Normalizar credited_at: meia-noite UTC → meia-noite BRT (+3h)
-- Apenas registros legados armazenados como 00:00 UTC
UPDATE project_bookmaker_link_bonuses
SET credited_at = credited_at + INTERVAL '3 hours',
    updated_at = now()
WHERE credited_at IS NOT NULL
  AND EXTRACT(HOUR FROM credited_at) = 0
  AND status IN ('credited', 'finalized');
