-- 1. RPC idempotente: limpa órfãos mesmo se status já é PENDENTE
CREATE OR REPLACE FUNCTION public.reverter_liquidacao_v4(p_aposta_id uuid)
 RETURNS TABLE(success boolean, message text, reversals_created integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
  v_count INTEGER := 0;
  v_had_orphan_result BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_aposta FROM apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
  
  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT, 0;
    RETURN;
  END IF;
  
  -- IDEMPOTÊNCIA: detectar estado órfão (status PENDENTE com resultado definitivo)
  v_had_orphan_result := (
    v_aposta.status = 'PENDENTE' 
    AND v_aposta.resultado IS NOT NULL 
    AND v_aposta.resultado <> 'PENDENTE'
  );

  -- Se status é LIQUIDADA, executar reversão completa (eventos financeiros)
  IF v_aposta.status = 'LIQUIDADA' THEN
    FOR v_event IN 
      SELECT * FROM financial_events 
      WHERE aposta_id = p_aposta_id 
        AND tipo_evento IN ('PAYOUT', 'VOID_REFUND', 'FREEBET_PAYOUT')
        AND NOT EXISTS (
          SELECT 1 FROM financial_events r 
          WHERE r.reversed_event_id = financial_events.id
        )
    LOOP
      INSERT INTO financial_events (
        bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
        valor, moeda, idempotency_key, reversed_event_id, descricao, 
        processed_at, created_by
      ) VALUES (
        v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
        -v_event.valor, v_event.moeda,
        'reversal_' || v_event.id::TEXT,
        v_event.id,
        'Reversão de liquidação', now(), auth.uid()
      );
      v_count := v_count + 1;
    END LOOP;
  ELSIF NOT v_had_orphan_result THEN
    -- Não é LIQUIDADA e não há órfão para limpar: nada a fazer
    RETURN QUERY SELECT FALSE, 'Aposta não está liquidada e não há resíduo a limpar'::TEXT, 0;
    RETURN;
  END IF;
  
  -- Sempre limpar campos no pai e nas pernas (cobre tanto reversão completa quanto cleanup de órfão)
  UPDATE apostas_unificada 
  SET status = 'PENDENTE',
      resultado = NULL,
      lucro_prejuizo = NULL,
      lucro_prejuizo_brl_referencia = NULL,
      pl_consolidado = NULL,
      retorno_consolidado = NULL,
      updated_at = now()
  WHERE id = p_aposta_id;
  
  UPDATE apostas_pernas
  SET resultado = NULL,
      lucro_prejuizo = NULL,
      lucro_prejuizo_brl_referencia = NULL,
      updated_at = now()
  WHERE aposta_id = p_aposta_id;
  
  IF v_had_orphan_result AND v_count = 0 THEN
    RETURN QUERY SELECT TRUE, 'Resíduo órfão de liquidação limpo (sem eventos a reverter)'::TEXT, 0;
  ELSE
    RETURN QUERY SELECT TRUE, 'Liquidação revertida com sucesso'::TEXT, v_count;
  END IF;
END;
$function$;

-- 2. Trigger de consistência: bloqueia status=PENDENTE com resultado definitivo
CREATE OR REPLACE FUNCTION public.fn_apostas_unificada_consistencia_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'PENDENTE' 
     AND NEW.resultado IS NOT NULL 
     AND NEW.resultado <> 'PENDENTE' THEN
    RAISE EXCEPTION 'Inconsistência detectada: aposta % não pode ter status=PENDENTE com resultado=% (use status=LIQUIDADA ou limpe o resultado)',
      NEW.id, NEW.resultado
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_apostas_unificada_consistencia_status ON public.apostas_unificada;
CREATE TRIGGER tg_apostas_unificada_consistencia_status
BEFORE INSERT OR UPDATE ON public.apostas_unificada
FOR EACH ROW
EXECUTE FUNCTION public.fn_apostas_unificada_consistencia_status();

-- 3. Cleanup do registro órfão identificado (Botafogo x Chapecoense)
-- Limpa o resultado para que volte a aparecer corretamente como aposta aberta
UPDATE public.apostas_unificada
SET resultado = NULL,
    lucro_prejuizo = NULL,
    lucro_prejuizo_brl_referencia = NULL,
    pl_consolidado = NULL,
    retorno_consolidado = NULL,
    updated_at = now()
WHERE id = 'f4c204c6-bbf1-4bf2-a426-1f021afa3749'
  AND status = 'PENDENTE'
  AND resultado IS NOT NULL
  AND resultado <> 'PENDENTE';

UPDATE public.apostas_pernas
SET resultado = NULL,
    lucro_prejuizo = NULL,
    lucro_prejuizo_brl_referencia = NULL,
    updated_at = now()
WHERE aposta_id = 'f4c204c6-bbf1-4bf2-a426-1f021afa3749';