-- 1. Atualizar o trigger para lidar com DELETE e UPDATE também
CREATE OR REPLACE FUNCTION public.fn_financial_events_sync_balance()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_delta NUMERIC;
  v_bookmaker_id UUID;
  v_tipo_uso TEXT;
  v_event_scope TEXT;
BEGIN
  -- Identificar os dados baseados na operação
  IF (TG_OP = 'DELETE') THEN
    v_delta := -OLD.valor; -- Reverte o valor
    v_bookmaker_id := OLD.bookmaker_id;
    v_tipo_uso := OLD.tipo_uso;
    v_event_scope := COALESCE(OLD.event_scope, 'REAL');
  ELSE
    v_delta := NEW.valor;
    v_bookmaker_id := NEW.bookmaker_id;
    v_tipo_uso := NEW.tipo_uso;
    v_event_scope := COALESCE(NEW.event_scope, 'REAL');
    
    -- Se for UPDATE, precisamos subtrair o valor antigo e somar o novo
    IF (TG_OP = 'UPDATE') THEN
      v_delta := NEW.valor - OLD.valor;
    END IF;
  END IF;

  -- Se não houve mudança de valor ou é virtual, ignora
  IF v_delta = 0 OR v_event_scope = 'VIRTUAL' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Aplicar delta no saldo correto
  IF v_tipo_uso = 'FREEBET' THEN
    UPDATE public.bookmakers
    SET saldo_freebet = COALESCE(saldo_freebet, 0) + v_delta,
        updated_at = now()
    WHERE id = v_bookmaker_id;
  ELSE
    UPDATE public.bookmakers
    SET saldo_atual = COALESCE(saldo_atual, 0) + v_delta,
        updated_at = now()
    WHERE id = v_bookmaker_id;
  END IF;

  -- Marcar como processado se for INSERT/UPDATE
  IF (TG_OP <> 'DELETE') THEN
    NEW.processed_at := now();
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- Recriar trigger com suporte total
DROP TRIGGER IF EXISTS tr_financial_events_sync_balance ON public.financial_events;
CREATE TRIGGER tr_financial_events_sync_balance
AFTER INSERT OR UPDATE OR DELETE ON public.financial_events
FOR EACH ROW EXECUTE FUNCTION public.fn_financial_events_sync_balance();

-- 2. Refatorar Reliquidação para preservar STAKE
CREATE OR REPLACE FUNCTION public.reliquidar_aposta_v6(p_aposta_id uuid, p_novo_resultado text, p_lucro_prejuizo numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_aposta RECORD;
BEGIN
    -- 1. Lock
    SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
    IF NOT FOUND THEN 
        RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada'); 
    END IF;

    -- 2. Deletar APENAS eventos de retorno (PAYOUT, FREEBET_RETURN, etc), preservando o STAKE
    -- O trigger agora cuidará de estornar o saldo automaticamente ao deletar
    DELETE FROM public.financial_events 
    WHERE aposta_id = p_aposta_id 
    AND tipo_evento IN ('PAYOUT', 'FREEBET_RETURN', 'VOID_REFUND', 'AJUSTE', 'REVERSAL');

    -- 3. Resetar status
    UPDATE public.apostas_unificada 
    SET status = 'PENDENTE', 
        resultado = NULL,
        lucro_prejuizo = 0
    WHERE id = p_aposta_id;

    -- 4. Chamar nova liquidação
    PERFORM public.liquidar_aposta_v4(p_aposta_id, p_novo_resultado, p_lucro_prejuizo);

    -- 5. Sincronização final de segurança
    PERFORM public.sync_bookmaker_balance_from_ledger(v_aposta.bookmaker_id);

    RETURN jsonb_build_object('success', true);
END;
$function$;
