-- =====================================================
-- CORREÇÃO CRÍTICA: Unificação do Modelo de Saldo
-- =====================================================
-- PROBLEMA IDENTIFICADO:
-- 1. O trigger atualizar_saldo_bookmaker_v2 atualiza APENAS saldo_atual
-- 2. A RPC get_bookmaker_saldos usa saldo_usd para casas USD
-- 3. Resultado: Cashback em casa USD fica invisível (saldo_atual=50, saldo_usd=0)
--
-- SOLUÇÃO:
-- 1. O trigger vai atualizar o campo correto baseado na moeda
-- 2. A RPC vai usar saldo_atual como fonte única de verdade
-- 3. Migrar dados existentes para sincronizar
-- =====================================================

-- 1. Sincronizar dados existentes: copiar saldo_atual para saldo_usd onde moeda é USD
UPDATE bookmakers
SET saldo_usd = saldo_atual
WHERE moeda IN ('USD', 'USDT', 'USDC')
  AND saldo_atual != 0
  AND (saldo_usd IS NULL OR saldo_usd = 0);

-- 2. Recriar trigger para atualizar o campo correto baseado na moeda
CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker_v2()
RETURNS TRIGGER AS $$
DECLARE
  v_delta NUMERIC;
  v_saldo_anterior NUMERIC;
  v_saldo_novo NUMERIC;
  v_moeda TEXT;
  v_bookmaker_id UUID;
  v_usa_usd BOOLEAN;
BEGIN
  -- Ignorar se não há bookmaker envolvido
  IF NEW.destino_bookmaker_id IS NULL AND NEW.origem_bookmaker_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- CORREÇÃO: Ignorar transações de bônus - afetam apenas saldo_bonus via tabela de bônus
  IF NEW.tipo_transacao IN ('BONUS_CREDITADO', 'BONUS_ESTORNO') THEN
    IF NEW.destino_bookmaker_id IS NOT NULL THEN
      SELECT saldo_atual INTO v_saldo_anterior FROM bookmakers WHERE id = NEW.destino_bookmaker_id;
      INSERT INTO bookmaker_balance_audit (
        bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
        origem, referencia_tipo, referencia_id, observacoes, user_id
      ) VALUES (
        NEW.destino_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_anterior,
        NEW.tipo_transacao, 'cash_ledger', NEW.id, NEW.descricao || ' (não impacta saldo real)', NEW.user_id
      );
    END IF;
    RETURN NEW;
  END IF;

  -- Processar crédito (destino) - aumenta saldo
  IF NEW.destino_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.destino_bookmaker_id;
    
    -- Buscar saldo anterior, moeda e determinar campo correto
    SELECT saldo_atual, saldo_usd, moeda INTO v_saldo_anterior, v_saldo_novo, v_moeda
    FROM bookmakers
    WHERE id = v_bookmaker_id;
    
    IF NOT FOUND THEN
      RAISE WARNING '[atualizar_saldo_bookmaker_v2] Bookmaker destino % não encontrado', v_bookmaker_id;
      RETURN NEW;
    END IF;
    
    -- Determinar se usa saldo_usd
    v_usa_usd := v_moeda IN ('USD', 'USDT', 'USDC');
    
    -- Usar o saldo anterior correto
    IF v_usa_usd THEN
      v_saldo_anterior := COALESCE(v_saldo_novo, 0); -- v_saldo_novo tem saldo_usd aqui
      SELECT saldo_usd INTO v_saldo_anterior FROM bookmakers WHERE id = v_bookmaker_id;
    END IF;
    
    v_saldo_anterior := COALESCE(v_saldo_anterior, 0);
    v_delta := NEW.valor;
    v_saldo_novo := v_saldo_anterior + v_delta;
    
    -- Atualizar o campo correto baseado na moeda
    IF v_usa_usd THEN
      UPDATE bookmakers
      SET saldo_usd = v_saldo_novo,
          saldo_atual = v_saldo_novo, -- Manter sincronizado para compatibilidade
          updated_at = NOW()
      WHERE id = v_bookmaker_id;
    ELSE
      UPDATE bookmakers
      SET saldo_atual = v_saldo_novo,
          updated_at = NOW()
      WHERE id = v_bookmaker_id;
    END IF;
    
    -- Registrar auditoria
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
      origem, referencia_tipo, referencia_id, observacoes, user_id
    ) VALUES (
      v_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_novo,
      NEW.tipo_transacao, 'cash_ledger', NEW.id, NEW.descricao, NEW.user_id
    );
  END IF;

  -- Processar débito (origem) - diminui saldo
  IF NEW.origem_bookmaker_id IS NOT NULL THEN
    v_bookmaker_id := NEW.origem_bookmaker_id;
    
    -- Buscar moeda da bookmaker
    SELECT saldo_atual, saldo_usd, moeda INTO v_saldo_anterior, v_saldo_novo, v_moeda
    FROM bookmakers
    WHERE id = v_bookmaker_id;
    
    IF NOT FOUND THEN
      RAISE WARNING '[atualizar_saldo_bookmaker_v2] Bookmaker origem % não encontrado', v_bookmaker_id;
      RETURN NEW;
    END IF;
    
    -- Determinar se usa saldo_usd
    v_usa_usd := v_moeda IN ('USD', 'USDT', 'USDC');
    
    -- Usar o saldo anterior correto
    IF v_usa_usd THEN
      SELECT saldo_usd INTO v_saldo_anterior FROM bookmakers WHERE id = v_bookmaker_id;
    END IF;
    
    v_saldo_anterior := COALESCE(v_saldo_anterior, 0);
    v_delta := -NEW.valor;
    v_saldo_novo := v_saldo_anterior + v_delta;
    
    -- Atualizar o campo correto baseado na moeda
    IF v_usa_usd THEN
      UPDATE bookmakers
      SET saldo_usd = v_saldo_novo,
          saldo_atual = v_saldo_novo, -- Manter sincronizado
          updated_at = NOW()
      WHERE id = v_bookmaker_id;
    ELSE
      UPDATE bookmakers
      SET saldo_atual = v_saldo_novo,
          updated_at = NOW()
      WHERE id = v_bookmaker_id;
    END IF;
    
    -- Registrar auditoria
    INSERT INTO bookmaker_balance_audit (
      bookmaker_id, workspace_id, saldo_anterior, saldo_novo,
      origem, referencia_tipo, referencia_id, observacoes, user_id
    ) VALUES (
      v_bookmaker_id, NEW.workspace_id, v_saldo_anterior, v_saldo_novo,
      NEW.tipo_transacao, 'cash_ledger', NEW.id, NEW.descricao, NEW.user_id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3. Atualizar a RPC get_bookmaker_saldos para usar saldo_atual como fonte única
-- mas mantendo compatibilidade: para casas USD, usar saldo_usd quando disponível
DROP FUNCTION IF EXISTS public.get_bookmaker_saldos(UUID);

CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id UUID)
RETURNS TABLE (
  id UUID,
  nome TEXT,
  logo_url TEXT,
  moeda TEXT,
  parceiro_id UUID,
  parceiro_nome TEXT,
  parceiro_primeiro_nome TEXT,
  saldo_real NUMERIC,
  saldo_freebet NUMERIC,
  saldo_bonus NUMERIC,
  saldo_em_aposta NUMERIC,
  saldo_disponivel NUMERIC,
  saldo_operavel NUMERIC,
  bonus_rollover_started BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bonus_agg AS (
    SELECT 
      pblb.bookmaker_id,
      COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus,
      BOOL_OR(COALESCE(pblb.rollover_progress, 0) > 0) AS any_rollover_started
    FROM project_bookmaker_link_bonuses pblb
    WHERE pblb.project_id = p_projeto_id
      AND pblb.status = 'credited'
    GROUP BY pblb.bookmaker_id
  ),
  apostas_agg AS (
    SELECT 
      a.bookmaker_id,
      COALESCE(SUM(a.stake), 0) AS total_em_aposta
    FROM apostas_unificada a
    WHERE a.projeto_id = p_projeto_id
      AND a.status IN ('aberta', 'PENDENTE')
      AND a.resultado IS NULL
      AND a.estrategia IN ('SIMPLES', 'MULTIPLA')
      AND a.bookmaker_id IS NOT NULL
    GROUP BY a.bookmaker_id
    
    UNION ALL
    
    SELECT 
      (perna->>'bookmaker_id')::UUID AS bookmaker_id,
      COALESCE(SUM((perna->>'stake')::numeric), 0) AS total_em_aposta
    FROM apostas_unificada a,
         jsonb_array_elements(a.pernas) AS perna
    WHERE a.projeto_id = p_projeto_id
      AND a.status IN ('aberta', 'PENDENTE')
      AND a.estrategia NOT IN ('SIMPLES', 'MULTIPLA')
      AND a.pernas IS NOT NULL
      AND (perna->>'resultado') IS NULL
    GROUP BY (perna->>'bookmaker_id')::UUID
  ),
  apostas_total AS (
    SELECT 
      bookmaker_id,
      COALESCE(SUM(total_em_aposta), 0) AS total_em_aposta
    FROM apostas_agg
    GROUP BY bookmaker_id
  )
  SELECT 
    b.id,
    b.nome::TEXT,
    bc.logo_url::TEXT,
    b.moeda::TEXT,
    b.parceiro_id,
    p.nome::TEXT AS parceiro_nome,
    SPLIT_PART(COALESCE(p.nome, ''), ' ', 1)::TEXT AS parceiro_primeiro_nome,
    -- CORREÇÃO: Usar saldo_atual como fonte única de verdade
    -- Para USD: preferir saldo_usd se disponível, senão usar saldo_atual
    CASE 
      WHEN b.moeda IN ('USD', 'USDT', 'USDC') THEN 
        GREATEST(COALESCE(b.saldo_usd, 0), COALESCE(b.saldo_atual, 0))
      ELSE COALESCE(b.saldo_atual, 0)
    END AS saldo_real,
    COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
    COALESCE(bonus_agg.total_bonus, 0) AS saldo_bonus,
    COALESCE(apostas_total.total_em_aposta, 0) AS saldo_em_aposta,
    -- saldo_disponivel = saldo_real - max(0, apostas - bonus)
    (CASE 
      WHEN b.moeda IN ('USD', 'USDT', 'USDC') THEN 
        GREATEST(COALESCE(b.saldo_usd, 0), COALESCE(b.saldo_atual, 0))
      ELSE COALESCE(b.saldo_atual, 0)
    END - GREATEST(0, COALESCE(apostas_total.total_em_aposta, 0) - COALESCE(bonus_agg.total_bonus, 0))) AS saldo_disponivel,
    -- saldo_operavel = saldo_disponivel + freebet + bonus
    (CASE 
      WHEN b.moeda IN ('USD', 'USDT', 'USDC') THEN 
        GREATEST(COALESCE(b.saldo_usd, 0), COALESCE(b.saldo_atual, 0))
      ELSE COALESCE(b.saldo_atual, 0)
    END - GREATEST(0, COALESCE(apostas_total.total_em_aposta, 0) - COALESCE(bonus_agg.total_bonus, 0)) 
    + COALESCE(b.saldo_freebet, 0) 
    + COALESCE(bonus_agg.total_bonus, 0)) AS saldo_operavel,
    COALESCE(bonus_agg.any_rollover_started, false) AS bonus_rollover_started
  FROM bookmakers b
  LEFT JOIN bookmakers_catalogo bc ON b.bookmaker_catalogo_id = bc.id
  LEFT JOIN parceiros p ON b.parceiro_id = p.id
  LEFT JOIN bonus_agg ON bonus_agg.bookmaker_id = b.id
  LEFT JOIN apostas_total ON apostas_total.bookmaker_id = b.id
  WHERE b.projeto_id = p_projeto_id
    AND b.status = 'ativo';
$$;

-- 4. Também atualizar a RPC get_saldo_operavel_por_projeto para consistência
DROP FUNCTION IF EXISTS public.get_saldo_operavel_por_projeto(UUID[]);

CREATE OR REPLACE FUNCTION public.get_saldo_operavel_por_projeto(p_projeto_ids UUID[])
RETURNS TABLE (
  projeto_id UUID,
  saldo_operavel_brl NUMERIC,
  saldo_operavel_usd NUMERIC,
  total_bookmakers INTEGER
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bonus_por_bookmaker AS (
    SELECT 
      b.projeto_id,
      pblb.bookmaker_id,
      COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus
    FROM project_bookmaker_link_bonuses pblb
    JOIN bookmakers b ON b.id = pblb.bookmaker_id
    WHERE b.projeto_id = ANY(p_projeto_ids)
      AND pblb.status = 'credited'
    GROUP BY b.projeto_id, pblb.bookmaker_id
  ),
  saldos AS (
    SELECT 
      b.projeto_id,
      b.moeda,
      -- CORREÇÃO: Para USD, usar GREATEST(saldo_usd, saldo_atual)
      CASE 
        WHEN b.moeda IN ('USD', 'USDT', 'USDC') THEN 
          GREATEST(COALESCE(b.saldo_usd, 0), COALESCE(b.saldo_atual, 0))
        ELSE COALESCE(b.saldo_atual, 0)
      END AS saldo_real,
      COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
      COALESCE(bpb.total_bonus, 0) AS saldo_bonus
    FROM bookmakers b
    LEFT JOIN bonus_por_bookmaker bpb ON bpb.bookmaker_id = b.id
    WHERE b.projeto_id = ANY(p_projeto_ids)
      AND b.status = 'ativo'
  )
  SELECT 
    s.projeto_id,
    COALESCE(SUM(CASE WHEN s.moeda = 'BRL' THEN s.saldo_real + s.saldo_freebet + s.saldo_bonus ELSE 0 END), 0) AS saldo_operavel_brl,
    COALESCE(SUM(CASE WHEN s.moeda IN ('USD', 'USDT', 'USDC') THEN s.saldo_real + s.saldo_freebet + s.saldo_bonus ELSE 0 END), 0) AS saldo_operavel_usd,
    COUNT(*)::INTEGER AS total_bookmakers
  FROM saldos s
  GROUP BY s.projeto_id;
$$;