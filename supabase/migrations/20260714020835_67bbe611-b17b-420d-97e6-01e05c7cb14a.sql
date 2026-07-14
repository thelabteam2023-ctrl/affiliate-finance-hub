
-- 1) Enforce transit_status vocabulary
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_transit_status_check;
ALTER TABLE public.cash_ledger
  ADD CONSTRAINT cash_ledger_transit_status_check
  CHECK (transit_status IS NULL OR transit_status IN (
    'PENDING','CONFIRMED','FAILED','STUCK','WRONG_ADDRESS','EXPIRED','MANUAL_REVIEW','CANCELLED'
  ));

-- 2) Recreate view with tri-phasic balance columns
DROP VIEW IF EXISTS public.v_saldo_parceiro_wallets;

CREATE VIEW public.v_saldo_parceiro_wallets AS
SELECT
  p.user_id,
  p.id AS parceiro_id,
  p.nome AS parceiro_nome,
  w.id AS wallet_id,
  w.exchange,
  w.endereco,
  w.label,
  cl_agg.coin,
  COALESCE(cl_agg.saldo_coin, 0::numeric) AS saldo_coin,
  COALESCE(
    CASE WHEN cl_agg.coin = ANY (ARRAY['USDT','USDC']) THEN cl_agg.saldo_coin
         ELSE cl_agg.saldo_usd END, 0::numeric
  ) AS saldo_usd,
  COALESCE(w.balance_locked, 0::numeric) AS saldo_locked,
  GREATEST(
    COALESCE(
      CASE WHEN cl_agg.coin = ANY (ARRAY['USDT','USDC']) THEN cl_agg.saldo_coin
           ELSE cl_agg.saldo_usd END, 0::numeric
    ) - COALESCE(w.balance_locked, 0::numeric), 0::numeric
  ) AS saldo_disponivel,
  COALESCE(cl_agg.transit_coin, 0::numeric) AS saldo_em_transito_coin,
  COALESCE(cl_agg.transit_usd, 0::numeric) AS saldo_em_transito,
  COALESCE(
    CASE WHEN cl_agg.coin = ANY (ARRAY['USDT','USDC']) THEN cl_agg.saldo_coin
         ELSE cl_agg.saldo_usd END, 0::numeric
  ) + COALESCE(cl_agg.transit_usd, 0::numeric) AS saldo_total,
  p.workspace_id
FROM parceiros p
JOIN wallets_crypto w ON w.parceiro_id = p.id
LEFT JOIN LATERAL (
  SELECT
    cl.coin,
    sum(
      CASE
        WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN cl.qtd_coin
        WHEN cl.origem_wallet_id = w.id  AND cl.transit_status = 'CONFIRMED' THEN -cl.qtd_coin
        ELSE 0::numeric
      END
    ) AS saldo_coin,
    sum(
      CASE
        WHEN cl.coin = ANY (ARRAY['USDT','USDC']) THEN
          CASE
            WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN cl.qtd_coin
            WHEN cl.origem_wallet_id = w.id  AND cl.transit_status = 'CONFIRMED' THEN -cl.qtd_coin
            ELSE 0::numeric
          END
        WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN
          COALESCE(cl.valor_usd, CASE WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao ELSE 0 END)
        WHEN cl.origem_wallet_id = w.id AND cl.transit_status = 'CONFIRMED' THEN
          -COALESCE(cl.valor_usd, CASE WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao ELSE 0 END)
        ELSE 0::numeric
      END
    ) AS saldo_usd,
    -- In-transit (not yet confirmed, not failed/cancelled/expired)
    sum(
      CASE
        WHEN cl.transit_status IN ('PENDING','STUCK','WRONG_ADDRESS','MANUAL_REVIEW') THEN
          CASE
            WHEN cl.destino_wallet_id = w.id THEN cl.qtd_coin
            WHEN cl.origem_wallet_id  = w.id THEN -cl.qtd_coin
            ELSE 0::numeric
          END
        ELSE 0::numeric
      END
    ) AS transit_coin,
    sum(
      CASE
        WHEN cl.transit_status IN ('PENDING','STUCK','WRONG_ADDRESS','MANUAL_REVIEW') THEN
          CASE
            WHEN cl.coin = ANY (ARRAY['USDT','USDC']) THEN
              CASE
                WHEN cl.destino_wallet_id = w.id THEN cl.qtd_coin
                WHEN cl.origem_wallet_id  = w.id THEN -cl.qtd_coin
                ELSE 0::numeric
              END
            WHEN cl.destino_wallet_id = w.id THEN
              COALESCE(cl.valor_usd, CASE WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao ELSE 0 END)
            WHEN cl.origem_wallet_id = w.id THEN
              -COALESCE(cl.valor_usd, CASE WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao ELSE 0 END)
            ELSE 0::numeric
          END
        ELSE 0::numeric
      END
    ) AS transit_usd
  FROM cash_ledger cl
  WHERE (cl.destino_wallet_id = w.id OR cl.origem_wallet_id = w.id)
    AND cl.workspace_id = p.workspace_id
    AND cl.status IN ('CONFIRMADO','PENDENTE')
  GROUP BY cl.coin
) cl_agg ON true;

GRANT SELECT ON public.v_saldo_parceiro_wallets TO authenticated;
GRANT ALL ON public.v_saldo_parceiro_wallets TO service_role;
