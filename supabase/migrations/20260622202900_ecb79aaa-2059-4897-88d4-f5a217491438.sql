CREATE OR REPLACE FUNCTION public.fn_aposta_auto_stake_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_moeda TEXT;
  v_workspace_id UUID;
  v_user_id UUID;
  v_is_lay BOOLEAN;
  v_debito NUMERIC;
BEGIN
  -- Só processa se tiver bookmaker_id e stake > 0
  IF NEW.bookmaker_id IS NULL OR COALESCE(NEW.stake, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Evitar duplicidade se já houver evento de stake (idempotência)
  IF EXISTS (
    SELECT 1 FROM public.financial_events
    WHERE aposta_id = NEW.id AND tipo_evento IN ('STAKE', 'FREEBET_STAKE')
  ) THEN
    RETURN NEW;
  END IF;

  SELECT moeda, workspace_id INTO v_moeda, v_workspace_id
  FROM public.bookmakers WHERE id = NEW.bookmaker_id;

  v_user_id := NEW.user_id;

  -- ============================================================
  -- DETECÇÃO LAY (Exchange Lay simples)
  -- LAY é caracterizado por: modo_entrada=EXCHANGE + lay_liability > 0.
  -- Se modo_entrada=EXCHANGE mas lay_liability é NULL/0 (preenchimento
  -- incompleto ou BACK em exchange), cai no ramo BACK por segurança
  -- (debita -stake) em vez de silenciosamente debitar 0.
  -- ============================================================
  v_is_lay := (
    NEW.modo_entrada = 'EXCHANGE'
    AND NEW.lay_liability IS NOT NULL
    AND NEW.lay_liability > 0
  );

  -- Débito ao ledger:
  --  LAY  -> -liability (risco máximo no caso de perda)
  --  BACK -> -stake     (comportamento existente, inalterado)
  v_debito := CASE WHEN v_is_lay THEN -NEW.lay_liability ELSE -NEW.stake END;

  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, created_by
  ) VALUES (
    NEW.bookmaker_id, NEW.id, COALESCE(NEW.workspace_id, v_workspace_id),
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR NEW.usar_freebet = true THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR NEW.usar_freebet = true THEN 'FREEBET' ELSE 'NORMAL' END,
    v_debito,
    COALESCE(NEW.moeda_operacao, v_moeda),
    'auto_stake_' || NEW.id,
    CASE
      WHEN v_is_lay THEN format('Débito automático de liability LAY (Trigger) | stake=%s odd=%s liability=%s',
                                NEW.stake, COALESCE(NEW.lay_odd, NEW.odd), NEW.lay_liability)
      ELSE 'Débito automático de stake (Trigger)'
    END,
    v_user_id
  );

  RETURN NEW;
END;
$function$;