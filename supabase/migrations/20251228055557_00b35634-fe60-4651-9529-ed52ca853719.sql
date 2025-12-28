
-- Step 0: Remove duplicate investidores, keeping the one with workspace_id or the most recent one
-- First, remove any investidor_deals associated with investidores that will be deleted
DELETE FROM public.investidor_deals 
WHERE investidor_id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY cpf, user_id 
      ORDER BY 
        CASE WHEN workspace_id IS NOT NULL THEN 0 ELSE 1 END,
        created_at DESC
    ) as rn
    FROM public.investidores
  ) ranked
  WHERE rn > 1
);

-- Delete duplicate investidores (keep the first one by workspace_id presence and then created_at)
DELETE FROM public.investidores 
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY cpf, user_id 
      ORDER BY 
        CASE WHEN workspace_id IS NOT NULL THEN 0 ELSE 1 END,
        created_at DESC
    ) as rn
    FROM public.investidores
  ) ranked
  WHERE rn > 1
);

-- Step 1: Backfill NULL workspace_id for investidores
UPDATE public.investidores inv
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = inv.user_id 
  LIMIT 1
)
WHERE inv.workspace_id IS NULL;

-- Step 2: Backfill NULL workspace_id for investidor_deals
UPDATE public.investidor_deals d
SET workspace_id = (
  SELECT i.workspace_id 
  FROM investidores i 
  WHERE i.id = d.investidor_id
)
WHERE d.workspace_id IS NULL;

-- Step 3: Backfill NULL workspace_id for parceiros
UPDATE public.parceiros p
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = p.user_id 
  LIMIT 1
)
WHERE p.workspace_id IS NULL;

-- Step 4: Backfill NULL workspace_id for operadores
UPDATE public.operadores op
SET workspace_id = (
  SELECT wm.workspace_id 
  FROM workspace_members wm 
  WHERE wm.user_id = op.user_id 
  LIMIT 1
)
WHERE op.workspace_id IS NULL;

-- Step 5: Remove duplicate/old RLS policies that allow NULL workspace_id
DROP POLICY IF EXISTS "investidores_insert" ON public.investidores;
DROP POLICY IF EXISTS "investidores_select" ON public.investidores;
DROP POLICY IF EXISTS "investidores_update" ON public.investidores;
DROP POLICY IF EXISTS "investidores_delete" ON public.investidores;

-- Step 6: Remove old constraints from parceiros that conflict with workspace-based uniqueness
ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS parceiros_user_id_cpf_key;
ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS unique_cpf_per_user;
ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS unique_telefone_per_user;

-- Step 7: Delete any remaining orphan records with NULL workspace_id that couldn't be backfilled
DELETE FROM public.investidor_deals WHERE workspace_id IS NULL;
DELETE FROM public.investidores WHERE workspace_id IS NULL;
DELETE FROM public.parceiros WHERE workspace_id IS NULL;
DELETE FROM public.operadores WHERE workspace_id IS NULL;

-- Step 8: Make workspace_id NOT NULL
ALTER TABLE public.investidores ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.investidor_deals ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.parceiros ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE public.operadores ALTER COLUMN workspace_id SET NOT NULL;
