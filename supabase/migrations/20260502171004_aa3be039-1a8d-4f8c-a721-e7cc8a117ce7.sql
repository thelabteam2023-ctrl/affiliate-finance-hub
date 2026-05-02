-- Atualizar a view para ser mais resiliente com stablecoins
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
    COALESCE(
        CASE
            WHEN (cl_agg.coin = ANY (ARRAY['USDT'::text, 'USDC'::text])) THEN cl_agg.saldo_coin
            ELSE cl_agg.saldo_usd
        END, (0)::numeric) AS saldo_usd,
    COALESCE(w.balance_locked, (0)::numeric) AS saldo_locked,
    GREATEST((COALESCE(
        CASE
            WHEN (cl_agg.coin = ANY (ARRAY['USDT'::text, 'USDC'::text])) THEN cl_agg.saldo_coin
            ELSE cl_agg.saldo_usd
        END, (0)::numeric) - COALESCE(w.balance_locked, (0)::numeric)), (0)::numeric) AS saldo_disponivel
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
                    -- Para USDT/USDC, o valor USD é SEMPRE a quantidade de coins
                    WHEN (cl.coin = ANY (ARRAY['USDT'::text, 'USDC'::text])) THEN
                        CASE
                            WHEN ((cl.destino_wallet_id = w.id) AND (cl.transit_status = 'CONFIRMED'::text)) THEN cl.qtd_coin
                            WHEN ((cl.origem_wallet_id = w.id) AND (cl.transit_status = 'CONFIRMED'::text)) THEN (- cl.qtd_coin)
                            ELSE (0)::numeric
                        END
                    -- Para outras moedas, mantém lógica atual com COALESCE no valor_usd
                    WHEN ((cl.destino_wallet_id = w.id) AND (cl.transit_status = 'CONFIRMED'::text)) THEN COALESCE(cl.valor_usd,
                        CASE
                            WHEN ((cl.cotacao IS NOT NULL) AND (cl.cotacao > (0)::numeric)) THEN (cl.qtd_coin * cl.cotacao)
                            ELSE (0)::numeric
                        END)
                    WHEN ((cl.origem_wallet_id = w.id) AND (cl.transit_status = 'CONFIRMED'::text)) THEN (- COALESCE(cl.valor_usd,
                        CASE
                            WHEN ((cl.cotacao IS NOT NULL) AND (cl.cotacao > (0)::numeric)) THEN (cl.qtd_coin * cl.cotacao)
                            ELSE (0)::numeric
                        END))
                    ELSE (0)::numeric
                END) AS saldo_usd
           FROM cash_ledger cl
          WHERE (((cl.destino_wallet_id = w.id) OR (cl.origem_wallet_id = w.id)) AND (cl.status = 'CONFIRMADO'::text) AND (cl.workspace_id = p.workspace_id))
          GROUP BY cl.coin) cl_agg ON (true))
  WHERE (p.workspace_id = get_current_workspace());

-- Corrigir dados históricos de saques USDT/USDC confirmados onde valor_usd divergia da qtd_coin
UPDATE public.cash_ledger
SET valor_usd = qtd_coin
WHERE status = 'CONFIRMADO'
  AND coin IN ('USDT', 'USDC')
  AND tipo_transacao = 'SAQUE'
  AND ABS(valor_usd - qtd_coin) > 0.0001;
