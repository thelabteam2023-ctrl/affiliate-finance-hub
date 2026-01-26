-- Corrigir view para usar security_invoker (respeitar RLS)
DROP VIEW IF EXISTS public.v_bookmaker_saldo_operavel;

CREATE VIEW public.v_bookmaker_saldo_operavel
WITH (security_invoker = true)
AS
SELECT 
  b.id,
  b.nome,
  b.moeda,
  b.projeto_id,
  b.workspace_id,
  b.saldo_atual AS saldo_real,
  COALESCE(b.saldo_bonus, 0) AS saldo_bonus,
  COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
  b.saldo_atual + COALESCE(b.saldo_bonus, 0) + COALESCE(b.saldo_freebet, 0) AS saldo_operavel,
  b.status
FROM bookmakers b
WHERE b.status IN ('ativo', 'limitada', 'ATIVO', 'LIMITADA');

COMMENT ON VIEW public.v_bookmaker_saldo_operavel IS 
'Saldo operável = real + bonus + freebet. UI mostra saldo_operavel, sistema debita via waterfall.';

GRANT SELECT ON public.v_bookmaker_saldo_operavel TO authenticated;