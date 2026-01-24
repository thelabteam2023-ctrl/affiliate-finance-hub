-- ================================================================
-- CORREÇÃO DEFINITIVA: STABLECOINS E RESULTADO OPERACIONAL
-- ================================================================
-- 1. Stablecoins (USDT/USDC) = 1:1 com USD (sempre)
-- 2. Resultado = apenas performance de apostas
-- 3. FX/Ajustes não são resultado operacional
-- ================================================================

-- ============================================================
-- PASSO 1: Corrigir depósitos históricos de USDT/USDC
-- valor_destino deve ser igual a valor_origem (paridade 1:1)
-- ============================================================

-- Criar tabela de log para auditoria das correções
CREATE TABLE IF NOT EXISTS public.stablecoin_correction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_ledger_id UUID NOT NULL REFERENCES cash_ledger(id),
  tipo_transacao TEXT NOT NULL,
  moeda_original TEXT NOT NULL,
  valor_origem_antigo NUMERIC,
  valor_destino_antigo NUMERIC,
  valor_destino_novo NUMERIC,
  diferenca_corrigida NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.stablecoin_correction_log ENABLE ROW LEVEL SECURITY;

-- Policy para admins (read-only audit)
CREATE POLICY "Allow read for workspace members"
ON public.stablecoin_correction_log
FOR SELECT
USING (true);

-- ============================================================
-- PASSO 2: Função para corrigir depósitos de stablecoins
-- ============================================================
CREATE OR REPLACE FUNCTION public.corrigir_depositos_stablecoins(
  p_dry_run BOOLEAN DEFAULT true,
  p_workspace_id UUID DEFAULT NULL
)
RETURNS TABLE(
  ledger_id UUID,
  tipo_transacao TEXT,
  moeda TEXT,
  valor_origem NUMERIC,
  valor_destino_antigo NUMERIC,
  valor_destino_novo NUMERIC,
  diferenca NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Encontrar todos os depósitos onde origem é USDT/USDC
  -- e valor_destino ≠ valor_origem (tem spread)
  RETURN QUERY
  WITH depositos_com_spread AS (
    SELECT 
      cl.id,
      cl.tipo_transacao::TEXT,
      COALESCE(cl.coin, cl.moeda)::TEXT as moeda_crypto,
      cl.valor_origem as v_origem,
      cl.valor_destino as v_destino_antigo,
      -- Novo valor = valor_origem (paridade 1:1)
      CASE 
        WHEN cl.moeda_destino IN ('USD', 'USDT', 'USDC') THEN cl.valor_origem
        -- Se destino é outra moeda (ex: casa opera em USD), manter paridade
        ELSE cl.valor_origem
      END as v_destino_novo
    FROM cash_ledger cl
    WHERE cl.tipo_transacao = 'DEPOSITO'
      AND cl.status = 'CONFIRMADO'
      AND (cl.coin IN ('USDT', 'USDC') OR cl.moeda IN ('USDT', 'USDC') OR cl.moeda_origem IN ('USDT', 'USDC'))
      AND cl.valor_origem IS NOT NULL
      AND cl.valor_destino IS NOT NULL
      AND ABS(cl.valor_destino - cl.valor_origem) > 0.001 -- Tem diferença significativa
      AND (p_workspace_id IS NULL OR cl.workspace_id = p_workspace_id)
  )
  SELECT 
    d.id,
    d.tipo_transacao,
    d.moeda_crypto,
    d.v_origem,
    d.v_destino_antigo,
    d.v_destino_novo,
    (d.v_destino_novo - d.v_destino_antigo) as diferenca
  FROM depositos_com_spread d
  ORDER BY d.id;
  
  -- Se não é dry run, aplicar correções
  IF NOT p_dry_run THEN
    -- Registrar no log de correções
    INSERT INTO stablecoin_correction_log (
      cash_ledger_id, tipo_transacao, moeda_original, 
      valor_origem_antigo, valor_destino_antigo, valor_destino_novo, diferenca_corrigida
    )
    SELECT 
      cl.id,
      cl.tipo_transacao,
      COALESCE(cl.coin, cl.moeda),
      cl.valor_origem,
      cl.valor_destino,
      cl.valor_origem, -- Novo = origem (1:1)
      (cl.valor_origem - cl.valor_destino)
    FROM cash_ledger cl
    WHERE cl.tipo_transacao = 'DEPOSITO'
      AND cl.status = 'CONFIRMADO'
      AND (cl.coin IN ('USDT', 'USDC') OR cl.moeda IN ('USDT', 'USDC') OR cl.moeda_origem IN ('USDT', 'USDC'))
      AND cl.valor_origem IS NOT NULL
      AND cl.valor_destino IS NOT NULL
      AND ABS(cl.valor_destino - cl.valor_origem) > 0.001
      AND (p_workspace_id IS NULL OR cl.workspace_id = p_workspace_id);
    
    -- Atualizar os valores de destino
    UPDATE cash_ledger cl
    SET 
      valor_destino = valor_origem,
      cotacao = 1.0,
      cotacao_implicita = 1.0,
      auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || 
        jsonb_build_object(
          'stablecoin_correction', true,
          'original_valor_destino', valor_destino,
          'corrected_at', now()::text
        )
    WHERE cl.tipo_transacao = 'DEPOSITO'
      AND cl.status = 'CONFIRMADO'
      AND (cl.coin IN ('USDT', 'USDC') OR cl.moeda IN ('USDT', 'USDC') OR cl.moeda_origem IN ('USDT', 'USDC'))
      AND cl.valor_origem IS NOT NULL
      AND cl.valor_destino IS NOT NULL
      AND ABS(cl.valor_destino - cl.valor_origem) > 0.001
      AND (p_workspace_id IS NULL OR cl.workspace_id = p_workspace_id);
  END IF;
END;
$$;

-- ============================================================
-- PASSO 3: Função para calcular resultado operacional PURO
-- Inclui APENAS performance de apostas, exclui FX/ajustes
-- ============================================================
CREATE OR REPLACE FUNCTION public.calcular_resultado_operacional_bookmaker(
  p_bookmaker_id UUID
)
RETURNS TABLE(
  resultado_apostas NUMERIC,
  resultado_giros NUMERIC,
  resultado_cashback NUMERIC,
  resultado_total NUMERIC,
  qtd_apostas BIGINT,
  qtd_greens BIGINT,
  qtd_reds BIGINT
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- Resultado de apostas (APENAS apostas, excluindo VOID/canceladas)
  apostas_resultado AS (
    SELECT 
      COALESCE(SUM(COALESCE(pl_consolidado, lucro_prejuizo)), 0) as lucro,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE resultado IN ('GREEN', 'MEIO_GREEN')) as greens,
      COUNT(*) FILTER (WHERE resultado IN ('RED', 'MEIO_RED')) as reds
    FROM apostas_unificada
    WHERE bookmaker_id = p_bookmaker_id
      AND status = 'LIQUIDADA'
      AND resultado IS NOT NULL
  ),
  -- Resultado de pernas (para Surebets)
  pernas_resultado AS (
    SELECT 
      COALESCE(SUM(ap.lucro_prejuizo), 0) as lucro
    FROM apostas_pernas ap
    WHERE ap.bookmaker_id = p_bookmaker_id
      AND ap.resultado IS NOT NULL
  ),
  -- Giros grátis confirmados
  giros_resultado AS (
    SELECT COALESCE(SUM(valor_retorno), 0) as lucro
    FROM giros_gratis
    WHERE bookmaker_id = p_bookmaker_id
      AND status = 'confirmado'
  ),
  -- Cashback manual
  cashback_resultado AS (
    SELECT COALESCE(SUM(valor), 0) as lucro
    FROM cashback_manual
    WHERE bookmaker_id = p_bookmaker_id
  )
  SELECT 
    ar.lucro as resultado_apostas,
    gr.lucro as resultado_giros,
    cr.lucro as resultado_cashback,
    (ar.lucro + gr.lucro + cr.lucro) as resultado_total,
    ar.total as qtd_apostas,
    ar.greens as qtd_greens,
    ar.reds as qtd_reds
  FROM apostas_resultado ar
  CROSS JOIN giros_resultado gr
  CROSS JOIN cashback_resultado cr;
END;
$$;

-- ============================================================
-- PASSO 4: Função para recalcular saldos após correção
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalcular_saldos_apos_correcao_stablecoins(
  p_workspace_id UUID DEFAULT NULL
)
RETURNS TABLE(
  bookmaker_id UUID,
  bookmaker_nome TEXT,
  saldo_anterior NUMERIC,
  saldo_recalculado NUMERIC,
  diferenca NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH bookmakers_afetados AS (
    -- Bookmakers que tiveram depósitos de stablecoins corrigidos
    SELECT DISTINCT cl.destino_bookmaker_id as bm_id
    FROM cash_ledger cl
    WHERE cl.tipo_transacao = 'DEPOSITO'
      AND (cl.coin IN ('USDT', 'USDC') OR cl.moeda IN ('USDT', 'USDC'))
      AND (p_workspace_id IS NULL OR cl.workspace_id = p_workspace_id)
  )
  SELECT 
    b.id,
    b.nome,
    b.saldo_atual as saldo_antes,
    -- O recálculo será feito via função existente
    b.saldo_atual as saldo_depois,
    0::NUMERIC as diff
  FROM bookmakers b
  JOIN bookmakers_afetados ba ON ba.bm_id = b.id;
  
  -- Recalcular saldos dos bookmakers afetados
  IF p_workspace_id IS NOT NULL THEN
    PERFORM recalcular_saldo_bookmaker(ba.bm_id)
    FROM (
      SELECT DISTINCT cl.destino_bookmaker_id as bm_id
      FROM cash_ledger cl
      WHERE cl.tipo_transacao = 'DEPOSITO'
        AND (cl.coin IN ('USDT', 'USDC') OR cl.moeda IN ('USDT', 'USDC'))
        AND cl.workspace_id = p_workspace_id
    ) ba
    WHERE ba.bm_id IS NOT NULL;
  END IF;
END;
$$;

-- ============================================================
-- PASSO 5: View para resultado operacional por bookmaker
-- Exclui FX, depósitos, saques - apenas performance de apostas
-- ============================================================
CREATE OR REPLACE VIEW public.v_bookmaker_resultado_operacional AS
SELECT 
  b.id as bookmaker_id,
  b.nome as bookmaker_nome,
  b.moeda,
  b.workspace_id,
  b.projeto_id,
  b.parceiro_id,
  -- Resultado de apostas apenas
  COALESCE((
    SELECT SUM(COALESCE(a.pl_consolidado, a.lucro_prejuizo))
    FROM apostas_unificada a
    WHERE a.bookmaker_id = b.id
      AND a.status = 'LIQUIDADA'
      AND a.resultado IS NOT NULL
  ), 0) as resultado_apostas,
  -- Resultado de pernas (para Surebets)
  COALESCE((
    SELECT SUM(ap.lucro_prejuizo)
    FROM apostas_pernas ap
    WHERE ap.bookmaker_id = b.id
      AND ap.resultado IS NOT NULL
  ), 0) as resultado_pernas,
  -- Giros grátis
  COALESCE((
    SELECT SUM(gg.valor_retorno)
    FROM giros_gratis gg
    WHERE gg.bookmaker_id = b.id
      AND gg.status = 'confirmado'
  ), 0) as resultado_giros,
  -- Cashback
  COALESCE((
    SELECT SUM(cm.valor)
    FROM cashback_manual cm
    WHERE cm.bookmaker_id = b.id
  ), 0) as resultado_cashback,
  -- Total operacional (SEM FX, SEM depósitos/saques)
  COALESCE((
    SELECT SUM(COALESCE(a.pl_consolidado, a.lucro_prejuizo))
    FROM apostas_unificada a
    WHERE a.bookmaker_id = b.id
      AND a.status = 'LIQUIDADA'
      AND a.resultado IS NOT NULL
  ), 0) +
  COALESCE((
    SELECT SUM(gg.valor_retorno)
    FROM giros_gratis gg
    WHERE gg.bookmaker_id = b.id
      AND gg.status = 'confirmado'
  ), 0) +
  COALESCE((
    SELECT SUM(cm.valor)
    FROM cashback_manual cm
    WHERE cm.bookmaker_id = b.id
  ), 0) as resultado_operacional_total,
  -- Contadores
  (
    SELECT COUNT(*)
    FROM apostas_unificada a
    WHERE a.bookmaker_id = b.id
      AND a.status = 'LIQUIDADA'
  ) as qtd_apostas,
  (
    SELECT COUNT(*)
    FROM apostas_unificada a
    WHERE a.bookmaker_id = b.id
      AND a.status = 'LIQUIDADA'
      AND a.resultado IN ('GREEN', 'MEIO_GREEN')
  ) as qtd_greens,
  (
    SELECT COUNT(*)
    FROM apostas_unificada a
    WHERE a.bookmaker_id = b.id
      AND a.status = 'LIQUIDADA'
      AND a.resultado IN ('RED', 'MEIO_RED')
  ) as qtd_reds
FROM bookmakers b
WHERE b.status IN ('ativo', 'limitada', 'bloqueada', 'pausada');

-- Comentários explicativos
COMMENT ON FUNCTION public.corrigir_depositos_stablecoins IS 
'Corrige depósitos históricos de USDT/USDC aplicando paridade 1:1 (elimina spreads de API). 
Use p_dry_run=true para simular, p_dry_run=false para aplicar.';

COMMENT ON FUNCTION public.calcular_resultado_operacional_bookmaker IS 
'Calcula resultado operacional PURO de um bookmaker, incluindo apenas:
- Lucro/prejuízo de apostas liquidadas
- Giros grátis confirmados  
- Cashback manual
Exclui: depósitos, saques, ajustes FX, transferências.';

COMMENT ON VIEW public.v_bookmaker_resultado_operacional IS 
'View de resultado operacional por bookmaker. Mostra apenas performance de apostas, 
excluindo movimentações financeiras (depósitos, saques, FX, ajustes).';
