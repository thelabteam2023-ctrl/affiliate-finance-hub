-- Add finalization fields to project_bookmaker_link_bonuses table
ALTER TABLE public.project_bookmaker_link_bonuses
ADD COLUMN finalized_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN finalized_by UUID,
ADD COLUMN finalize_reason TEXT;

-- Add comment explaining the status values
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.status IS 'Status do bônus: pending, credited, failed, expired, reversed, finalized';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.finalized_at IS 'Data/hora da finalização do bônus';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.finalized_by IS 'Usuário que finalizou o bônus';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.finalize_reason IS 'Motivo da finalização: rollover_completed, bonus_consumed, expired, cancelled_reversed';