-- Create view for investor ROI calculations
CREATE OR REPLACE VIEW public.v_roi_investidores AS
SELECT 
  i.id as investidor_id,
  i.user_id,
  i.nome,
  i.cpf,
  i.status,
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.destino_tipo = 'CAIXA_OPERACIONAL' 
    THEN cl.valor 
    ELSE 0 
  END), 0) as total_aportes,
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.origem_tipo = 'CAIXA_OPERACIONAL' 
    THEN cl.valor 
    ELSE 0 
  END), 0) as total_liquidacoes,
  COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.origem_tipo = 'CAIXA_OPERACIONAL' 
    THEN cl.valor 
    ELSE 0 
  END), 0) - COALESCE(SUM(CASE 
    WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
    AND cl.destino_tipo = 'CAIXA_OPERACIONAL' 
    THEN cl.valor 
    ELSE 0 
  END), 0) as lucro_prejuizo,
  CASE 
    WHEN COALESCE(SUM(CASE 
      WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
      AND cl.destino_tipo = 'CAIXA_OPERACIONAL' 
      THEN cl.valor 
      ELSE 0 
    END), 0) > 0 
    THEN (
      (COALESCE(SUM(CASE 
        WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
        AND cl.origem_tipo = 'CAIXA_OPERACIONAL' 
        THEN cl.valor 
        ELSE 0 
      END), 0) - COALESCE(SUM(CASE 
        WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
        AND cl.destino_tipo = 'CAIXA_OPERACIONAL' 
        THEN cl.valor 
        ELSE 0 
      END), 0)) / COALESCE(SUM(CASE 
        WHEN cl.tipo_transacao = 'APORTE_FINANCEIRO' 
        AND cl.destino_tipo = 'CAIXA_OPERACIONAL' 
        THEN cl.valor 
        ELSE 0 
      END), 0)
    ) * 100
    ELSE 0 
  END as roi_percentual
FROM public.investidores i
LEFT JOIN public.cash_ledger cl ON cl.investidor_id = i.id AND cl.status = 'CONFIRMADO'
GROUP BY i.id, i.user_id, i.nome, i.cpf, i.status;