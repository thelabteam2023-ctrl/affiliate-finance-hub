
CREATE OR REPLACE VIEW public.v_bookmaker_saldo_operavel AS
SELECT id,
    nome,
    moeda,
    projeto_id,
    workspace_id,
    saldo_atual AS saldo_real,
    COALESCE(saldo_bonus, 0::numeric) AS saldo_bonus,
    COALESCE(saldo_freebet, 0::numeric) AS saldo_freebet,
    saldo_atual + COALESCE(saldo_freebet, 0::numeric) AS saldo_operavel,
    status
   FROM bookmakers b
  WHERE status = ANY (ARRAY['ativo'::text, 'limitada'::text, 'ATIVO'::text, 'LIMITADA'::text]);
