-- Add freebet tracking columns to apostas table
ALTER TABLE public.apostas 
ADD COLUMN IF NOT EXISTS gerou_freebet boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS valor_freebet_gerada numeric DEFAULT 0;

-- Create table for random freebets received
CREATE TABLE IF NOT EXISTS public.freebets_recebidas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  bookmaker_id uuid NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  valor numeric NOT NULL,
  motivo text NOT NULL,
  data_recebida timestamp with time zone NOT NULL DEFAULT now(),
  observacoes text,
  utilizada boolean DEFAULT false,
  data_utilizacao timestamp with time zone,
  aposta_id uuid REFERENCES public.apostas(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.freebets_recebidas ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view own freebets_recebidas" 
ON public.freebets_recebidas 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own freebets_recebidas" 
ON public.freebets_recebidas 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own freebets_recebidas" 
ON public.freebets_recebidas 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own freebets_recebidas" 
ON public.freebets_recebidas 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_freebets_recebidas_updated_at
BEFORE UPDATE ON public.freebets_recebidas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();