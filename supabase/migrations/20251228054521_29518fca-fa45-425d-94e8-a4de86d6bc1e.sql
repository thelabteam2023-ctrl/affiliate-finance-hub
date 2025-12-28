-- Drop the old constraint
ALTER TABLE public.investidores DROP CONSTRAINT IF EXISTS investidores_cpf_user_unique;

-- Create new constraint with workspace_id
ALTER TABLE public.investidores ADD CONSTRAINT investidores_cpf_workspace_unique UNIQUE (cpf, workspace_id);

-- Also update similar constraints on other tables to follow the same pattern
-- Check and fix parceiros
ALTER TABLE public.parceiros DROP CONSTRAINT IF EXISTS parceiros_cpf_user_unique;
ALTER TABLE public.parceiros ADD CONSTRAINT parceiros_cpf_workspace_unique UNIQUE (cpf, workspace_id);

-- Check and fix operadores
ALTER TABLE public.operadores DROP CONSTRAINT IF EXISTS operadores_cpf_user_unique;
ALTER TABLE public.operadores ADD CONSTRAINT operadores_cpf_workspace_unique UNIQUE (cpf, workspace_id);