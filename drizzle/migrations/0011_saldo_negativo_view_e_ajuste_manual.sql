CREATE OR REPLACE FUNCTION public.update_bookmaker_balance_with_audit(
  p_bookmaker_id uuid,
  p_novo_saldo numeric,
  p_origem text,
  p_referencia_id uuid DEFAULT NULL::uuid,
  p_referencia_tipo text DEFAULT NULL::text,
  p_observacoes text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_saldo_anterior NUMERIC;
  v_workspace_id UUID;
  v_nome TEXT;
  v_moeda TEXT;
BEGIN
  SELECT saldo_atual, workspace_id, nome, COALESCE(moeda,'BRL')
  INTO v_saldo_anterior, v_workspace_id, v_nome, v_moeda
  FROM bookmakers
  WHERE id = p_bookmaker_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bookmaker nao encontrado: %', p_bookmaker_id;
  END IF;

  IF COALESCE(p_novo_saldo,0) < -0.01
     AND COALESCE(p_novo_saldo,0) < COALESCE(v_saldo_anterior,0) THEN
    RAISE EXCEPTION 'SALDO_INSUFICIENTE: % — saldo real disponivel: % %, resultado da operacao: % %.',
      COALESCE(v_nome,'Casa'),
      ROUND(COALESCE(v_saldo_anterior,0),2), v_moeda,
      ROUND(COALESCE(p_novo_saldo,0),2), v_moeda;
  END IF;

  IF v_saldo_anterior IS DISTINCT FROM p_novo_saldo THEN
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, user_id, saldo_anterior, saldo_novo,
      origem, referencia_id, referencia_tipo, observacoes
    ) VALUES (
      p_bookmaker_id, v_workspace_id, auth.uid(), v_saldo_anterior, p_novo_saldo,
      p_origem, p_referencia_id, p_referencia_tipo, p_observacoes
    );

    UPDATE bookmakers
    SET saldo_atual = p_novo_saldo, updated_at = now()
    WHERE id = p_bookmaker_id;
  END IF;
END;
$$;

CREATE OR REPLACE VIEW public.v_bookmakers_saldo_negativo
WITH (security_invoker = true) AS
SELECT
  b.id,
  b.workspace_id,
  b.nome,
  COALESCE(b.moeda,'BRL') AS moeda,
  COALESCE(b.saldo_atual,0) AS saldo_atual,
  COALESCE(b.saldo_freebet,0) AS saldo_freebet,
  b.status,
  b.projeto_id,
  pr.nome AS projeto_nome,
  p.nome AS parceiro_nome,
  b.updated_at
FROM public.bookmakers b
LEFT JOIN public.projetos pr ON pr.id = b.projeto_id
LEFT JOIN public.parceiros p ON p.id = b.parceiro_id
WHERE COALESCE(b.saldo_atual,0) < -0.01 OR COALESCE(b.saldo_freebet,0) < -0.01;

GRANT SELECT ON public.v_bookmakers_saldo_negativo TO authenticated;
GRANT ALL ON public.v_bookmakers_saldo_negativo TO service_role;