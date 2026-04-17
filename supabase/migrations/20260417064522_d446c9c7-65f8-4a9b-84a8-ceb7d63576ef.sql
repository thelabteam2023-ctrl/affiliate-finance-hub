-- =====================================================================
-- MIGRAÇÃO: Freebet segue a casa na desvinculação/re-vinculação (1A + 2B)
-- =====================================================================

-- 1) Adicionar etapa de "desanexação" de freebets na RPC de desvinculação.
--    Freebets ativas (não utilizadas, status PENDENTE/LIBERADA/NAO_LIBERADA)
--    têm projeto_id zerado para "viajar" com a bookmaker.
CREATE OR REPLACE FUNCTION public.desvincular_bookmaker_atomico(
  p_bookmaker_id uuid,
  p_projeto_id uuid,
  p_user_id uuid,
  p_workspace_id uuid,
  p_status_final text,
  p_saldo_virtual_efetivo numeric,
  p_moeda text,
  p_marcar_para_saque boolean DEFAULT false,
  p_is_investor_account boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_saque_virtual_id UUID;
  v_current_projeto_id UUID;
  v_recent_sv_count INTEGER;
  v_sv_status TEXT;
  v_freebets_desanexadas INTEGER := 0;
BEGIN
  SELECT projeto_id INTO v_current_projeto_id
  FROM bookmakers WHERE id = p_bookmaker_id FOR UPDATE;

  IF v_current_projeto_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker já está desvinculada', 'code', 'ALREADY_UNLINKED');
  END IF;

  IF v_current_projeto_id != p_projeto_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker está vinculada a outro projeto', 'code', 'WRONG_PROJECT');
  END IF;

  SELECT COUNT(*) INTO v_recent_sv_count
  FROM cash_ledger
  WHERE origem_bookmaker_id = p_bookmaker_id
    AND tipo_transacao = 'SAQUE_VIRTUAL'
    AND created_at >= (NOW() - INTERVAL '10 seconds');

  IF v_recent_sv_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'SAQUE_VIRTUAL duplicado detectado. Aguarde.', 'code', 'DUPLICATE_DETECTED');
  END IF;

  UPDATE cash_ledger SET projeto_id_snapshot = p_projeto_id
  WHERE (origem_bookmaker_id = p_bookmaker_id OR destino_bookmaker_id = p_bookmaker_id)
    AND status = 'PENDENTE' AND projeto_id_snapshot IS NULL;

  UPDATE cash_ledger SET projeto_id_snapshot = p_projeto_id
  WHERE (origem_bookmaker_id = p_bookmaker_id OR destino_bookmaker_id = p_bookmaker_id)
    AND status = 'LIQUIDADO' AND projeto_id_snapshot IS NULL;

  v_sv_status := CASE WHEN p_is_investor_account THEN 'PENDENTE' ELSE 'CONFIRMADO' END;

  IF p_saldo_virtual_efetivo > 0 THEN
    INSERT INTO cash_ledger (
      tipo_transacao, valor, moeda, workspace_id, user_id,
      origem_bookmaker_id, debito_real,
      descricao, data_transacao,
      impacta_caixa_operacional, tipo_moeda, status, projeto_id_snapshot,
      auditoria_metadata, origem_tipo
    ) VALUES (
      'SAQUE_VIRTUAL', p_saldo_virtual_efetivo, p_moeda, p_workspace_id, p_user_id,
      p_bookmaker_id, p_saldo_virtual_efetivo,
      'Saque virtual – desvinculação do projeto', CURRENT_DATE,
      false, 'FIAT', v_sv_status, p_projeto_id,
      jsonb_build_object(
        'tipo', 'saque_virtual_desvinculacao',
        'projeto_id', p_projeto_id,
        'saldo_snapshot', p_saldo_virtual_efetivo,
        'is_investor_account', p_is_investor_account
      ),
      'MIGRACAO'
    )
    RETURNING id INTO v_saque_virtual_id;
  END IF;

  -- =====================================================================
  -- NOVO (1A + 2B): Desanexar freebets ativas para "viajar" com a casa.
  -- Mantém histórico (data_recebida, motivo, validade, origem) intacto.
  -- A próxima vinculação as adotará automaticamente para o novo projeto.
  -- =====================================================================
  UPDATE freebets_recebidas
  SET projeto_id = NULL,
      updated_at = NOW()
  WHERE bookmaker_id = p_bookmaker_id
    AND projeto_id = p_projeto_id
    AND COALESCE(utilizada, false) = false
    AND status IN ('PENDENTE', 'LIBERADA', 'NAO_LIBERADA');

  GET DIAGNOSTICS v_freebets_desanexadas = ROW_COUNT;

  UPDATE bookmakers
  SET projeto_id = NULL, status = p_status_final,
      estado_conta = CASE WHEN p_status_final IN ('limitada', 'bloqueada', 'encerrada') THEN p_status_final ELSE COALESCE(estado_conta, 'ativo') END
  WHERE id = p_bookmaker_id;

  IF p_marcar_para_saque AND p_saldo_virtual_efetivo > 0 THEN
    UPDATE bookmakers SET aguardando_saque_at = NOW() WHERE id = p_bookmaker_id;
  ELSE
    UPDATE bookmakers SET aguardando_saque_at = NULL WHERE id = p_bookmaker_id AND p_saldo_virtual_efetivo <= 0;
  END IF;

  UPDATE projeto_bookmaker_historico
  SET data_desvinculacao = NOW(), status_final = p_status_final
  WHERE projeto_id = p_projeto_id AND bookmaker_id = p_bookmaker_id AND data_desvinculacao IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'saque_virtual_id', v_saque_virtual_id,
    'saldo_virtual', p_saldo_virtual_efetivo,
    'status_final', p_status_final,
    'sv_status', v_sv_status,
    'freebets_desanexadas', v_freebets_desanexadas
  );
END;
$function$;

-- =====================================================================
-- 2) Trigger AFTER UPDATE em bookmakers para adotar freebets órfãs
--    (projeto_id IS NULL) para o novo projeto na vinculação.
--    Separado do trigger de DEPOSITO_VIRTUAL para isolar responsabilidades.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_adopt_orphan_freebets_on_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_adopted_count INTEGER := 0;
BEGIN
  -- Só age na transição NULL -> projeto_id
  IF OLD.projeto_id IS NOT NULL OR NEW.projeto_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Adota freebets órfãs ativas que pertencem a esta bookmaker
  UPDATE freebets_recebidas
  SET projeto_id = NEW.projeto_id,
      updated_at = NOW()
  WHERE bookmaker_id = NEW.id
    AND projeto_id IS NULL
    AND COALESCE(utilizada, false) = false
    AND status IN ('PENDENTE', 'LIBERADA', 'NAO_LIBERADA');

  GET DIAGNOSTICS v_adopted_count = ROW_COUNT;

  IF v_adopted_count > 0 THEN
    INSERT INTO public.financial_debug_log (
      op, bookmaker_id, old_project_id, new_project_id, resolved_project_id, event_type, payload
    ) VALUES (
      TG_OP, NEW.id, OLD.projeto_id, NEW.projeto_id, NEW.projeto_id,
      'FREEBETS_ADOPTED_ON_LINK',
      jsonb_build_object('adopted_count', v_adopted_count)
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_adopt_orphan_freebets_on_link ON public.bookmakers;
CREATE TRIGGER tr_adopt_orphan_freebets_on_link
AFTER UPDATE OF projeto_id ON public.bookmakers
FOR EACH ROW
WHEN (OLD.projeto_id IS DISTINCT FROM NEW.projeto_id AND NEW.projeto_id IS NOT NULL)
EXECUTE FUNCTION public.fn_adopt_orphan_freebets_on_link();