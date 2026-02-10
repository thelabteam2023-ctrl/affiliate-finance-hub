
-- Atualizar v_saldo_parceiro_wallets com fallback genérico para qualquer crypto
-- Para stablecoins (USDT/USDC): qtd_coin ≈ USD (paridade 1:1)
-- Para outras cryptos: usa cotacao armazenada na transação (qtd_coin * cotacao dá o valor em USD)
CREATE OR REPLACE VIEW v_saldo_parceiro_wallets AS
SELECT p.user_id,
    p.id AS parceiro_id,
    p.nome AS parceiro_nome,
    w.id AS wallet_id,
    w.exchange,
    w.endereco,
    cl_agg.coin,
    COALESCE(cl_agg.saldo_coin, 0::numeric) AS saldo_coin,
    COALESCE(cl_agg.saldo_usd, 0::numeric) AS saldo_usd,
    COALESCE(w.balance_locked, 0::numeric) AS saldo_locked,
    GREATEST(COALESCE(cl_agg.saldo_usd, 0::numeric) - COALESCE(w.balance_locked, 0::numeric), 0::numeric) AS saldo_disponivel
   FROM parceiros p
     JOIN wallets_crypto w ON w.parceiro_id = p.id
     LEFT JOIN LATERAL ( SELECT cl.coin,
            sum(
                CASE
                    WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN cl.qtd_coin
                    WHEN cl.origem_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN - cl.qtd_coin
                    ELSE 0::numeric
                END) AS saldo_coin,
            sum(
                CASE
                    WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN 
                      COALESCE(cl.valor_usd, 
                        CASE 
                          WHEN cl.coin IN ('USDT','USDC') THEN cl.qtd_coin
                          WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao
                          ELSE 0::numeric 
                        END)
                    WHEN cl.origem_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN 
                      - COALESCE(cl.valor_usd, 
                        CASE 
                          WHEN cl.coin IN ('USDT','USDC') THEN cl.qtd_coin
                          WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao
                          ELSE 0::numeric 
                        END)
                    ELSE 0::numeric
                END) AS saldo_usd
           FROM cash_ledger cl
          WHERE (cl.destino_wallet_id = w.id OR cl.origem_wallet_id = w.id) AND cl.status = 'CONFIRMADO'::text AND cl.workspace_id = get_current_workspace()
          GROUP BY cl.coin) cl_agg ON true
  WHERE p.workspace_id = get_current_workspace();

-- Atualizar v_wallet_crypto_balances com mesmo fallback genérico
CREATE OR REPLACE VIEW v_wallet_crypto_balances AS
SELECT p.user_id,
    p.id AS parceiro_id,
    p.nome AS parceiro_nome,
    w.id AS wallet_id,
    w.exchange,
    w.endereco,
    w.network,
    w.moeda,
    w.balance_locked,
    COALESCE(cl_agg.saldo_coin_total, 0::numeric) AS balance_total_coin,
    COALESCE(cl_agg.saldo_usd_total, 0::numeric) AS balance_total,
    GREATEST(COALESCE(cl_agg.saldo_usd_total, 0::numeric) - COALESCE(w.balance_locked, 0::numeric), 0::numeric) AS balance_available,
    cl_agg.coin AS primary_coin
   FROM parceiros p
     JOIN wallets_crypto w ON w.parceiro_id = p.id
     LEFT JOIN LATERAL ( SELECT cl.coin,
            sum(
                CASE
                    WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN cl.qtd_coin
                    WHEN cl.origem_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN - cl.qtd_coin
                    ELSE 0::numeric
                END) AS saldo_coin_total,
            sum(
                CASE
                    WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN 
                      COALESCE(cl.valor_usd, 
                        CASE 
                          WHEN cl.coin IN ('USDT','USDC') THEN cl.qtd_coin
                          WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao
                          ELSE 0::numeric 
                        END)
                    WHEN cl.origem_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN 
                      - COALESCE(cl.valor_usd, 
                        CASE 
                          WHEN cl.coin IN ('USDT','USDC') THEN cl.qtd_coin
                          WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0 THEN cl.qtd_coin * cl.cotacao
                          ELSE 0::numeric 
                        END)
                    ELSE 0::numeric
                END) AS saldo_usd_total
           FROM cash_ledger cl
          WHERE (cl.destino_wallet_id = w.id OR cl.origem_wallet_id = w.id) AND cl.status = 'CONFIRMADO'::text AND cl.workspace_id = get_current_workspace()
          GROUP BY cl.coin) cl_agg ON true
  WHERE p.workspace_id = get_current_workspace();
