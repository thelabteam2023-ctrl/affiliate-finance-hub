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
            WHEN cl.destino_conta_bancaria_id = cb.id AND (cl.moeda_destino = cb.moeda OR cl.moeda = cb.moeda) THEN COALESCE(cl.valor_destino, cl.valor)
            WHEN cl.origem_conta_bancaria_id = cb.id AND (cl.moeda_origem = cb.moeda OR cl.moeda = cb.moeda) THEN - COALESCE(cl.valor_origem, cl.valor)
            ELSE 0::numeric
        END), 0::numeric) AS saldo,
    p.workspace_id,
    p.status AS parceiro_status
   FROM parceiros p
     JOIN contas_bancarias cb ON cb.parceiro_id = p.id
     LEFT JOIN cash_ledger cl ON (
        (cl.destino_conta_bancaria_id = cb.id AND (cl.moeda_destino = cb.moeda OR cl.moeda = cb.moeda))
        OR 
        (cl.origem_conta_bancaria_id = cb.id AND (cl.moeda_origem = cb.moeda OR cl.moeda = cb.moeda))
     ) AND cl.status = 'CONFIRMADO'::text AND cl.workspace_id = p.workspace_id
  GROUP BY p.user_id, p.id, p.nome, cb.id, cb.banco, cb.moeda, cb.titular, p.workspace_id, p.status;