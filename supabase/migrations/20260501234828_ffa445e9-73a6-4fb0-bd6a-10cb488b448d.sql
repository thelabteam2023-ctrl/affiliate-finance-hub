-- Add tipo_despesa column if it doesn't exist
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'despesas_administrativas' AND column_name = 'tipo_despesa') THEN
    ALTER TABLE public.despesas_administrativas ADD COLUMN tipo_despesa TEXT;
  END IF;
END $$;