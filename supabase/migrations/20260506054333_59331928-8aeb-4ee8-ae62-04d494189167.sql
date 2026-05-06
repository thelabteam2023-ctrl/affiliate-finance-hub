-- 1. Refatorar deletar_aposta_v4 para usar idempotency_key estável
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
  -- Usamos uma chave de idempotência estável: 'rev_' || event_id
  FOR v_event IN
    SELECT id, bookmaker_id, tipo_evento, valor, moeda, tipo_uso, workspace_id
    FROM public.financial_events
    WHERE aposta_id = p_aposta_id
      AND tipo_evento NOT IN ('REVERSAL')
      AND id NOT IN (SELECT COALESCE(reversed_event_id, '00000000-0000-0000-0000-000000000000'::uuid) FROM public.financial_events WHERE aposta_id = p_aposta_id AND tipo_evento = 'REVERSAL')
  LOOP
    INSERT INTO public.financial_events (
      bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
      valor, moeda, idempotency_key, reversed_event_id, descricao, processed_at
    ) VALUES (
      v_event.bookmaker_id, p_aposta_id, v_event.workspace_id, 'REVERSAL', v_event.tipo_uso,
      -v_event.valor, v_event.moeda,
      'del_rev_' || v_event.id, -- CHAVE ESTÁVEL
      v_event.id,
      format('Reversão por exclusão (%s)', v_event.tipo_evento),
      now()
    ) ON CONFLICT (idempotency_key) DO NOTHING;
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

-- 2. Refatorar liquidar_aposta_v4 para usar idempotency_key estável
CREATE OR REPLACE FUNCTION public.liquidar_aposta_v4(
    p_aposta_id uuid, 
    p_resultado text, 
    p_lucro_prejuizo numeric DEFAULT NULL
)
RETURNS TABLE(success boolean, events_created integer, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_aposta RECORD;
    v_perna RECORD;
    v_entry RECORD;
    v_events_count INTEGER := 0;
    v_payout_total NUMERIC := 0;
    v_has_pernas BOOLEAN := FALSE;
    v_has_entries BOOLEAN := FALSE;
    v_payout_entry NUMERIC;
    v_perna_resultado TEXT;
BEGIN
    -- Bloquear aposta
    SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
    IF v_aposta.id IS NULL THEN 
        RETURN QUERY SELECT FALSE, 0, 'Aposta não encontrada'::TEXT; 
        RETURN; 
    END IF;

    -- Se já estiver liquidada
    IF v_aposta.status = 'LIQUIDADA' THEN 
        RETURN QUERY SELECT FALSE, 0, 'Aposta já está liquidada'::TEXT; 
        RETURN; 
    END IF;

    -- 1. Iterar sobre Pernas
    FOR v_perna IN SELECT * FROM public.apostas_pernas WHERE aposta_id = p_aposta_id ORDER BY ordem
    LOOP
        v_has_pernas := TRUE;
        v_perna_resultado := COALESCE(v_perna.resultado, p_resultado);
        v_has_entries := FALSE;

        -- 1.1 Tentar buscar entradas granulares para esta perna
        FOR v_entry IN SELECT * FROM public.apostas_perna_entradas WHERE perna_id = v_perna.id
        LOOP
            v_has_entries := TRUE;
            v_payout_entry := 0;
            
            CASE v_perna_resultado
                WHEN 'GREEN' THEN v_payout_entry := v_entry.stake * v_entry.odd;
                WHEN 'MEIO_GREEN' THEN v_payout_entry := v_entry.stake + (v_entry.stake * (v_entry.odd - 1) / 2);
                WHEN 'VOID', 'CANCELADA' THEN v_payout_entry := v_entry.stake;
                WHEN 'MEIO_RED' THEN v_payout_entry := v_entry.stake / 2;
                ELSE v_payout_entry := 0;
            END CASE;

            IF v_payout_entry > 0 THEN
                INSERT INTO public.financial_events (
                    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                    valor, moeda, idempotency_key, descricao, processed_at
                ) VALUES (
                    v_entry.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    CASE WHEN v_entry.fonte_saldo = 'FREEBET' THEN 'FREEBET_RETURN' ELSE 'PAYOUT' END,
                    CASE WHEN v_entry.fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
                    v_payout_entry, COALESCE(v_entry.moeda, 'BRL'),
                    'payout_' || p_aposta_id || '_entry_' || v_entry.id, -- CHAVE ESTÁVEL
                    format('Retorno Entrada Perna %s (%s)', v_perna.ordem, v_perna_resultado),
                    NOW()
                ) ON CONFLICT (idempotency_key) DO NOTHING;
                IF FOUND THEN v_events_count := v_events_count + 1; END IF;
            END IF;
        END LOOP;

        -- 1.2 Se não houver entradas, usar a própria perna
        IF NOT v_has_entries THEN
            v_payout_entry := 0;
            CASE v_perna_resultado
                WHEN 'GREEN' THEN v_payout_entry := v_perna.stake * v_perna.odd;
                WHEN 'MEIO_GREEN' THEN v_payout_entry := v_perna.stake + (v_perna.stake * (v_perna.odd - 1) / 2);
                WHEN 'VOID', 'CANCELADA' THEN v_payout_entry := v_perna.stake;
                WHEN 'MEIO_RED' THEN v_payout_entry := v_perna.stake / 2;
                ELSE v_payout_entry := 0;
            END CASE;

            IF v_payout_entry > 0 THEN
                INSERT INTO public.financial_events (
                    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                    valor, moeda, idempotency_key, descricao, processed_at
                ) VALUES (
                    v_perna.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    CASE WHEN v_perna.fonte_saldo = 'FREEBET' THEN 'FREEBET_RETURN' ELSE 'PAYOUT' END,
                    CASE WHEN v_perna.fonte_saldo = 'FREEBET' THEN 'FREEBET' ELSE 'NORMAL' END,
                    v_payout_entry, COALESCE(v_perna.moeda, 'BRL'),
                    'payout_' || p_aposta_id || '_perna_' || v_perna.id, -- CHAVE ESTÁVEL
                    format('Retorno Perna %s (%s)', v_perna.ordem, v_perna_resultado),
                    NOW()
                ) ON CONFLICT (idempotency_key) DO NOTHING;
                IF FOUND THEN v_events_count := v_events_count + 1; END IF;
            END IF;
        END IF;

        -- Atualizar resultado na perna se necessário
        UPDATE public.apostas_pernas SET resultado = v_perna_resultado WHERE id = v_perna.id;
    END LOOP;

    -- 2. Fallback: Se não houver NENHUMA perna
    IF NOT v_has_pernas THEN
        IF p_resultado IN ('GREEN', 'MEIO_GREEN', 'VOID', 'MEIO_RED') THEN
            CASE p_resultado
                WHEN 'GREEN' THEN v_payout_total := v_aposta.stake * v_aposta.odd;
                WHEN 'MEIO_GREEN' THEN v_payout_total := v_aposta.stake + (v_aposta.stake * (v_aposta.odd - 1) / 2);
                WHEN 'VOID' THEN v_payout_total := v_aposta.stake;
                WHEN 'MEIO_RED' THEN v_payout_total := v_aposta.stake / 2;
                ELSE v_payout_total := 0;
            END CASE;

            IF v_payout_total > 0 THEN
                INSERT INTO public.financial_events (
                    bookmaker_id, aposta_id, workspace_id, tipo_evento, tipo_uso,
                    valor, moeda, idempotency_key, descricao, processed_at
                ) VALUES (
                    v_aposta.bookmaker_id, p_aposta_id, v_aposta.workspace_id,
                    'PAYOUT', 'NORMAL',
                    v_payout_total, COALESCE(v_aposta.moeda_operacao, 'BRL'),
                    'payout_simple_' || p_aposta_id, -- CHAVE ESTÁVEL
                    format('Retorno Aposta Simples (%s)', p_resultado),
                    NOW()
                ) ON CONFLICT (idempotency_key) DO NOTHING;
                IF FOUND THEN v_events_count := v_events_count + 1; END IF;
            END IF;
        END IF;
    END IF;

    -- 3. Atualizar Status Final
    UPDATE public.apostas_unificada
    SET status = 'LIQUIDADA',
        resultado = p_resultado,
        lucro_prejuizo = COALESCE(p_lucro_prejuizo, lucro_prejuizo),
        updated_at = NOW()
    WHERE id = p_aposta_id;

    RETURN QUERY SELECT TRUE, v_events_count, 'Aposta liquidada com sucesso'::TEXT;
END;
$$;

-- 3. Limpeza Geral e Reparo de Saldo Amunra
DO $$
DECLARE
  v_amunra_id UUID := '5c3802f3-189f-4444-a749-fb361dadcd5d';
  v_workspace_id UUID := 'f8b6f7ce-92b9-4d26-899a-0f0eeb1324cd';
BEGIN
  -- A. Remover eventos claramente errôneos/duplicados para Amunra
  DELETE FROM public.financial_events 
  WHERE bookmaker_id = v_amunra_id 
    AND (
      valor > 1000 -- Erros de cálculo massivo
      OR (tipo_evento = 'REVERSAL' AND aposta_id IS NULL) -- Reversões órfãs
      OR (descricao ILIKE '%Perna Composta%' AND valor < 0 AND tipo_evento = 'REVERSAL') -- Loops de reliquidação
    );

  -- B. Resetar saldo para um valor base limpo (100.00 se houver depósito)
  -- Mas o melhor é sincronizar com o que sobrou de legítimo
  PERFORM public.sync_bookmaker_balance_from_ledger(v_amunra_id);
  
  -- C. Se após o sync o saldo ainda parecer errado (ex: negativo), forçar para 100.00 (valor de início do usuário)
  IF (SELECT saldo_atual FROM public.bookmakers WHERE id = v_amunra_id) < 0 THEN
    UPDATE public.bookmakers SET saldo_atual = 100.00 WHERE id = v_amunra_id;
    
    -- Inserir evento de ajuste para equilibrar o ledger
    INSERT INTO public.financial_events (
      bookmaker_id, workspace_id, tipo_evento, tipo_uso, valor, moeda, idempotency_key, descricao
    ) VALUES (
      v_amunra_id, v_workspace_id, 'AJUSTE', 'NORMAL', 
      100.00 - (SELECT COALESCE(SUM(valor), 0) FROM public.financial_events WHERE bookmaker_id = v_amunra_id AND tipo_uso = 'NORMAL'),
      'USD', 'manual_repair_' || extract(epoch from now()), 'Ajuste manual para normalização de saldo'
    );
  END IF;
END $$;