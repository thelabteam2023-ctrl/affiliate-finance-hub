CREATE OR REPLACE FUNCTION public.fn_perna_auto_stake_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_moeda TEXT;
  v_workspace_id UUID;
  v_user_id UUID;
BEGIN
  IF NEW.bookmaker_id IS NULL OR COALESCE(NEW.stake, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Idempotência ampliada: não duplicar se já existe QUALQUER evento de stake
  -- para esta perna específica, seja criado por:
  --  (a) este próprio trigger (key 'stake_perna_<perna_id>')
  --  (b) RPC criar_surebet_atomica (key 'stake_<aposta_id>_idx<n>_<perna_id>')
  --  (c) qualquer outra RPC autorizada que cite o perna_id na chave
  IF EXISTS (
    SELECT 1 FROM public.financial_events
    WHERE aposta_id = NEW.aposta_id
      AND bookmaker_id = NEW.bookmaker_id
      AND tipo_evento IN ('STAKE', 'FREEBET_STAKE')
      AND (
        idempotency_key = 'stake_perna_' || NEW.id
        OR idempotency_key LIKE '%' || NEW.id::text || '%'
      )
  ) THEN
    RETURN NEW;
  END IF;

  SELECT moeda, workspace_id INTO v_moeda, v_workspace_id 
  FROM public.bookmakers WHERE id = NEW.bookmaker_id;
  
  SELECT user_id INTO v_user_id FROM public.apostas_unificada WHERE id = NEW.aposta_id;

  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, created_by
  ) VALUES (
    NEW.bookmaker_id, NEW.aposta_id, v_workspace_id,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR COALESCE(NEW.stake_freebet, 0) > 0 THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR COALESCE(NEW.stake_freebet, 0) > 0 THEN 'FREEBET' ELSE 'NORMAL' END,
    -NEW.stake,
    COALESCE(NEW.moeda, v_moeda),
    'stake_perna_' || NEW.id,
    'Débito automático de stake da perna (Trigger)',
    v_user_id
  );

  RETURN NEW;
END;
$function$;