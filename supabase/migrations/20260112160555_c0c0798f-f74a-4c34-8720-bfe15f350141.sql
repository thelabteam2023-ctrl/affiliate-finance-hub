-- =====================================================
-- REFATORAÇÃO: Eventos Promocionais no Ledger Financeiro
-- =====================================================
-- Objetivo: Permitir registro de eventos que impactam saldo
-- de bookmakers/projetos SEM impactar o caixa operacional.
--
-- Casos de uso:
-- - Ganhos de giros grátis
-- - Freebets convertidas
-- - Créditos promocionais
-- - Bônus creditados
-- =====================================================

-- 1. Adicionar flag de impacto no caixa operacional
ALTER TABLE public.cash_ledger
ADD COLUMN IF NOT EXISTS impacta_caixa_operacional boolean NOT NULL DEFAULT true;

-- 2. Adicionar campo para categorizar eventos promocionais
ALTER TABLE public.cash_ledger
ADD COLUMN IF NOT EXISTS evento_promocional_tipo text;

-- 3. Adicionar novos tipos de transação ao constraint
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_tipo_transacao_check;
ALTER TABLE public.cash_ledger
ADD CONSTRAINT cash_ledger_tipo_transacao_check
CHECK (tipo_transacao = ANY (ARRAY[
  'DEPOSITO'::text,
  'SAQUE'::text,
  'TRANSFERENCIA'::text,
  'APORTE_FINANCEIRO'::text,
  'DESPESA_ADMINISTRATIVA'::text,
  'PAGTO_PARCEIRO'::text,
  'COMISSAO_INDICADOR'::text,
  'CREDITO_GIRO'::text,
  'AJUSTE_MANUAL'::text,
  'AJUSTE_SALDO'::text,
  'ESTORNO'::text,
  'CONCILIACAO'::text,
  -- Novos tipos promocionais
  'GIRO_GRATIS_GANHO'::text,
  'FREEBET_CONVERTIDA'::text,
  'BONUS_CREDITADO'::text,
  'CREDITO_PROMOCIONAL'::text
]));

-- 4. Constraint para evento_promocional_tipo
ALTER TABLE public.cash_ledger
ADD CONSTRAINT cash_ledger_evento_promocional_tipo_check
CHECK (evento_promocional_tipo IS NULL OR evento_promocional_tipo = ANY (ARRAY[
  'GIRO_GRATIS'::text,
  'FREEBET'::text,
  'BONUS_DEPOSITO'::text,
  'BONUS_CADASTRO'::text,
  'PROMOCAO_ESPECIAL'::text,
  'CASHBACK'::text
]));

-- 5. Criar índices para queries otimizadas
CREATE INDEX IF NOT EXISTS idx_cash_ledger_impacta_caixa 
ON public.cash_ledger(impacta_caixa_operacional) 
WHERE impacta_caixa_operacional = true;

CREATE INDEX IF NOT EXISTS idx_cash_ledger_evento_promocional 
ON public.cash_ledger(evento_promocional_tipo) 
WHERE evento_promocional_tipo IS NOT NULL;

-- 6. Trigger para garantir regras de negócio em eventos promocionais
CREATE OR REPLACE FUNCTION public.validate_evento_promocional()
RETURNS TRIGGER AS $$
BEGIN
  -- Eventos promocionais NUNCA impactam caixa operacional
  IF NEW.tipo_transacao IN ('GIRO_GRATIS_GANHO', 'FREEBET_CONVERTIDA', 'BONUS_CREDITADO', 'CREDITO_PROMOCIONAL') THEN
    NEW.impacta_caixa_operacional := false;
    
    -- Eventos promocionais devem ter destino_bookmaker ou origem_bookmaker
    IF NEW.destino_bookmaker_id IS NULL AND NEW.origem_bookmaker_id IS NULL THEN
      RAISE EXCEPTION 'Eventos promocionais devem estar associados a uma casa de apostas'
        USING HINT = 'Informe destino_bookmaker_id para créditos ou origem_bookmaker_id para saques';
    END IF;
  END IF;
  
  -- Se marcou como não impacta caixa, não pode ter origem/destino como CAIXA_OPERACIONAL
  IF NEW.impacta_caixa_operacional = false THEN
    IF NEW.origem_tipo = 'CAIXA_OPERACIONAL' OR NEW.destino_tipo = 'CAIXA_OPERACIONAL' THEN
      RAISE EXCEPTION 'Transações que não impactam caixa operacional não podem ter origem/destino como CAIXA_OPERACIONAL'
        USING HINT = 'Remova a referência ao caixa operacional ou altere impacta_caixa_operacional para true';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_evento_promocional ON public.cash_ledger;
CREATE TRIGGER trg_validate_evento_promocional
BEFORE INSERT OR UPDATE ON public.cash_ledger
FOR EACH ROW
EXECUTE FUNCTION public.validate_evento_promocional();

-- 7. Atualizar view de saldo FIAT do caixa (apenas impacta_caixa = true)
CREATE OR REPLACE VIEW public.v_saldo_caixa_fiat 
WITH (security_invoker = true) AS
SELECT 
  moeda,
  COALESCE(sum(
    CASE
      WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN valor
      WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -valor
      ELSE 0
    END
  ), 0) AS saldo
FROM cash_ledger
WHERE 
  tipo_moeda = 'FIAT' 
  AND status = 'CONFIRMADO'
  AND impacta_caixa_operacional = true  -- NOVA CONDIÇÃO
  AND workspace_id = get_current_workspace()
GROUP BY moeda;

-- 8. Atualizar view de saldo CRYPTO do caixa (apenas impacta_caixa = true)
CREATE OR REPLACE VIEW public.v_saldo_caixa_crypto 
WITH (security_invoker = true) AS
SELECT 
  user_id,
  coin,
  COALESCE(sum(
    CASE
      WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN qtd_coin
      WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -qtd_coin
      ELSE 0
    END
  ), 0) AS saldo_coin,
  COALESCE(sum(
    CASE
      WHEN destino_tipo = 'CAIXA_OPERACIONAL' THEN valor_usd
      WHEN origem_tipo = 'CAIXA_OPERACIONAL' THEN -valor_usd
      ELSE 0
    END
  ), 0) AS saldo_usd
FROM cash_ledger
WHERE 
  tipo_moeda = 'CRYPTO' 
  AND status = 'CONFIRMADO'
  AND impacta_caixa_operacional = true  -- NOVA CONDIÇÃO
  AND workspace_id = get_current_workspace()
GROUP BY user_id, coin;

-- 9. Criar view de auditoria para eventos promocionais
CREATE OR REPLACE VIEW public.v_eventos_promocionais
WITH (security_invoker = true) AS
SELECT 
  cl.id,
  cl.created_at,
  cl.data_transacao,
  cl.tipo_transacao,
  cl.evento_promocional_tipo,
  cl.valor,
  cl.moeda,
  cl.descricao,
  cl.user_id,
  cl.workspace_id,
  cl.destino_bookmaker_id,
  cl.origem_bookmaker_id,
  COALESCE(b_dest.nome, b_orig.nome) as bookmaker_nome,
  cl.impacta_caixa_operacional,
  cl.auditoria_metadata
FROM public.cash_ledger cl
LEFT JOIN public.bookmakers b_dest ON b_dest.id = cl.destino_bookmaker_id
LEFT JOIN public.bookmakers b_orig ON b_orig.id = cl.origem_bookmaker_id
WHERE cl.tipo_transacao IN ('GIRO_GRATIS_GANHO', 'FREEBET_CONVERTIDA', 'BONUS_CREDITADO', 'CREDITO_PROMOCIONAL')
   OR cl.evento_promocional_tipo IS NOT NULL
ORDER BY cl.created_at DESC;

-- 10. Comentários para documentação
COMMENT ON COLUMN public.cash_ledger.impacta_caixa_operacional IS 
'Flag que indica se a transação impacta o saldo do caixa operacional. 
Eventos promocionais (giros grátis, freebets) têm esta flag = false, 
pois impactam apenas o saldo da bookmaker/projeto.';

COMMENT ON COLUMN public.cash_ledger.evento_promocional_tipo IS 
'Categorização do tipo de evento promocional (GIRO_GRATIS, FREEBET, etc). 
Usado para auditoria e relatórios específicos de promoções.';

COMMENT ON VIEW public.v_eventos_promocionais IS 
'View de auditoria para todos os eventos promocionais registrados no ledger.
Inclui ganhos de giros grátis, freebets convertidas, bônus creditados, etc.';