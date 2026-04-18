-- Refatora fn_ensure_deposito_virtual_on_link para neutralizar revinculação ao MESMO projeto
-- baseada em "uso real" (não em janela de tempo).
--
-- ANTES: ping-pong só atuava se SV anterior fosse <5 minutos atrás
-- AGORA: se o último SV foi para o MESMO projeto e NÃO houve uso real entre o SV e o link,
--        cancela o SV anterior e NÃO cria novo DV — independente do tempo decorrido.
-- Isso elimina pares fantasmas SV+DV BASELINE que inflavam KPIs em revinculações puras.

CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_last_sv_id UUID;
  v_last_sv_date TIMESTAMPTZ;
  v_last_sv_projeto UUID;
  v_last_sv_valor NUMERIC;
  v_adopted_count INT := 0;
  v_recent_dv_exists BOOLEAN;
  v_origem_tipo TEXT;
  v_usage_count INT := 0;
  v_window_seconds NUMERIC;
BEGIN
  -- Só age quando projeto_id muda de NULL para algo
  IF NEW.projeto_id IS NULL OR (OLD.projeto_id IS NOT NULL AND OLD.projeto_id = NEW.projeto_id) THEN
    RETURN NEW;
  END IF;

  -- 1. Buscar o último SAQUE_VIRTUAL desta bookmaker (id + data + projeto + valor)
  SELECT id, created_at, projeto_id_snapshot, valor
    INTO v_last_sv_id, v_last_sv_date, v_last_sv_projeto, v_last_sv_valor
  FROM cash_ledger
  WHERE origem_bookmaker_id = NEW.id
    AND tipo_transacao = 'SAQUE_VIRTUAL'
    AND status = 'CONFIRMADO'
  ORDER BY created_at DESC
  LIMIT 1;

  -- 2. NEUTRALIZAÇÃO POR USO REAL (revinculação ao MESMO projeto):
  --    Se o último SV foi para o mesmo projeto, casa não é broker/investidor,
  --    saldo não mudou, e ZERO uso real entre SV e agora → cancela SV e NÃO cria DV.
  --    Sem limite temporal: o que importa é a ausência de operação real no intervalo.
  IF v_last_sv_id IS NOT NULL
     AND v_last_sv_projeto = NEW.projeto_id
     AND NEW.is_broker_account = false
     AND NEW.investidor_id IS NULL
     AND ABS(COALESCE(v_last_sv_valor, 0) - COALESCE(NEW.saldo_atual, 0)) < 0.02
  THEN
    -- Conta uso real entre v_last_sv_date e NOW():
    -- (1) apostas vinculadas ao projeto+casa
    -- (2) pernas de aposta vinculadas à casa cuja aposta seja deste projeto
    -- (3) ledger real (não-virtual) tocando a casa neste projeto
    SELECT
      (SELECT COUNT(*) FROM apostas_unificada
        WHERE bookmaker_id = NEW.id
          AND projeto_id = NEW.projeto_id
          AND created_at > v_last_sv_date)
      +
      (SELECT COUNT(*) FROM apostas_pernas ap
        JOIN apostas_unificada au ON au.id = ap.aposta_id
        WHERE ap.bookmaker_id = NEW.id
          AND au.projeto_id = NEW.projeto_id
          AND ap.created_at > v_last_sv_date)
      +
      (SELECT COUNT(*) FROM cash_ledger
        WHERE (origem_bookmaker_id = NEW.id OR destino_bookmaker_id = NEW.id)
          AND projeto_id_snapshot = NEW.projeto_id
          AND tipo_transacao IN ('DEPOSITO','SAQUE','CONVERSAO','GANHO_CAMBIAL','PERDA_CAMBIAL','AJUSTE','TRANSFERENCIA')
          AND status IN ('CONFIRMADO','PENDENTE')
          AND created_at > v_last_sv_date
          AND id <> v_last_sv_id)
    INTO v_usage_count;

    IF v_usage_count = 0 THEN
      -- ZERO uso real → revinculação fantasma. Cancela SV anterior e NÃO cria DV.
      v_window_seconds := EXTRACT(EPOCH FROM (NOW() - v_last_sv_date));

      UPDATE cash_ledger
         SET status = 'CANCELADO',
             auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
               'cancelled_at', NOW(),
               'cancelled_reason', 'ping_pong_neutralized_by_usage',
               'cancelled_by_rpc', 'fn_ensure_deposito_virtual_on_link',
               'projeto_id', NEW.projeto_id,
               'window_seconds', v_window_seconds,
               'usage_count', 0
             )
       WHERE id = v_last_sv_id;

      -- Log de debug (best-effort)
      BEGIN
        INSERT INTO financial_debug_log (event_type, payload)
        VALUES ('PINGPONG_SV_CANCELLED', jsonb_build_object(
          'sv_id', v_last_sv_id,
          'sv_valor', v_last_sv_valor,
          'sv_created', v_last_sv_date,
          'window_seconds', v_window_seconds,
          'bookmaker_id', NEW.id,
          'projeto_id', NEW.projeto_id,
          'trigger_version', 'usage_based_v1'
        ));
      EXCEPTION WHEN undefined_table THEN
        NULL;
      END;

      -- Não cria DV — retorno do ciclo nulo
      RETURN NEW;
    END IF;
  END IF;

  -- 3. Adoção de órfãos (depósitos/FX criados após o último SV, sem snapshot)
  IF v_last_sv_date IS NOT NULL THEN
    UPDATE cash_ledger
       SET projeto_id_snapshot = NEW.projeto_id
     WHERE (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
       AND projeto_id_snapshot IS NULL
       AND tipo_transacao IN ('DEPOSITO', 'GANHO_CAMBIAL', 'PERDA_CAMBIAL')
       AND created_at > v_last_sv_date;
    GET DIAGNOSTICS v_adopted_count = ROW_COUNT;
  ELSE
    -- Bookmaker virgem: adota TODOS os órfãos
    UPDATE cash_ledger
       SET projeto_id_snapshot = NEW.projeto_id
     WHERE (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
       AND projeto_id_snapshot IS NULL
       AND tipo_transacao IN ('DEPOSITO', 'GANHO_CAMBIAL', 'PERDA_CAMBIAL');
    GET DIAGNOSTICS v_adopted_count = ROW_COUNT;
  END IF;

  -- 4. Idempotência: ignora se já existe DV recente para esta bookmaker+projeto
  SELECT EXISTS(
    SELECT 1 FROM cash_ledger
    WHERE destino_bookmaker_id = NEW.id
      AND tipo_transacao = 'DEPOSITO_VIRTUAL'
      AND projeto_id_snapshot = NEW.projeto_id
      AND created_at > NOW() - INTERVAL '30 seconds'
  ) INTO v_recent_dv_exists;

  IF v_recent_dv_exists THEN
    RETURN NEW;
  END IF;

  -- 5. Determinar origem_tipo:
  --    - MIGRACAO: houve SV anterior E foi de projeto DIFERENTE (capital realmente migrou)
  --    - BASELINE: primeira vinculação (sem SV anterior)
  --    Obs: revinculação ao mesmo projeto sem uso já foi neutralizada acima.
  --         Se chegar aqui com SV mesmo projeto, é porque houve uso real → trata como BASELINE.
  IF v_last_sv_date IS NOT NULL AND v_last_sv_projeto IS DISTINCT FROM NEW.projeto_id THEN
    v_origem_tipo := 'MIGRACAO';
  ELSE
    v_origem_tipo := 'BASELINE';
  END IF;

  -- 6. Criar DEPOSITO_VIRTUAL com saldo_atual da bookmaker
  IF NEW.saldo_atual > 0 THEN
    INSERT INTO cash_ledger (
      workspace_id, user_id, tipo_transacao, tipo_moeda, moeda, valor,
      destino_bookmaker_id, destino_tipo, projeto_id_snapshot,
      origem_tipo, status, data_transacao, descricao
    ) VALUES (
      NEW.workspace_id, NEW.user_id, 'DEPOSITO_VIRTUAL', 'FIAT', NEW.moeda, NEW.saldo_atual,
      NEW.id, 'BOOKMAKER', NEW.projeto_id,
      v_origem_tipo, 'CONFIRMADO', CURRENT_DATE,
      format('Baseline automático ao vincular ao projeto (saldo_atual=%s, adotado=%s, tipo=%s)',
             NEW.saldo_atual, v_adopted_count, v_origem_tipo)
    );
  END IF;

  RETURN NEW;
END
$function$;