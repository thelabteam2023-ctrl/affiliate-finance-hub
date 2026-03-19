-- Fix existing ocorrências: derive moeda from linked bookmaker
UPDATE ocorrencias o
SET moeda = b.moeda
FROM bookmakers b
WHERE o.bookmaker_id = b.id
  AND o.moeda != b.moeda;