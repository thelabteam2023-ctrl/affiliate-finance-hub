
-- Corrigir view v_saldo_caixa_fiat para não agrupar por user_id
-- O saldo do caixa operacional é por workspace, não por usuário

DROP VIEW IF EXISTS public.v_saldo_caixa_fiat;

CREATE VIEW public.v_saldo_caixa_fiat AS
SELECT 
    moeda,
    COALESCE(sum(
        CASE
            WHEN destino_tipo = 'CAIXA_OPERACIONAL'::text THEN valor
            WHEN origem_tipo = 'CAIXA_OPERACIONAL'::text THEN - valor
            ELSE 0::numeric
        END), 0::numeric) AS saldo
FROM cash_ledger
WHERE tipo_moeda = 'FIAT'::text 
  AND status = 'CONFIRMADO'::text 
  AND workspace_id = get_current_workspace()
GROUP BY moeda;
