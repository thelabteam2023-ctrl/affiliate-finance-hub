
-- Corrigir função de validação com search_path seguro
CREATE OR REPLACE FUNCTION public.validate_ajuste_manual()
RETURNS TRIGGER AS $$
BEGIN
  -- Se for ajuste manual, motivo é obrigatório
  IF NEW.tipo_transacao IN ('AJUSTE_MANUAL', 'AJUSTE_SALDO', 'ESTORNO') THEN
    IF NEW.ajuste_motivo IS NULL OR TRIM(NEW.ajuste_motivo) = '' THEN
      RAISE EXCEPTION 'Ajustes manuais requerem um motivo obrigatório'
        USING HINT = 'Informe o campo ajuste_motivo com a justificativa do ajuste';
    END IF;
    
    IF NEW.ajuste_direcao IS NULL THEN
      RAISE EXCEPTION 'Ajustes manuais requerem direção (ENTRADA ou SAIDA)'
        USING HINT = 'Informe o campo ajuste_direcao com ENTRADA ou SAIDA';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Corrigir view de auditoria para usar SECURITY INVOKER
DROP VIEW IF EXISTS public.v_ajustes_auditoria;
CREATE VIEW public.v_ajustes_auditoria 
WITH (security_invoker = true) AS
SELECT 
  cl.id,
  cl.created_at,
  cl.data_transacao,
  cl.tipo_transacao,
  cl.ajuste_direcao,
  cl.ajuste_motivo,
  cl.valor,
  cl.moeda,
  cl.origem_tipo,
  cl.destino_tipo,
  cl.descricao,
  cl.user_id,
  cl.workspace_id,
  cl.referencia_transacao_id,
  cl.auditoria_metadata,
  COALESCE(
    cl.destino_bookmaker_id::text,
    cl.origem_bookmaker_id::text,
    cl.destino_conta_bancaria_id::text,
    cl.origem_conta_bancaria_id::text,
    cl.destino_wallet_id::text,
    cl.origem_wallet_id::text
  ) as entidade_afetada_id,
  CASE 
    WHEN cl.destino_bookmaker_id IS NOT NULL OR cl.origem_bookmaker_id IS NOT NULL THEN 'BOOKMAKER'
    WHEN cl.destino_conta_bancaria_id IS NOT NULL OR cl.origem_conta_bancaria_id IS NOT NULL THEN 'CONTA_BANCARIA'
    WHEN cl.destino_wallet_id IS NOT NULL OR cl.origem_wallet_id IS NOT NULL THEN 'WALLET'
    ELSE 'CAIXA_OPERACIONAL'
  END as entidade_afetada_tipo
FROM public.cash_ledger cl
WHERE cl.tipo_transacao IN ('AJUSTE_MANUAL', 'AJUSTE_SALDO', 'ESTORNO', 'CONCILIACAO')
ORDER BY cl.created_at DESC;
