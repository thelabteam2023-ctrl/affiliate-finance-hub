-- Fase 1: Migração do Banco de Dados para Desacoplamento de Métodos

-- 1.1 Adicionar campo permite_saque_fiat ao bookmakers_catalogo
ALTER TABLE public.bookmakers_catalogo 
ADD COLUMN IF NOT EXISTS permite_saque_fiat BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.bookmakers_catalogo.permite_saque_fiat IS 'Permite saque em FIAT (conta bancária) para casas USD. Só relevante para casas não regulamentadas.';

-- 1.2 Atualizar constraint de tipo_transacao para incluir todos os tipos existentes + CONVERSAO_INTERNA
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_tipo_transacao_check;

ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_tipo_transacao_check 
CHECK (tipo_transacao IN (
  'DEPOSITO', 
  'SAQUE', 
  'TRANSFERENCIA', 
  'APORTE_INVESTIDOR', 
  'RESGATE_INVESTIDOR',
  'APORTE_OPERADOR',
  'RESGATE_OPERADOR',
  'AJUSTE',
  'EVENTO_PROMOCIONAL',
  'CONVERSAO_INTERNA',
  'AJUSTE_MANUAL',
  'APORTE_FINANCEIRO',
  'COMISSAO_INDICADOR',
  'CREDITO_GIRO',
  'DESPESA_ADMINISTRATIVA',
  'PAGTO_PARCEIRO'
));

-- 1.3 Adicionar campos de auditoria ao cash_ledger
ALTER TABLE public.cash_ledger 
ADD COLUMN IF NOT EXISTS metodo_origem TEXT,
ADD COLUMN IF NOT EXISTS metodo_destino TEXT,
ADD COLUMN IF NOT EXISTS conversao_aplicada BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS conversao_referencia_id UUID REFERENCES public.cash_ledger(id);

COMMENT ON COLUMN public.cash_ledger.metodo_origem IS 'Método de origem: CRYPTO ou FIAT';
COMMENT ON COLUMN public.cash_ledger.metodo_destino IS 'Método de destino: CRYPTO ou FIAT';
COMMENT ON COLUMN public.cash_ledger.conversao_aplicada IS 'Indica se houve conversão de moeda na transação';
COMMENT ON COLUMN public.cash_ledger.conversao_referencia_id IS 'Referência para a transação de conversão associada';

-- 1.4 Criar índice para conversao_referencia_id
CREATE INDEX IF NOT EXISTS idx_cash_ledger_conversao_referencia 
ON public.cash_ledger(conversao_referencia_id) 
WHERE conversao_referencia_id IS NOT NULL;