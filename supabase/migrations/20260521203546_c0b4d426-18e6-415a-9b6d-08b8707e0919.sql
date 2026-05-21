CREATE TABLE IF NOT EXISTS public.debug_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  modulo text NOT NULL,
  evento text NOT NULL,
  payload jsonb,
  resposta jsonb,
  erro text,
  user_id uuid REFERENCES auth.users(id)
);

ALTER TABLE public.debug_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own debug logs" 
ON public.debug_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can view their own debug logs" 
ON public.debug_logs 
FOR SELECT 
USING (auth.uid() = user_id);