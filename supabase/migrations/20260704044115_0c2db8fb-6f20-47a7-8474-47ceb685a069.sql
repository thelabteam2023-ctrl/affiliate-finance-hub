
-- 1) Reescrever trigger: nunca bloquear, apenas sinalizar
CREATE OR REPLACE FUNCTION public.fn_detect_duplicate_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing_id UUID;
  v_ignore_duplicate BOOLEAN;
BEGIN
  IF NEW.tipo_transacao != 'SAQUE' THEN RETURN NEW; END IF;

  v_ignore_duplicate := COALESCE((NEW.auditoria_metadata->>'ignore_duplicate')::boolean, false);
  IF v_ignore_duplicate THEN
    RETURN NEW;
  END IF;

  -- Só analisa quando o saque está entrando em estado "vivo" (PENDENTE ou CONFIRMADO)
  IF NEW.status IN ('PENDENTE','CONFIRMADO')
     AND (OLD IS NULL OR OLD.status IS DISTINCT FROM NEW.status) THEN

    SELECT id
    INTO v_existing_id
    FROM cash_ledger
    WHERE id != NEW.id
      AND tipo_transacao = 'SAQUE'
      AND status IN ('PENDENTE','CONFIRMADO','LIQUIDADO')
      AND origem_bookmaker_id = NEW.origem_bookmaker_id
      AND ABS(valor - NEW.valor) < 0.01
      AND COALESCE(destino_parceiro_id, '00000000-0000-0000-0000-000000000000') = COALESCE(NEW.destino_parceiro_id, '00000000-0000-0000-0000-000000000000')
      AND COALESCE(destino_conta_bancaria_id, '00000000-0000-0000-0000-000000000000') = COALESCE(NEW.destino_conta_bancaria_id, '00000000-0000-0000-0000-000000000000')
      AND COALESCE(destino_wallet_id, '00000000-0000-0000-0000-000000000000') = COALESCE(NEW.destino_wallet_id, '00000000-0000-0000-0000-000000000000')
      AND ABS(EXTRACT(EPOCH FROM (NEW.data_transacao::timestamp - data_transacao::timestamp))) / 3600 <= 48
    ORDER BY created_at ASC LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Apenas anota nos metadados. NÃO altera o status.
      NEW.auditoria_metadata := COALESCE(NEW.auditoria_metadata, '{}'::jsonb) ||
        jsonb_build_object(
          'duplicidade_detectada', true,
          'saque_similar_id', v_existing_id,
          'saque_similar_detectado_em', NOW()
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2) Reabrir saques que ficaram travados pela regra antiga
UPDATE cash_ledger
SET status = 'PENDENTE',
    auditoria_metadata = COALESCE(auditoria_metadata,'{}'::jsonb)
      || jsonb_build_object(
        'duplicidade_detectada', true,
        'reaberto_por_nova_regra', NOW()
      )
WHERE status = 'DUPLICADO_BLOQUEADO';
