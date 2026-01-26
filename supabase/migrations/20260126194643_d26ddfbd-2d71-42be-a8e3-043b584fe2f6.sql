
-- Corrigir search_path das funções criadas
CREATE OR REPLACE FUNCTION public.resolver_tipo_ledger(
  p_estrategia TEXT,
  p_resultado TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  CASE p_estrategia
    WHEN 'EXTRACAO_FREEBET' THEN
      RETURN CASE p_resultado
        WHEN 'GREEN' THEN 'FREEBET_CONVERTIDA'
        WHEN 'RED' THEN 'FREEBET_CONSUMIDA'
        ELSE 'APOSTA_' || p_resultado
      END;
    
    WHEN 'EXTRACAO_BONUS' THEN
      RETURN CASE p_resultado
        WHEN 'GREEN' THEN 'BONUS_EXTRAIDO'
        WHEN 'RED' THEN 'BONUS_CONSUMIDO'
        ELSE 'APOSTA_' || p_resultado
      END;
    
    ELSE
      RETURN 'APOSTA_' || p_resultado;
  END CASE;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolver_impacto_saldo(
  p_fonte_saldo TEXT,
  p_resultado TEXT,
  p_valor NUMERIC
) RETURNS TABLE(
  impacta_saldo_real BOOLEAN,
  impacta_saldo_freebet BOOLEAN,
  impacta_saldo_bonus BOOLEAN,
  delta_real NUMERIC,
  delta_freebet NUMERIC,
  delta_bonus NUMERIC
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  CASE p_fonte_saldo
    WHEN 'REAL' THEN
      RETURN QUERY SELECT 
        TRUE, FALSE, FALSE,
        p_valor, 0::NUMERIC, 0::NUMERIC;
    
    WHEN 'FREEBET' THEN
      IF p_resultado IN ('GREEN', 'MEIO_GREEN') THEN
        RETURN QUERY SELECT 
          TRUE, TRUE, FALSE,
          p_valor, 0::NUMERIC, 0::NUMERIC;
      ELSE
        RETURN QUERY SELECT 
          FALSE, TRUE, FALSE,
          0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
      END IF;
    
    WHEN 'BONUS' THEN
      IF p_resultado IN ('GREEN', 'MEIO_GREEN') THEN
        RETURN QUERY SELECT 
          TRUE, FALSE, TRUE,
          p_valor, 0::NUMERIC, 0::NUMERIC;
      ELSE
        RETURN QUERY SELECT 
          FALSE, FALSE, TRUE,
          0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
      END IF;
    
    ELSE
      RETURN QUERY SELECT 
        TRUE, FALSE, FALSE,
        p_valor, 0::NUMERIC, 0::NUMERIC;
  END CASE;
END;
$$;
