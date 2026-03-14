
-- Remove the problematic unique constraint that prevents re-linking
ALTER TABLE projeto_bookmaker_historico 
  DROP CONSTRAINT IF EXISTS projeto_bookmaker_historico_projeto_id_bookmaker_id_key;

-- Create a partial unique index that only prevents duplicate OPEN records
CREATE UNIQUE INDEX IF NOT EXISTS uq_historico_open_link 
  ON projeto_bookmaker_historico (projeto_id, bookmaker_id) 
  WHERE data_desvinculacao IS NULL;
