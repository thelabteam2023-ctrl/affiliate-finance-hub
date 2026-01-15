
-- Drop and recreate the function to include parceiro nome
DROP FUNCTION IF EXISTS public.get_bookmaker_saldos(uuid);

CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id uuid)
RETURNS TABLE (
  bookmaker_id uuid,
  nome text,
  login_username text,
  parceiro_nome text,
  saldo_atual numeric,
  saldo_freebet numeric,
  saldo_irrecuperavel numeric,
  moeda text,
  status text,
  estado_conta text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    b.id AS bookmaker_id,
    COALESCE(bc.nome, b.nome) AS nome,
    b.login_username,
    p.nome AS parceiro_nome,
    b.saldo_atual,
    b.saldo_freebet,
    b.saldo_irrecuperavel,
    b.moeda,
    b.status,
    b.estado_conta
  FROM public.bookmakers b
  LEFT JOIN public.bookmakers_catalogo bc ON b.bookmaker_catalogo_id = bc.id
  LEFT JOIN public.parceiros p ON b.parceiro_id = p.id
  WHERE b.projeto_id = p_projeto_id
    AND b.status = 'ativo';
END;
$$;
