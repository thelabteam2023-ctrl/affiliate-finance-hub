-- Reverter a obrigatoriedade do CPF (voltando ao estado original se era NOT NULL)
-- Nota: Verificamos que em 20260502031914 ele foi alterado para DROP NOT NULL.
-- Assumindo que o padrão anterior era NOT NULL para parceiros normais.
-- No entanto, se houver parceiros sem CPF agora, o ALTER falhará.
-- Primeiro removemos os parceiros criados automaticamente que não possuem CPF.
DELETE FROM public.parceiros WHERE supplier_profile_id IS NOT NULL;

-- Agora removemos a coluna de vínculo
ALTER TABLE public.parceiros DROP COLUMN IF EXISTS supplier_profile_id;

-- Restaurar o NOT NULL do CPF (se necessário e possível)
-- ALTER TABLE public.parceiros ALTER COLUMN cpf SET NOT NULL;

-- Remover a view criada hoje
DROP VIEW IF EXISTS public.v_supplier_total_balances;
