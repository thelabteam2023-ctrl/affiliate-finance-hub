-- 1. Função de reparo/sincronização de saldo via Ledger
CREATE OR REPLACE FUNCTION public.sync_bookmaker_balance_from_ledger(p_bookmaker_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_saldo_real NUMERIC;
  v_saldo_freebet NUMERIC;
BEGIN
  -- Calcular saldo real total do ledger
  SELECT COALESCE(SUM(valor), 0) INTO v_saldo_real
  FROM public.financial_events
  WHERE bookmaker_id = p_bookmaker_id
    AND tipo_uso = 'NORMAL'
    AND COALESCE(event_scope, 'REAL') = 'REAL';

  -- Calcular saldo freebet total do ledger
  SELECT COALESCE(SUM(valor), 0) INTO v_saldo_freebet
  FROM public.financial_events
  WHERE bookmaker_id = p_bookmaker_id
    AND tipo_uso = 'FREEBET'
    AND COALESCE(event_scope, 'REAL') = 'REAL';

  -- Atualizar a bookmaker
  UPDATE public.bookmakers
  SET saldo_atual = v_saldo_real,
      saldo_freebet = v_saldo_freebet,
      updated_at = now()
  WHERE id = p_bookmaker_id;

  RETURN v_saldo_real;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Trigger para garantir débito de STAKE em qualquer inserção de aposta
CREATE OR REPLACE FUNCTION public.fn_aposta_auto_stake_ledger()
RETURNS TRIGGER AS $$
DECLARE
  v_moeda TEXT;
  v_workspace_id UUID;
  v_user_id UUID;
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

  -- Inserir evento de débito
  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, created_by
  ) VALUES (
    NEW.bookmaker_id, NEW.id, COALESCE(NEW.workspace_id, v_workspace_id),
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR NEW.usar_freebet = true THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR NEW.usar_freebet = true THEN 'FREEBET' ELSE 'NORMAL' END,
    -NEW.stake, -- Débito
    COALESCE(NEW.moeda_operacao, v_moeda),
    'auto_stake_' || NEW.id,
    'Débito automático de stake (Trigger)',
    v_user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_aposta_auto_stake_ledger ON public.apostas_unificada;
CREATE TRIGGER tr_aposta_auto_stake_ledger
AFTER INSERT ON public.apostas_unificada
FOR EACH ROW EXECUTE FUNCTION public.fn_aposta_auto_stake_ledger();

-- 3. Refatorar Deletar Aposta para ser mais agressivo na reversão
CREATE OR REPLACE FUNCTION public.deletar_aposta_v4(p_aposta_id uuid)
 RETURNS TABLE(success boolean, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_aposta RECORD;
  v_event RECORD;
BEGIN
  -- 1. Lock aposta
  SELECT * INTO v_aposta FROM public.apostas_unificada au WHERE au.id = p_aposta_id FOR UPDATE;

  IF v_aposta.id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Aposta não encontrada'::TEXT;
    RETURN;
  END IF;

  -- 2. Reverter TODOS os eventos financeiros associados que ainda não foram revertidos
  FOR v_event IN
    SELECT id, bookmaker_id, tipo_evento, valor, moeda, tipo_uso, workspace_id
    FROM public.financial_events
    WHERE aposta_id = p_aposta_id
      AND tipo_evento NOT IN ('REVERSAL') -- Não reverter a própria reversão
      AND id NOT IN (SELECT COALESCE(reversed_event_id, '00000000-0000-0000-0000-000000000000'::uuid) FROM public.financial_events WHERE aposta_id = p_aposta_id AND tipo_evento = 'REVERSAL')
  LOOP
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at
    ) VALUES (
      v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
      -v_event.valor, v_event.moeda,
      'del_rev_' || v_event.id || '_' || floor(extract(epoch from now())),
      v_event.id,
      format('Reversão por exclusão (%s)', v_event.tipo_evento),
      now()
    );
  END LOOP;

  -- 3. Limpeza de tabelas relacionadas
  DELETE FROM public.apostas_perna_entradas ape 
  USING public.apostas_pernas ap 
  WHERE ape.perna_id = ap.id AND ap.aposta_id = p_aposta_id;

  DELETE FROM public.apostas_pernas ap WHERE ap.aposta_id = p_aposta_id;
  DELETE FROM public.apostas_unificada au WHERE au.id = p_aposta_id;

  RETURN QUERY SELECT TRUE, 'Aposta excluída e saldo recuperado com sucesso via Ledger'::TEXT;
END;
$function$;

-- 4. Script de Reparo de Dados e Sincronização Inicial
DO $$
DECLARE
  r RECORD;
BEGIN
  -- A. Identificar apostas órfãs de STAKE e criar eventos
  FOR r IN 
    SELECT au.*, b.moeda as b_moeda
    FROM public.apostas_unificada au
    JOIN public.bookmakers b ON au.bookmaker_id = b.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.financial_events fe 
      WHERE fe.aposta_id = au.id AND fe.tipo_evento IN ('STAKE', 'FREEBET_STAKE')
    )
    AND au.stake > 0
  LOOP
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, descricao, created_by
    ) VALUES (
      r.bookmaker_id, r.id, r.workspace_id,
      CASE WHEN r.fonte_saldo = 'FREEBET' OR r.usar_freebet = true THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
      CASE WHEN r.fonte_saldo = 'FREEBET' OR r.usar_freebet = true THEN 'FREEBET' ELSE 'NORMAL' END,
      -r.stake,
      COALESCE(r.moeda_operacao, r.b_moeda),
      'repair_stake_' || r.id,
      'Reparo: Débito retroativo de stake',
      r.user_id
    );
  END LOOP;

  -- B. Sincronizar saldos de todas as bookmakers com o ledger
  FOR r IN SELECT id FROM public.bookmakers LOOP
    PERFORM public.sync_bookmaker_balance_from_ledger(r.id);
  END LOOP;
END $$;
