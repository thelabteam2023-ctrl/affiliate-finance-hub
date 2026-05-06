-- 1. Trigger para garantir débito de STAKE em cada perna (apostas_pernas)
CREATE OR REPLACE FUNCTION public.fn_perna_auto_stake_ledger()
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

  -- Evitar duplicidade se já houver evento de stake para esta perna (idempotência)
  -- Como o ledger é por aposta_id, usamos uma chave de idempotência específica para a perna
  IF EXISTS (
    SELECT 1 FROM public.financial_events 
    WHERE aposta_id = NEW.aposta_id 
      AND idempotency_key = 'stake_perna_' || NEW.id
  ) THEN
    RETURN NEW;
  END IF;

  SELECT moeda, workspace_id INTO v_moeda, v_workspace_id 
  FROM public.bookmakers WHERE id = NEW.bookmaker_id;
  
  -- Buscar user_id da aposta pai
  SELECT user_id INTO v_user_id FROM public.apostas_unificada WHERE id = NEW.aposta_id;

  -- Inserir evento de débito para a perna
  INSERT INTO public.financial_events (
    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
    valor, moeda, idempotency_key, descricao, created_by
  ) VALUES (
    NEW.bookmaker_id, NEW.aposta_id, v_workspace_id,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR COALESCE(NEW.stake_freebet, 0) > 0 THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
    CASE WHEN NEW.fonte_saldo = 'FREEBET' OR COALESCE(NEW.stake_freebet, 0) > 0 THEN 'FREEBET' ELSE 'NORMAL' END,
    -NEW.stake, -- Débito
    COALESCE(NEW.moeda, v_moeda),
    'stake_perna_' || NEW.id,
    'Débito automático de stake da perna (Trigger)',
    v_user_id
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tr_perna_auto_stake_ledger ON public.apostas_pernas;
CREATE TRIGGER tr_perna_auto_stake_ledger
AFTER INSERT ON public.apostas_pernas
FOR EACH ROW EXECUTE FUNCTION public.fn_perna_auto_stake_ledger();

-- 2. Script de Reparo de Dados para Pernas
DO $$
DECLARE
  r RECORD;
BEGIN
  -- A. Identificar pernas órfãs de STAKE e criar eventos
  FOR r IN 
    SELECT ap.*, b.moeda as b_moeda, au.workspace_id as au_workspace_id, au.user_id as au_user_id
    FROM public.apostas_pernas ap
    JOIN public.bookmakers b ON ap.bookmaker_id = b.id
    JOIN public.apostas_unificada au ON ap.aposta_id = au.id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.financial_events fe 
      WHERE fe.aposta_id = ap.aposta_id AND fe.idempotency_key = 'stake_perna_' || ap.id
    )
    AND ap.stake > 0
  LOOP
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, descricao, created_by
    ) VALUES (
      r.bookmaker_id, r.aposta_id, COALESCE(r.au_workspace_id, (SELECT workspace_id FROM bookmakers WHERE id = r.bookmaker_id)),
      CASE WHEN r.fonte_saldo = 'FREEBET' OR COALESCE(r.stake_freebet, 0) > 0 THEN 'FREEBET_STAKE' ELSE 'STAKE' END,
      CASE WHEN r.fonte_saldo = 'FREEBET' OR COALESCE(r.stake_freebet, 0) > 0 THEN 'FREEBET' ELSE 'NORMAL' END,
      -r.stake,
      COALESCE(r.moeda, r.b_moeda),
      'stake_perna_' || r.id,
      'Reparo: Débito retroativo de stake da perna',
      r.au_user_id
    );
  END LOOP;

  -- B. Sincronizar saldos de todas as bookmakers com o ledger
  FOR r IN SELECT id FROM public.bookmakers LOOP
    PERFORM public.sync_bookmaker_balance_from_ledger(r.id);
  END LOOP;
END $$;
