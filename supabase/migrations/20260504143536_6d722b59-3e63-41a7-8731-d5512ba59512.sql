-- Dropar e recriar para garantir que podemos mudar a estrutura
DROP VIEW IF EXISTS public.v_saldo_parceiro_contas;
CREATE OR REPLACE VIEW public.v_saldo_parceiro_contas AS
 SELECT p.user_id,
    p.id AS parceiro_id,
    p.nome AS parceiro_nome,
    cb.id AS conta_id,
    cb.banco,
    cb.moeda,
    cb.titular,
    COALESCE(sum(
        CASE
            WHEN cl.destino_conta_bancaria_id = cb.id THEN COALESCE(cl.valor_destino, cl.valor)
            WHEN cl.origem_conta_bancaria_id = cb.id THEN - COALESCE(cl.valor_origem, cl.valor)
            ELSE 0::numeric
        END), 0::numeric) AS saldo,
    p.workspace_id -- Adicionando workspace_id ao final
   FROM parceiros p
     JOIN contas_bancarias cb ON cb.parceiro_id = p.id
     LEFT JOIN cash_ledger cl ON (cl.destino_conta_bancaria_id = cb.id AND cl.moeda = cb.moeda OR cl.origem_conta_bancaria_id = cb.id AND cl.moeda = cb.moeda) AND cl.status = 'CONFIRMADO'::text AND cl.workspace_id = p.workspace_id
  GROUP BY p.user_id, p.id, p.nome, cb.id, cb.banco, cb.moeda, cb.titular, p.workspace_id;

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
    COALESCE(cl_agg.saldo_coin, 0::numeric) AS saldo_coin,
    COALESCE(
        CASE
            WHEN cl_agg.coin = ANY (ARRAY['USDT'::text, 'USDC'::text]) THEN cl_agg.saldo_coin
            ELSE cl_agg.saldo_usd
        END, 0::numeric) AS saldo_usd,
    COALESCE(w.balance_locked, 0::numeric) AS saldo_locked,
    GREATEST(COALESCE(
        CASE
            WHEN cl_agg.coin = ANY (ARRAY['USDT'::text, 'USDC'::text]) THEN cl_agg.saldo_coin
            ELSE cl_agg.saldo_usd
        END, 0::numeric) - COALESCE(w.balance_locked, 0::numeric), 0::numeric) AS saldo_disponivel,
    p.workspace_id -- Adicionando workspace_id ao final
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
                    WHEN cl.coin = ANY (ARRAY['USDT'::text, 'USDC'::text]) THEN
                    CASE
                        WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN cl.qtd_coin
                        WHEN cl.origem_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN - cl.qtd_coin
                        ELSE 0::numeric
                    END
                    WHEN cl.destino_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN COALESCE(cl.valor_usd,
                    CASE
                        WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0::numeric THEN cl.qtd_coin * cl.cotacao
                        ELSE 0::numeric
                    END)
                    WHEN cl.origem_wallet_id = w.id AND cl.transit_status = 'CONFIRMED'::text THEN - COALESCE(cl.valor_usd,
                    CASE
                        WHEN cl.cotacao IS NOT NULL AND cl.cotacao > 0::numeric THEN cl.qtd_coin * cl.cotacao
                        ELSE 0::numeric
                    END)
                    ELSE 0::numeric
                END) AS saldo_usd
           FROM cash_ledger cl
          WHERE (cl.destino_wallet_id = w.id OR cl.origem_wallet_id = w.id) AND cl.status = 'CONFIRMADO'::text AND cl.workspace_id = p.workspace_id
          GROUP BY cl.coin) cl_agg ON true;
