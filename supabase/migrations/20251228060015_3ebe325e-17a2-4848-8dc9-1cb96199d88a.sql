
-- Step 1: Backfill the orphan record in despesas_administrativas
UPDATE public.despesas_administrativas da
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = da.user_id 
  LIMIT 1
)
WHERE da.workspace_id IS NULL;

-- Step 2: Make workspace_id NOT NULL to prevent future NULL values
ALTER TABLE public.despesas_administrativas ALTER COLUMN workspace_id SET NOT NULL;
