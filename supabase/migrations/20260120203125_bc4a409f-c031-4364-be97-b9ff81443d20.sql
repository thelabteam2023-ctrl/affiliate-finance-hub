-- RPC para buscar casas com conciliação pendente globalmente (workspace)
-- Retorna todas as casas vinculadas a projetos que têm transações pendentes

CREATE OR REPLACE FUNCTION public.get_bookmakers_pendentes_conciliacao(p_workspace_id uuid)
RETURNS TABLE(
  bookmaker_id uuid,
  bookmaker_nome text,
  bookmaker_logo_url text,
  moeda text,
  saldo_atual numeric,
  projeto_id uuid,
  projeto_nome text,
  qtd_transacoes_pendentes bigint,
  valor_total_pendente numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    b.id AS bookmaker_id,
    b.nome AS bookmaker_nome,
    bc.logo_url AS bookmaker_logo_url,
    b.moeda,
    b.saldo_atual,
    b.projeto_id,
    p.nome AS projeto_nome,
    COUNT(cl.id) AS qtd_transacoes_pendentes,
    COALESCE(SUM(ABS(cl.valor)), 0) AS valor_total_pendente
  FROM bookmakers b
  LEFT JOIN bookmakers_catalogo bc ON b.bookmaker_catalogo_id = bc.id
  LEFT JOIN projetos p ON b.projeto_id = p.id
  INNER JOIN cash_ledger cl ON (
    cl.origem_bookmaker_id = b.id OR cl.destino_bookmaker_id = b.id
  )
  WHERE b.workspace_id = p_workspace_id
    AND b.status = 'ATIVO'
    AND b.projeto_id IS NOT NULL
    AND cl.status = 'PENDENTE'
  GROUP BY b.id, b.nome, bc.logo_url, b.moeda, b.saldo_atual, b.projeto_id, p.nome
  ORDER BY COUNT(cl.id) DESC, b.nome ASC;
END;
$$;