-- Add is_bonus_bet column to apostas table for manual bonus bet tagging
ALTER TABLE apostas ADD COLUMN IF NOT EXISTS is_bonus_bet boolean DEFAULT false;

-- Add is_bonus_bet column to apostas_multiplas table for manual bonus bet tagging
ALTER TABLE apostas_multiplas ADD COLUMN IF NOT EXISTS is_bonus_bet boolean DEFAULT false;

-- Add index for faster filtering of bonus bets
CREATE INDEX IF NOT EXISTS idx_apostas_is_bonus_bet ON apostas(is_bonus_bet) WHERE is_bonus_bet = true;
CREATE INDEX IF NOT EXISTS idx_apostas_multiplas_is_bonus_bet ON apostas_multiplas(is_bonus_bet) WHERE is_bonus_bet = true;