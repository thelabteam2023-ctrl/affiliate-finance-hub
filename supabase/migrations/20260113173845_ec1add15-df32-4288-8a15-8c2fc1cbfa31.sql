-- Migrar despesas dos grupos antigos para o novo grupo unificado
UPDATE public.despesas_administrativas
SET grupo = 'ADMINISTRATIVO_CONTABIL_FISCAL'
WHERE grupo IN ('TRIBUTOS_E_OBRIGACOES_LEGAIS', 'CONTABIL_E_ADMINISTRATIVO');