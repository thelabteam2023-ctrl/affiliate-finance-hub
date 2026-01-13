-- Remover tabelas do sistema de cashback automático (vazias e não utilizadas)
-- cashback_registros tem FK para cashback_regras, então drop primeiro

DROP TABLE IF EXISTS public.cashback_registros;
DROP TABLE IF EXISTS public.cashback_regras;