
-- Delete pernas first (FK constraint)
DELETE FROM apostas_pernas WHERE aposta_id = '657728f6-7e65-4884-860d-404c20998fa8';

-- Delete the main bet entry
DELETE FROM apostas_unificada WHERE id = '657728f6-7e65-4884-860d-404c20998fa8';
