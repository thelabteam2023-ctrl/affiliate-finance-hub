ALTER TABLE public.indicadores_referral DROP CONSTRAINT IF EXISTS indicadores_referral_user_id_cpf_key;
ALTER TABLE public.indicadores_referral ADD CONSTRAINT indicadores_referral_workspace_id_cpf_key UNIQUE (workspace_id, cpf);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.indicadores_referral TO authenticated;
GRANT ALL ON public.indicadores_referral TO service_role;