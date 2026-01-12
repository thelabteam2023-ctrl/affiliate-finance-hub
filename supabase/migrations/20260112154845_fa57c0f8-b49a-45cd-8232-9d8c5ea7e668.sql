
-- ============================================================================
-- MIGRAÇÃO: Adicionar AJUSTE_MANUAL ao cash_ledger
-- ============================================================================
-- Esta migração resolve o problema imediato adicionando o novo tipo de transação
-- mantendo compatibilidade total com dados existentes

-- 1. Remover a constraint antiga de tipo_transacao
ALTER TABLE public.cash_ledger 
DROP CONSTRAINT IF EXISTS cash_ledger_tipo_transacao_check;

-- 2. Criar nova constraint com AJUSTE_MANUAL incluído
ALTER TABLE public.cash_ledger 
ADD CONSTRAINT cash_ledger_tipo_transacao_check 
CHECK (tipo_transacao = ANY (ARRAY[
  'APORTE_FINANCEIRO'::text, 
  'TRANSFERENCIA'::text, 
  'DEPOSITO'::text, 
  'SAQUE'::text, 
  'PAGTO_PARCEIRO'::text, 
  'PAGTO_FORNECEDOR'::text, 
  'COMISSAO_INDICADOR'::text, 
  'BONUS_INDICADOR'::text, 
  'DESPESA_ADMINISTRATIVA'::text, 
  'PAGTO_OPERADOR'::text, 
  'CONCILIACAO'::text, 
  'CREDITO_GIRO'::text, 
  'CREDITO_CASHBACK'::text,
  'AJUSTE_MANUAL'::text,
  'AJUSTE_SALDO'::text,
  'ESTORNO'::text
]));

-- 3. Adicionar colunas para melhor auditoria (sem alterar estrutura existente)
ALTER TABLE public.cash_ledger 
ADD COLUMN IF NOT EXISTS ajuste_motivo text,
ADD COLUMN IF NOT EXISTS ajuste_direcao text,
ADD COLUMN IF NOT EXISTS referencia_transacao_id uuid,
ADD COLUMN IF NOT EXISTS auditoria_metadata jsonb DEFAULT '{}';

-- 4. Criar constraint para ajuste_direcao
ALTER TABLE public.cash_ledger 
ADD CONSTRAINT cash_ledger_ajuste_direcao_check 
CHECK (ajuste_direcao IS NULL OR ajuste_direcao = ANY (ARRAY['ENTRADA'::text, 'SAIDA'::text]));

-- 5. Adicionar FK para referência de transação (para estornos/correções)
ALTER TABLE public.cash_ledger 
ADD CONSTRAINT cash_ledger_referencia_transacao_id_fkey 
FOREIGN KEY (referencia_transacao_id) 
REFERENCES public.cash_ledger(id) 
ON DELETE SET NULL;

-- 6. Criar índice para auditoria
CREATE INDEX IF NOT EXISTS idx_cash_ledger_tipo_transacao ON public.cash_ledger(tipo_transacao);
CREATE INDEX IF NOT EXISTS idx_cash_ledger_ajuste_direcao ON public.cash_ledger(ajuste_direcao) WHERE ajuste_direcao IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cash_ledger_referencia_transacao ON public.cash_ledger(referencia_transacao_id) WHERE referencia_transacao_id IS NOT NULL;

-- 7. Criar função de validação para ajustes manuais
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
$$ LANGUAGE plpgsql;

-- 8. Criar trigger de validação
DROP TRIGGER IF EXISTS trg_validate_ajuste_manual ON public.cash_ledger;
CREATE TRIGGER trg_validate_ajuste_manual
  BEFORE INSERT OR UPDATE ON public.cash_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_ajuste_manual();

-- 9. Criar view de auditoria para ajustes
CREATE OR REPLACE VIEW public.v_ajustes_auditoria AS
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
  -- Identificar entidade afetada
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

-- 10. Comentários para documentação
COMMENT ON COLUMN public.cash_ledger.ajuste_motivo IS 'Motivo obrigatório para ajustes manuais, estornos e conciliações';
COMMENT ON COLUMN public.cash_ledger.ajuste_direcao IS 'Direção do ajuste: ENTRADA (crédito) ou SAIDA (débito)';
COMMENT ON COLUMN public.cash_ledger.referencia_transacao_id IS 'ID da transação original (para estornos ou correções)';
COMMENT ON COLUMN public.cash_ledger.auditoria_metadata IS 'Metadados JSON para auditoria (IP, user agent, etc)';
