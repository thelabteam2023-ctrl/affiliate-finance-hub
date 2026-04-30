DROP VIEW IF EXISTS public.v_saldo_parceiro_wallets;

CREATE OR REPLACE VIEW public.v_saldo_parceiro_wallets AS
 SELECT p.user_id,
    p.id AS parceiro_id,
    p.nome AS parceiro_nome,
    w.id AS wallet_id,
    w.exchange,
    w.endereco,
    w.label,
    cl_agg.coin,
    COALESCE(cl_agg.saldo_coin, (0)::numeric) AS saldo_coin,
    COALESCE(cl_agg.saldo_usd, (0)::numeric) AS saldo_usd,
    COALESCE(w.balance_locked, (0)::numeric) AS saldo_locked,
    GREATEST((COALESCE(cl_agg.saldo_usd, (0)::numeric) - COALESCE(w.balance_locked, (0)::numeric)), (0)::numeric) AS saldo_disponivel
   FROM ((parceiros p
     JOIN wallets_crypto w ON ((w.parceiro_id = p.id)))
     LEFT JOIN LATERAL ( SELECT cl.coin,
            sum(
                CASE
                    WHEN ((cl.destino_wallet_id = w.id) AND (cl.transit_status = 'CONFIRMED'::text)) THEN cl.qtd_coin
                    WHEN ((cl.origem_wallet_id = w.id) AND (cl.transit_status = 'CONFIRMED'::text)) THEN (- cl.qtd_coin)
                    ELSE (0)::numeric
                END) AS saldo_coin,
            sum(
                CASE
                    WHEN ((cl.destino_wallet_id = w.id) AND (cl.transit_status = 'CONFIRMED'::text)) THEN COALESCE(cl.valor_usd,
                    CASE
                        WHEN (cl.coin = ANY (ARRAY['USDT'::text, 'USDC'::text])) THEN cl.qtd_coin
                        WHEN ((cl.cotacao IS NOT NULL) AND (cl.cotacao > (0)::numeric)) THEN (cl.qtd_coin * cl.cotacao)
                        ELSE (0)::numeric
                    END)
                    WHEN ((cl.origem_wallet_id = w.id) AND (cl.transit_status = 'CONFIRMED'::text)) THEN (- COALESCE(cl.valor_usd,
                    CASE
                        WHEN (cl.coin = ANY (ARRAY['USDT'::text, 'USDC'::text])) THEN cl.qtd_coin
                        WHEN ((cl.cotacao IS NOT NULL) AND (cl.cotacao > (0)::numeric)) THEN (cl.qtd_coin * cl.cotacao)
                        ELSE (0)::numeric
                    END))
                    ELSE (0)::numeric
                END) AS saldo_usd
           FROM cash_ledger cl
          WHERE (((cl.destino_wallet_id = w.id) OR (cl.origem_wallet_id = w.id)) AND (cl.status = 'CONFIRMADO'::text) AND (cl.workspace_id = get_current_workspace()))
          GROUP BY cl.coin) cl_agg ON (true))
  WHERE (p.workspace_id = get_current_workspace());