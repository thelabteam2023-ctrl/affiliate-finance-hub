-- Remove a constraint antiga e adiciona nova com 'finalized'
ALTER TABLE project_bookmaker_link_bonuses 
DROP CONSTRAINT project_bookmaker_link_bonuses_status_check;

ALTER TABLE project_bookmaker_link_bonuses 
ADD CONSTRAINT project_bookmaker_link_bonuses_status_check 
CHECK (status = ANY (ARRAY['pending', 'credited', 'failed', 'expired', 'reversed', 'finalized']));