
-- Remover a constraint antiga
ALTER TABLE public.operador_projetos DROP CONSTRAINT IF EXISTS operador_projetos_base_calculo_check;

-- Adicionar a nova constraint com todos os valores permitidos
ALTER TABLE public.operador_projetos ADD CONSTRAINT operador_projetos_base_calculo_check 
CHECK (base_calculo = ANY (ARRAY['LUCRO_PROJETO'::text, 'FATURAMENTO_PROJETO'::text, 'RESULTADO_OPERACAO'::text, 'VOLUME_APOSTAS'::text, 'LUCRO_LIQUIDO'::text]));
