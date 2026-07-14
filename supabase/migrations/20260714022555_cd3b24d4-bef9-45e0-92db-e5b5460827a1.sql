
-- Recria v_saldo_parceiro_wallets expondo transit_in/transit_out separados
-- e saldo_disponivel derivado do ledger (não mais de balance_locked).

DROP VIEW IF EXISTS public.v_saldo_parceiro_wallets;

CREATE VIEW public.v_saldo_parceiro_wallets AS
SELECT
  p.user_id,
  p.id                                          AS parceiro_id,
  p.nome                                        AS parceiro_nome,
  w.id                                          AS wallet_id,
  w.exchange,
  w.endereco,
  w.label,
  cl_agg.coin,
  COALESCE(cl_agg.saldo_coin, 0)                AS saldo_coin,
  COALESCE(
    CASE WHEN cl_agg.coin = ANY (ARRAY['USDT','USDC']) THEN cl_agg.saldo_coin
         ELSE cl_agg.saldo_usd END, 0)          AS saldo_usd,
  COALESCE(w.balance_locked, 0)                 AS saldo_locked,

  -- Trânsito segregado (positivo em ambos os lados)
  COALESCE(cl_agg.transit_in_coin, 0)           AS transit_in_coin,
  COALESCE(cl_agg.transit_in_usd, 0)            AS transit_in_usd,
  COALESCE(cl_agg.transit_out_coin, 0)          AS transit_out_coin,
  COALESCE(cl_agg.transit_out_usd, 0)           AS transit_out_usd,

  -- Retrocompat: valor líquido (in - out)
  COALESCE(cl_agg.transit_in_coin, 0) - COALESCE(cl_agg.transit_out_coin, 0)
                                                AS saldo_em_transito_coin,
  COALESCE(cl_agg.transit_in_usd, 0)  - COALESCE(cl_agg.transit_out_usd, 0)
                                                AS saldo_em_transito,

  -- Disponível = confirmado − saídas pendentes (Floor 0)
  GREATEST(COALESCE(cl_agg.saldo_coin, 0) - COALESCE(cl_agg.transit_out_coin, 0), 0)
                                                AS saldo_disponivel_coin,
  GREATEST(
    COALESCE(CASE WHEN cl_agg.coin = ANY (ARRAY['USDT','USDC']) THEN cl_agg.saldo_coin
                  ELSE cl_agg.saldo_usd END, 0)
    - COALESCE(cl_agg.transit_out_usd, 0), 0)   AS saldo_disponivel,

  -- Total = confirmado + entradas pendentes − saídas pendentes
  COALESCE(cl_agg.saldo_coin, 0)
    + COALESCE(cl_agg.transit_in_coin, 0)
    - COALESCE(cl_agg.transit_out_coin, 0)      AS saldo_total_coin,
  COALESCE(CASE WHEN cl_agg.coin = ANY (ARRAY['USDT','USDC']) THEN cl_agg.saldo_coin
                ELSE cl_agg.saldo_usd END, 0)
    + COALESCE(cl_agg.transit_in_usd, 0)
    - COALESCE(cl_agg.transit_out_usd, 0)       AS saldo_total,

  p.workspace_id
FROM parceiros p
JOIN wallets_crypto w ON w.parceiro_id = p.id
LEFT JOIN LATERAL (
  SELECT
    cl.coin,
    SUM(CASE
          WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN  cl.qtd_coin
          WHEN cl.origem_wallet_id  = w.id AND cl.transit_status = 'CONFIRMED' THEN -cl.qtd_coin
          ELSE 0 END)                                                                     AS saldo_coin,
    SUM(CASE
          WHEN cl.coin = ANY (ARRAY['USDT','USDC']) THEN
            CASE
              WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN  cl.qtd_coin
              WHEN cl.origem_wallet_id  = w.id AND cl.transit_status = 'CONFIRMED' THEN -cl.qtd_coin
              ELSE 0 END
          WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN
            COALESCE(cl.valor_usd,
              CASE WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao ELSE 0 END)
          WHEN cl.origem_wallet_id  = w.id AND cl.transit_status = 'CONFIRMED' THEN
            -COALESCE(cl.valor_usd,
              CASE WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao ELSE 0 END)
          ELSE 0 END)                                                                     AS saldo_usd,

    -- Entradas pendentes (destino=wallet)
    SUM(CASE
          WHEN cl.transit_status = ANY (ARRAY['PENDING','STUCK','WRONG_ADDRESS','MANUAL_REVIEW'])
               AND cl.destino_wallet_id = w.id THEN cl.qtd_coin
          ELSE 0 END)                                                                     AS transit_in_coin,
    SUM(CASE
          WHEN cl.transit_status = ANY (ARRAY['PENDING','STUCK','WRONG_ADDRESS','MANUAL_REVIEW'])
               AND cl.destino_wallet_id = w.id THEN
            CASE WHEN cl.coin = ANY (ARRAY['USDT','USDC']) THEN cl.qtd_coin
                 ELSE COALESCE(cl.valor_usd,
                        CASE WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao ELSE 0 END)
            END
          ELSE 0 END)                                                                     AS transit_in_usd,

    -- Saídas pendentes (origem=wallet)
    SUM(CASE
          WHEN cl.transit_status = ANY (ARRAY['PENDING','STUCK','WRONG_ADDRESS','MANUAL_REVIEW'])
               AND cl.origem_wallet_id = w.id THEN cl.qtd_coin
          ELSE 0 END)                                                                     AS transit_out_coin,
    SUM(CASE
          WHEN cl.transit_status = ANY (ARRAY['PENDING','STUCK','WRONG_ADDRESS','MANUAL_REVIEW'])
               AND cl.origem_wallet_id = w.id THEN
            CASE WHEN cl.coin = ANY (ARRAY['USDT','USDC']) THEN cl.qtd_coin
                 ELSE COALESCE(cl.valor_usd,
                        CASE WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao ELSE 0 END)
            END
          ELSE 0 END)                                                                     AS transit_out_usd
  FROM cash_ledger cl
  WHERE (cl.destino_wallet_id = w.id OR cl.origem_wallet_id = w.id)
    AND cl.workspace_id = p.workspace_id
    AND cl.status = ANY (ARRAY['CONFIRMADO','PENDENTE'])
  GROUP BY cl.coin
) cl_agg ON TRUE;

GRANT SELECT ON public.v_saldo_parceiro_wallets TO authenticated, service_role;
