-- RPC para retornar nomes (primeiro nome) de usuários que registraram transações no caixa
-- Permite exibir autoria mesmo de operadores antigos / fora do workspace atual
DROP FUNCTION IF EXISTS public.get_cash_ledger_user_names(uuid[]);

CREATE OR REPLACE FUNCTION public.get_cash_ledger_user_names(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, first_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS user_id,
    COALESCE(
      NULLIF(split_part(trim(p.full_name), ' ', 1), ''),
      split_part(p.email, '@', 1)
    ) AS first_name
  FROM public.profiles p
  WHERE p.id = ANY(p_user_ids)
    -- Garante que o caller só veja autores de transações do(s) workspace(s) onde ele participa
    AND EXISTS (
      SELECT 1
      FROM public.cash_ledger cl
      JOIN public.workspace_members wm
        ON wm.workspace_id = cl.workspace_id
       AND wm.user_id = auth.uid()
       AND wm.is_active = true
      WHERE cl.user_id = p.id
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_ledger_user_names(uuid[]) TO authenticated;