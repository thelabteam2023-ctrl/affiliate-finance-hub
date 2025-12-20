-- Add columns for bonus template source and rollover tracking
ALTER TABLE public.project_bookmaker_link_bonuses
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS template_snapshot jsonb DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rollover_multiplier numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rollover_base text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rollover_target_amount numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS rollover_progress numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS min_odds numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS deadline_days integer DEFAULT NULL;

-- Add comment for clarity
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.source IS 'manual or template';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.template_snapshot IS 'Snapshot of template data at registration time';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.rollover_multiplier IS 'e.g. 6 for 6x rollover';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.rollover_base IS 'DEPOSITO, BONUS, or DEPOSITO_BONUS';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.rollover_target_amount IS 'Calculated target amount for rollover completion';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.rollover_progress IS 'Current progress towards rollover target';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.deposit_amount IS 'Deposit amount used for rollover calculation';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.min_odds IS 'Minimum odds required for rollover';
COMMENT ON COLUMN public.project_bookmaker_link_bonuses.deadline_days IS 'Days until bonus expires';