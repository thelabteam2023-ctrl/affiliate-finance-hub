-- Sincronizar moeda dos vínculos existentes com moeda_padrao do catálogo
UPDATE bookmakers b
SET moeda = bc.moeda_padrao
FROM bookmakers_catalogo bc
WHERE b.bookmaker_catalogo_id = bc.id
  AND b.moeda = 'BRL'
  AND bc.moeda_padrao != 'BRL';