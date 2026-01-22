
-- =====================================================
-- MIGRAÇÃO: Contas Bancárias com Moeda Obrigatória
-- =====================================================

-- 1. Adicionar campo moeda às contas bancárias
-- Default 'BRL' para dados existentes (todas as transações atuais são BRL)
ALTER TABLE public.contas_bancarias 
ADD COLUMN IF NOT EXISTS moeda TEXT NOT NULL DEFAULT 'BRL';

-- 2. Adicionar constraint para moedas válidas
ALTER TABLE public.contas_bancarias 
ADD CONSTRAINT contas_bancarias_moeda_check 
CHECK (moeda IN ('BRL', 'USD', 'EUR', 'GBP', 'MXN', 'MYR', 'ARS', 'COP'));

-- 3. Criar índice para performance em queries filtradas por moeda
CREATE INDEX IF NOT EXISTS idx_contas_bancarias_moeda 
ON public.contas_bancarias(moeda);

-- 4. Criar índice composto para parceiro + moeda (comum em lookups)
CREATE INDEX IF NOT EXISTS idx_contas_bancarias_parceiro_moeda 
ON public.contas_bancarias(parceiro_id, moeda);

-- 5. Recriar a view v_saldo_parceiro_contas com suporte a moeda nativa
DROP VIEW IF EXISTS public.v_saldo_parceiro_contas;

CREATE VIEW public.v_saldo_parceiro_contas AS
SELECT 
  p.user_id,
  p.id as parceiro_id,
  p.nome as parceiro_nome,
  cb.id as conta_id,
  cb.banco,
  cb.moeda,
  cb.titular,
  COALESCE(SUM(
    CASE 
      WHEN cl.destino_conta_bancaria_id = cb.id THEN 
        COALESCE(cl.valor_destino, cl.valor)
      WHEN cl.origem_conta_bancaria_id = cb.id THEN 
        -COALESCE(cl.valor_origem, cl.valor)
      ELSE 0
    END
  ), 0) as saldo
FROM public.parceiros p
INNER JOIN public.contas_bancarias cb ON cb.parceiro_id = p.id
LEFT JOIN public.cash_ledger cl ON (
  (cl.destino_conta_bancaria_id = cb.id AND cl.moeda = cb.moeda) OR 
  (cl.origem_conta_bancaria_id = cb.id AND cl.moeda = cb.moeda)
)
WHERE cl.status = 'CONFIRMADO' OR cl.id IS NULL
GROUP BY p.user_id, p.id, p.nome, cb.id, cb.banco, cb.moeda, cb.titular;

-- 6. Adicionar comentário documentando a regra de negócio
COMMENT ON COLUMN public.contas_bancarias.moeda IS 
'Moeda nativa da conta bancária. Transações devem corresponder a esta moeda. Uma conta = uma moeda.';
