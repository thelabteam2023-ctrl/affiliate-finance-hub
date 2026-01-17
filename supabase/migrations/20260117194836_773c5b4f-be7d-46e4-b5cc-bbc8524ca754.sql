
-- ============================================
-- FASE 1: Corrigir RPC para usar valor_confirmado
-- ============================================

-- Recriar função recalcular_saldo_bookmaker usando valor_confirmado
CREATE OR REPLACE FUNCTION public.recalcular_saldo_bookmaker(p_bookmaker_id uuid)
RETURNS TABLE(
  bookmaker_id uuid,
  nome text,
  moeda text,
  saldo_anterior numeric,
  depositos numeric,
  saques numeric,
  transferencias_entrada numeric,
  transferencias_saida numeric,
  bonus_creditado numeric,
  lucro_apostas numeric,
  cashback numeric,
  giros_gratis numeric,
  saldo_calculado numeric,
  diferenca numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_depositos numeric := 0;
  v_saques numeric := 0;
  v_transferencias_entrada numeric := 0;
  v_transferencias_saida numeric := 0;
  v_bonus_creditado numeric := 0;
  v_lucro_apostas_diretas numeric := 0;
  v_lucro_apostas_pernas numeric := 0;
  v_lucro_apostas numeric := 0;
  v_cashback numeric := 0;
  v_giros_gratis numeric := 0;
  v_saldo_atual numeric := 0;
  v_nome text;
  v_moeda text;
BEGIN
  -- Buscar dados do bookmaker
  SELECT bk.nome, bk.moeda, bk.saldo_atual
  INTO v_nome, v_moeda, v_saldo_atual
  FROM bookmakers bk
  WHERE bk.id = p_bookmaker_id;

  IF v_nome IS NULL THEN
    RETURN;
  END IF;

  -- Depósitos confirmados: USAR valor_confirmado se disponível (valor que caiu na casa)
  -- Fallback para valor_destino (valor creditado) ou valor (nominal)
  SELECT COALESCE(SUM(
    COALESCE(cl.valor_confirmado, cl.valor_destino, cl.valor)
  ), 0)
  INTO v_depositos
  FROM cash_ledger cl
  WHERE cl.destino_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'DEPOSITO'
    AND UPPER(cl.status) = 'CONFIRMADO';

  -- Saques confirmados: USAR valor_confirmado se disponível
  -- Fallback para valor_origem ou valor
  SELECT COALESCE(SUM(
    COALESCE(cl.valor_confirmado, cl.valor_origem, cl.valor)
  ), 0)
  INTO v_saques
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'SAQUE'
    AND UPPER(cl.status) = 'CONFIRMADO';

  -- Transferências de entrada: Usar valor que chega no destino
  SELECT COALESCE(SUM(
    COALESCE(cl.valor_confirmado, cl.valor_destino, cl.valor)
  ), 0)
  INTO v_transferencias_entrada
  FROM cash_ledger cl
  WHERE cl.destino_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'TRANSFERENCIA_INTERNA'
    AND UPPER(cl.status) = 'CONFIRMADO';

  -- Transferências de saída: Usar valor que sai da origem
  SELECT COALESCE(SUM(
    COALESCE(cl.valor_confirmado, cl.valor_origem, cl.valor)
  ), 0)
  INTO v_transferencias_saida
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = p_bookmaker_id
    AND cl.tipo_transacao = 'TRANSFERENCIA_INTERNA'
    AND UPPER(cl.status) = 'CONFIRMADO';

  -- Bônus creditados (usando bonus_amount)
  SELECT COALESCE(SUM(pb.bonus_amount), 0)
  INTO v_bonus_creditado
  FROM project_bookmaker_link_bonuses pb
  WHERE pb.bookmaker_id = p_bookmaker_id
    AND pb.status = 'credited';

  -- Lucro de apostas DIRETAS (onde bookmaker_id é principal)
  SELECT COALESCE(SUM(au.lucro_prejuizo), 0)
  INTO v_lucro_apostas_diretas
  FROM apostas_unificada au
  WHERE au.bookmaker_id = p_bookmaker_id
    AND UPPER(au.status) = 'LIQUIDADA'
    AND au.lucro_prejuizo IS NOT NULL;

  -- Lucro de PERNAS da tabela normalizada
  SELECT COALESCE(SUM(ap.lucro_prejuizo), 0)
  INTO v_lucro_apostas_pernas
  FROM apostas_pernas ap
  JOIN apostas_unificada au ON au.id = ap.aposta_id
  WHERE ap.bookmaker_id = p_bookmaker_id
    AND UPPER(au.status) = 'LIQUIDADA'
    AND ap.lucro_prejuizo IS NOT NULL;

  v_lucro_apostas := v_lucro_apostas_diretas + v_lucro_apostas_pernas;

  -- Cashback manual
  SELECT COALESCE(SUM(cm.valor), 0)
  INTO v_cashback
  FROM cashback_manual cm
  WHERE cm.bookmaker_id = p_bookmaker_id;

  -- Giros grátis convertidos
  SELECT COALESCE(SUM(gg.valor_retorno), 0)
  INTO v_giros_gratis
  FROM giros_gratis gg
  WHERE gg.bookmaker_id = p_bookmaker_id
    AND UPPER(gg.status) = 'CONVERTIDO';

  RETURN QUERY SELECT
    p_bookmaker_id,
    v_nome,
    v_moeda,
    v_saldo_atual,
    v_depositos,
    v_saques,
    v_transferencias_entrada,
    v_transferencias_saida,
    v_bonus_creditado,
    v_lucro_apostas,
    v_cashback,
    v_giros_gratis,
    (v_depositos - v_saques + v_transferencias_entrada - v_transferencias_saida + v_bonus_creditado + v_lucro_apostas + v_cashback + v_giros_gratis),
    (v_saldo_atual - (v_depositos - v_saques + v_transferencias_entrada - v_transferencias_saida + v_bonus_creditado + v_lucro_apostas + v_cashback + v_giros_gratis));
END;
$$;

COMMENT ON FUNCTION public.recalcular_saldo_bookmaker(uuid) IS 
'Recalcula saldo de um bookmaker baseado em todas as transações usando valor_confirmado quando disponível';

-- ============================================
-- FASE 2: Normalizar pernas JSONB para apostas_pernas
-- ============================================

-- Inserir pernas do JSONB que ainda não estão normalizadas
INSERT INTO apostas_pernas (
  aposta_id,
  bookmaker_id,
  stake,
  odd,
  selecao,
  selecao_livre,
  moeda,
  ordem,
  resultado,
  lucro_prejuizo,
  lucro_prejuizo_brl_referencia,
  stake_brl_referencia,
  gerou_freebet,
  valor_freebet_gerada,
  cotacao_snapshot,
  cotacao_snapshot_at
)
SELECT 
  au.id as aposta_id,
  (perna->>'bookmaker_id')::uuid as bookmaker_id,
  COALESCE((perna->>'stake')::numeric, 0) as stake,
  COALESCE((perna->>'odd')::numeric, 1) as odd,
  COALESCE(perna->>'selecao', 'N/A') as selecao,
  perna->>'selecao_livre' as selecao_livre,
  COALESCE(perna->>'moeda', 'BRL') as moeda,
  COALESCE((perna->>'ordem')::int, perna_idx) as ordem,
  perna->>'resultado' as resultado,
  (perna->>'lucro_prejuizo')::numeric as lucro_prejuizo,
  (perna->>'lucro_prejuizo_brl_referencia')::numeric as lucro_prejuizo_brl_referencia,
  (perna->>'stake_brl_referencia')::numeric as stake_brl_referencia,
  COALESCE((perna->>'gerou_freebet')::boolean, false) as gerou_freebet,
  (perna->>'valor_freebet_gerada')::numeric as valor_freebet_gerada,
  (perna->>'cotacao_snapshot')::numeric as cotacao_snapshot,
  CASE 
    WHEN perna->>'cotacao_snapshot_at' IS NOT NULL 
    THEN (perna->>'cotacao_snapshot_at')::timestamptz 
    ELSE NULL 
  END as cotacao_snapshot_at
FROM apostas_unificada au
CROSS JOIN LATERAL jsonb_array_elements(au.pernas) WITH ORDINALITY AS t(perna, perna_idx)
WHERE au.pernas IS NOT NULL 
  AND jsonb_array_length(au.pernas) > 0
  AND (perna->>'bookmaker_id') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM apostas_pernas ap 
    WHERE ap.aposta_id = au.id
  )
ON CONFLICT DO NOTHING;

-- ============================================
-- FASE 3: Atualizar trigger para usar valor_confirmado
-- ============================================

CREATE OR REPLACE FUNCTION public.atualizar_saldo_bookmaker()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bookmaker_id UUID;
  v_bookmaker_moeda TEXT;
  v_valor NUMERIC;
  v_is_deposit BOOLEAN;
BEGIN
  -- Para INSERT
  IF TG_OP = 'INSERT' THEN
    -- Depósito: usa valor_confirmado se disponível, senão valor_destino, senão valor
    IF NEW.tipo_transacao = 'DEPOSITO' AND NEW.destino_bookmaker_id IS NOT NULL AND NEW.status = 'CONFIRMADO' THEN
      v_bookmaker_id := NEW.destino_bookmaker_id;
      v_is_deposit := TRUE;
      
      -- Buscar moeda operacional do bookmaker
      SELECT moeda INTO v_bookmaker_moeda 
      FROM bookmakers 
      WHERE id = v_bookmaker_id;
      
      -- PRIORIDADE: valor_confirmado > valor_destino > valor_usd/valor
      IF NEW.valor_confirmado IS NOT NULL THEN
        v_valor := NEW.valor_confirmado;
      ELSIF NEW.valor_destino IS NOT NULL THEN
        v_valor := NEW.valor_destino;
      ELSIF NEW.tipo_moeda = 'CRYPTO' THEN
        v_valor := COALESCE(NEW.valor_usd, NEW.valor);
      ELSE
        v_valor := NEW.valor;
      END IF;
      
      -- Atualizar saldo baseado na MOEDA DO BOOKMAKER
      IF v_bookmaker_moeda IN ('USD', 'USDT') THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd + v_valor, 
            saldo_atual = saldo_atual + v_valor,
            updated_at = now()
        WHERE id = v_bookmaker_id;
      ELSE
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual + v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      END IF;
    END IF;
    
    -- Saque: subtrai do bookmaker de origem
    IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL AND NEW.status = 'CONFIRMADO' THEN
      v_bookmaker_id := NEW.origem_bookmaker_id;
      
      SELECT moeda INTO v_bookmaker_moeda 
      FROM bookmakers 
      WHERE id = v_bookmaker_id;
      
      -- PRIORIDADE: valor_confirmado > valor_origem > valor_usd/valor
      IF NEW.valor_confirmado IS NOT NULL THEN
        v_valor := NEW.valor_confirmado;
      ELSIF NEW.valor_origem IS NOT NULL AND NEW.moeda_origem = v_bookmaker_moeda THEN
        v_valor := NEW.valor_origem;
      ELSIF NEW.tipo_moeda = 'CRYPTO' THEN
        v_valor := COALESCE(NEW.valor_usd, NEW.valor);
      ELSE
        v_valor := NEW.valor;
      END IF;
      
      IF v_bookmaker_moeda IN ('USD', 'USDT') THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd - v_valor,
            saldo_atual = saldo_atual - v_valor,
            updated_at = now()
        WHERE id = v_bookmaker_id;
      ELSE
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual - v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Para UPDATE (status PENDENTE -> CONFIRMADO)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'PENDENTE' AND NEW.status = 'CONFIRMADO' THEN
      IF NEW.tipo_transacao = 'SAQUE' AND NEW.origem_bookmaker_id IS NOT NULL THEN
        v_bookmaker_id := NEW.origem_bookmaker_id;
        
        SELECT moeda INTO v_bookmaker_moeda 
        FROM bookmakers 
        WHERE id = v_bookmaker_id;
        
        IF NEW.valor_confirmado IS NOT NULL THEN
          v_valor := NEW.valor_confirmado;
        ELSIF NEW.valor_origem IS NOT NULL AND NEW.moeda_origem = v_bookmaker_moeda THEN
          v_valor := NEW.valor_origem;
        ELSIF NEW.tipo_moeda = 'CRYPTO' THEN
          v_valor := COALESCE(NEW.valor_usd, NEW.valor);
        ELSE
          v_valor := NEW.valor;
        END IF;
        
        IF v_bookmaker_moeda IN ('USD', 'USDT') THEN
          UPDATE bookmakers 
          SET saldo_usd = saldo_usd - v_valor,
              saldo_atual = saldo_atual - v_valor,
              updated_at = now()
          WHERE id = v_bookmaker_id;
        ELSE
          UPDATE bookmakers 
          SET saldo_atual = saldo_atual - v_valor, updated_at = now()
          WHERE id = v_bookmaker_id;
        END IF;
      END IF;
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Para DELETE
  IF TG_OP = 'DELETE' THEN
    -- Reverter depósito confirmado
    IF OLD.tipo_transacao = 'DEPOSITO' AND OLD.destino_bookmaker_id IS NOT NULL AND OLD.status = 'CONFIRMADO' THEN
      v_bookmaker_id := OLD.destino_bookmaker_id;
      
      SELECT moeda INTO v_bookmaker_moeda 
      FROM bookmakers 
      WHERE id = v_bookmaker_id;
      
      IF OLD.valor_confirmado IS NOT NULL THEN
        v_valor := OLD.valor_confirmado;
      ELSIF OLD.valor_destino IS NOT NULL THEN
        v_valor := OLD.valor_destino;
      ELSIF OLD.tipo_moeda = 'CRYPTO' THEN
        v_valor := COALESCE(OLD.valor_usd, OLD.valor);
      ELSE
        v_valor := OLD.valor;
      END IF;
      
      IF v_bookmaker_moeda IN ('USD', 'USDT') THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd - v_valor,
            saldo_atual = saldo_atual - v_valor,
            updated_at = now()
        WHERE id = v_bookmaker_id;
      ELSE
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual - v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      END IF;
    END IF;
    
    -- Reverter saque confirmado
    IF OLD.tipo_transacao = 'SAQUE' AND OLD.origem_bookmaker_id IS NOT NULL AND OLD.status = 'CONFIRMADO' THEN
      v_bookmaker_id := OLD.origem_bookmaker_id;
      
      SELECT moeda INTO v_bookmaker_moeda 
      FROM bookmakers 
      WHERE id = v_bookmaker_id;
      
      IF OLD.valor_confirmado IS NOT NULL THEN
        v_valor := OLD.valor_confirmado;
      ELSIF OLD.valor_origem IS NOT NULL AND OLD.moeda_origem = v_bookmaker_moeda THEN
        v_valor := OLD.valor_origem;
      ELSIF OLD.tipo_moeda = 'CRYPTO' THEN
        v_valor := COALESCE(OLD.valor_usd, OLD.valor);
      ELSE
        v_valor := OLD.valor;
      END IF;
      
      IF v_bookmaker_moeda IN ('USD', 'USDT') THEN
        UPDATE bookmakers 
        SET saldo_usd = saldo_usd + v_valor,
            saldo_atual = saldo_atual + v_valor,
            updated_at = now()
        WHERE id = v_bookmaker_id;
      ELSE
        UPDATE bookmakers 
        SET saldo_atual = saldo_atual + v_valor, updated_at = now()
        WHERE id = v_bookmaker_id;
      END IF;
    END IF;
    
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$function$;

COMMENT ON FUNCTION public.atualizar_saldo_bookmaker() IS 
'Trigger que atualiza saldo do bookmaker usando valor_confirmado (conciliado) quando disponível';
