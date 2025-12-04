-- Add payment model fields to operador_projetos table
-- This allows different payment terms per operator per project

ALTER TABLE public.operador_projetos
ADD COLUMN modelo_pagamento text NOT NULL DEFAULT 'FIXO_MENSAL',
ADD COLUMN valor_fixo numeric DEFAULT 0,
ADD COLUMN percentual numeric DEFAULT 0,
ADD COLUMN base_calculo text DEFAULT 'LUCRO_PROJETO';

-- Add constraint to validate modelo_pagamento values
ALTER TABLE public.operador_projetos
ADD CONSTRAINT operador_projetos_modelo_pagamento_check 
CHECK (modelo_pagamento IN ('FIXO_MENSAL', 'PORCENTAGEM', 'HIBRIDO', 'POR_ENTREGA', 'COMISSAO_ESCALONADA'));

-- Add constraint to validate base_calculo values
ALTER TABLE public.operador_projetos
ADD CONSTRAINT operador_projetos_base_calculo_check 
CHECK (base_calculo IN ('LUCRO_PROJETO', 'FATURAMENTO_PROJETO', 'RESULTADO_OPERACAO'));

-- Add comment for documentation
COMMENT ON COLUMN public.operador_projetos.modelo_pagamento IS 'Payment model: FIXO_MENSAL (fixed monthly), PORCENTAGEM (percentage only), HIBRIDO (fixed + percentage), POR_ENTREGA (per delivery), COMISSAO_ESCALONADA (tiered commission)';
COMMENT ON COLUMN public.operador_projetos.valor_fixo IS 'Fixed monthly value in BRL (used for FIXO_MENSAL and HIBRIDO models)';
COMMENT ON COLUMN public.operador_projetos.percentual IS 'Percentage value (used for PORCENTAGEM, HIBRIDO, and COMISSAO_ESCALONADA models)';
COMMENT ON COLUMN public.operador_projetos.base_calculo IS 'Calculation base for percentage: LUCRO_PROJETO (project profit), FATURAMENTO_PROJETO (project revenue), RESULTADO_OPERACAO (operation result)';