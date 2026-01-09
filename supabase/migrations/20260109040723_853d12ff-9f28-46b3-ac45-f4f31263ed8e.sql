-- Fix schema mismatch for giros_gratis used by frontend

-- 1) Add missing columns
ALTER TABLE public.giros_gratis
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmado';

DO $$
BEGIN
  -- Add constraint only if it doesn't exist
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'giros_gratis_status_check'
  ) THEN
    ALTER TABLE public.giros_gratis
      ADD CONSTRAINT giros_gratis_status_check
      CHECK (status IN ('pendente', 'confirmado', 'cancelado'));
  END IF;
END $$;

-- Generated total value for detailed mode (used in UI)
ALTER TABLE public.giros_gratis
  ADD COLUMN IF NOT EXISTS valor_total_giros NUMERIC(15,2)
  GENERATED ALWAYS AS (
    CASE
      WHEN quantidade_giros IS NOT NULL AND valor_por_giro IS NOT NULL
        THEN (quantidade_giros::numeric * valor_por_giro)
      ELSE NULL
    END
  ) STORED;

-- 2) Align RLS pattern with the rest of the project (workspace isolation)
DROP POLICY IF EXISTS "Users can view giros_gratis in their workspace" ON public.giros_gratis;
DROP POLICY IF EXISTS "Users can insert giros_gratis in their workspace" ON public.giros_gratis;
DROP POLICY IF EXISTS "Users can update giros_gratis in their workspace" ON public.giros_gratis;
DROP POLICY IF EXISTS "Users can delete giros_gratis in their workspace" ON public.giros_gratis;

-- Ensure RLS is enabled
ALTER TABLE public.giros_gratis ENABLE ROW LEVEL SECURITY;

CREATE POLICY giros_gratis_select
  ON public.giros_gratis
  FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY giros_gratis_insert
  ON public.giros_gratis
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND workspace_id = get_current_workspace()
    AND user_id = auth.uid()
  );

CREATE POLICY giros_gratis_update
  ON public.giros_gratis
  FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY giros_gratis_delete
  ON public.giros_gratis
  FOR DELETE
  USING (workspace_id = get_current_workspace());