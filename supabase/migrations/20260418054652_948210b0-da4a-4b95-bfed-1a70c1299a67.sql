-- Corrige fn_ensure_deposito_virtual_on_link para distinguir revinculação ao mesmo projeto
-- vs migração entre projetos diferentes.
--
-- Regra:
--   - Se o último SAQUE_VIRTUAL foi do MESMO projeto que está vinculando agora -> BASELINE (não conta no fluxo)
--   - Se foi de projeto DIFERENTE -> MIGRACAO (conta no fluxo, capital migrou)
--   - Se nunca houve SV -> BASELINE (primeira vinculação)

CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_sv_date TIMESTAMPTZ;
  v_last_sv_projeto UUID;
  v_adopted_count INT := 0;
  v_recent_dv_exists BOOLEAN;
  v_origem_tipo TEXT;
BEGIN
  -- Só age quando projeto_id muda de NULL para algo
  IF NEW.projeto_id IS NULL OR (OLD.projeto_id IS NOT NULL AND OLD.projeto_id = NEW.projeto_id) THEN
    RETURN NEW;
  END IF;

  -- 1. Buscar o último SAQUE_VIRTUAL desta bookmaker (data + projeto)
  SELECT created_at, projeto_id_snapshot
    INTO v_last_sv_date, v_last_sv_projeto
  FROM cash_ledger
  WHERE origem_bookmaker_id = NEW.id
    AND tipo_transacao = 'SAQUE_VIRTUAL'
  ORDER BY created_at DESC
  LIMIT 1;

  -- 2. Adoção de órfãos (depósitos/FX criados após o último SV, sem snapshot)
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

  -- 3. Idempotência: ignora se já existe DV recente para esta bookmaker+projeto
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

  -- 4. Determinar origem_tipo:
  --    - MIGRACAO: houve SV anterior E foi de projeto DIFERENTE (capital realmente migrou)
  --    - BASELINE: primeira vinculação OU revinculação ao MESMO projeto (saldo já existente, sem capital novo)
  IF v_last_sv_date IS NOT NULL AND v_last_sv_projeto IS DISTINCT FROM NEW.projeto_id THEN
    v_origem_tipo := 'MIGRACAO';
  ELSE
    v_origem_tipo := 'BASELINE';
  END IF;

  -- 5. Criar DEPOSITO_VIRTUAL com saldo_atual da bookmaker
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
END;
$$;