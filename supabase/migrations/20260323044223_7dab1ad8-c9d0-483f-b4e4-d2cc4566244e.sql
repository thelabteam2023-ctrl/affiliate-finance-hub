
-- Add color and is_favorite columns to workspace_bet_sources
ALTER TABLE public.workspace_bet_sources ADD COLUMN IF NOT EXISTS color TEXT NULL;
ALTER TABLE public.workspace_bet_sources ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT false;

-- Remove all pre-seeded default sources (OddsNotifier, RebelBetting, Manual)
DELETE FROM public.workspace_bet_sources WHERE name IN ('OddsNotifier', 'RebelBetting', 'Manual');
