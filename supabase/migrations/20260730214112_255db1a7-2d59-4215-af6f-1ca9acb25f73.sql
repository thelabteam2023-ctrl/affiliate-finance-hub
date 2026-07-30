DROP FUNCTION IF EXISTS public.get_perdas_detalhe(uuid, text, timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.get_perdas_detalhe(
  p_workspace_id uuid,
  p_categoria text,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ws uuid;
  v_tipo text;
  v_usd_brl numeric;
BEGIN
  v_ws := COALESCE(p_workspace_id, get_current_workspace());
  IF v_ws IS NULL THEN
    RETURN '[]'::json;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM workspace_members wm
    WHERE wm.workspace_id = v_ws AND wm.user_id = auth.uid()
  ) AND NOT EXISTS (
    SELECT 1 FROM workspaces w WHERE w.id = v_ws AND w.owner_id = auth.uid()
  ) THEN
    RETURN '[]'::json;
  END IF;

  v_tipo := CASE p_categoria
    WHEN 'PERDA_SCAN' THEN 'PERDA_OPERACIONAL'
    WHEN 'PERDA_ATIVO' THEN 'PERDA_ATIVO'
    WHEN 'PERDA_CAMBIAL' THEN 'PERDA_CAMBIAL'
    ELSE p_categoria
  END;

  SELECT rate INTO v_usd_brl
  FROM exchange_rate_history
  WHERE currency_pair = 'USDBRL'
  ORDER BY fetched_at DESC
  LIMIT 1;
  v_usd_brl := COALESCE(NULLIF(v_usd_brl, 0), 5.0);

  RETURN COALESCE((
    SELECT json_agg(row_to_json(t) ORDER BY t.data_ref DESC)
    FROM (
      SELECT
        cl.id,
        COALESCE(cl.data_transacao, cl.created_at) AS data_ref,
        cl.valor,
        UPPER(COALESCE(cl.moeda,'BRL')) AS moeda,
        CASE
          WHEN COALESCE(cl.valor_usd,0) <> 0 THEN ABS(cl.valor_usd)
          WHEN UPPER(COALESCE(cl.moeda,'BRL')) IN ('USD','USDT','USDC') THEN ABS(COALESCE(cl.valor,0))
          WHEN UPPER(COALESCE(cl.moeda,'BRL')) = 'BRL' THEN ABS(COALESCE(cl.valor,0)) / v_usd_brl
          ELSE ABS(COALESCE(cl.valor,0)) * COALESCE(cl.cotacao, v_usd_brl) / v_usd_brl
        END AS valor_usd_abs,
        cl.descricao,
        cl.ajuste_motivo,
        cl.auditoria_metadata,
        COALESCE(
          p_bk.nome, p_cb.nome, p_w.nome, p_direct.nome
        ) AS parceiro_nome,
        CASE
          WHEN bk.id IS NOT NULL THEN 'BOOKMAKER'
          WHEN cb.id IS NOT NULL THEN 'CONTA_BANCARIA'
          WHEN w.id IS NOT NULL THEN 'WALLET'
          ELSE NULL
        END AS ativo_tipo,
        COALESCE(
          NULLIF(TRIM(COALESCE(bkc.nome, bk.nome) || COALESCE(' · ' || bk.instance_identifier, '')), ''),
          cb.banco,
          NULLIF(TRIM(COALESCE(w.exchange,'') || COALESCE(' · ' || w.network, '')), '')
        ) AS ativo_nome,
        pr.nome AS projeto_nome
      FROM cash_ledger cl
      LEFT JOIN bookmakers bk ON bk.id = COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id)
      LEFT JOIN bookmakers_catalogo bkc ON bkc.id = bk.bookmaker_catalogo_id
      LEFT JOIN contas_bancarias cb ON cb.id = COALESCE(cl.origem_conta_bancaria_id, cl.destino_conta_bancaria_id)
      LEFT JOIN wallets_crypto w ON w.id = COALESCE(cl.origem_wallet_id, cl.destino_wallet_id)
      LEFT JOIN parceiros p_bk ON p_bk.id = bk.parceiro_id
      LEFT JOIN parceiros p_cb ON p_cb.id = cb.parceiro_id
      LEFT JOIN parceiros p_w ON p_w.id = w.parceiro_id
      LEFT JOIN parceiros p_direct ON p_direct.id = COALESCE(cl.origem_parceiro_id, cl.destino_parceiro_id)
      LEFT JOIN projetos pr ON pr.id = COALESCE(cl.projeto_id_snapshot, bk.projeto_id)
      WHERE cl.workspace_id = v_ws
        AND cl.status = 'CONFIRMADO'
        AND cl.reversed_at IS NULL
        AND cl.tipo_transacao = v_tipo
        AND (p_start IS NULL OR cl.data_transacao >= p_start)
        AND (p_end IS NULL OR cl.data_transacao < p_end)
      ORDER BY COALESCE(cl.data_transacao, cl.created_at) DESC
      LIMIT 300
    ) t
  ), '[]'::json);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_perdas_detalhe(uuid, text, timestamptz, timestamptz) TO authenticated;