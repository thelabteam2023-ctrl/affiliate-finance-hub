ALTER TABLE public.planning_campanhas 
ADD COLUMN IF NOT EXISTS is_account_created BOOLEAN DEFAULT false;