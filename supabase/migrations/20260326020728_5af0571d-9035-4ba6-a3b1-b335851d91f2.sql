ALTER TABLE public.supplier_allowed_bookmakers 
ADD COLUMN IF NOT EXISTS valor_alocado numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'ATIVO';