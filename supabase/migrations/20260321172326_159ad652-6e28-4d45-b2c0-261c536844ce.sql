-- 1) Corrigir definitivamente o trigger de vinculação para NÃO criar DEPOSITO_VIRTUAL
-- quando o saldo já estiver coberto por lançamentos reais adotados para o projeto.
CREATE OR REPLACE FUNCTION public.fn_ensure_deposito_virtual_on_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_dv_count integer;
  v_last_sv_date timestamptz;
  v_adopted_count integer;
  v_net_real_flow numeric := 0;
  v_virtual_amount numeric := 0;
BEGIN
  IF OLD.projeto_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.projeto_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT MAX(created_at) INTO v_last_sv_date
  FROM public.cash_ledger
  WHERE tipo_transacao = 'SAQUE_VIRTUAL'
    AND origem_bookmaker_id = NEW.id
    AND status = 'CONFIRMADO';

  UPDATE public.cash_ledger
  SET projeto_id_snapshot = NEW.projeto_id
  WHERE projeto_id_snapshot IS NULL
    AND status = 'CONFIRMADO'
    AND tipo_transacao IN (
      'DEPOSITO',
      'SAQUE',
      'AJUSTE_MANUAL',
      'GANHO_CAMBIAL',
      'PERDA_CAMBIAL',
      'BONUS_CREDITADO',
      'CASHBACK_MANUAL',
      'GIRO_GRATIS'
    )
    AND (
      destino_bookmaker_id = NEW.id
      OR origem_bookmaker_id = NEW.id
    )
    AND (v_last_sv_date IS NULL OR created_at > v_last_sv_date);

  GET DIAGNOSTICS v_adopted_count = ROW_COUNT;

  IF v_adopted_count > 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] Adotados % lançamentos órfãos para projeto % (bookmaker %, corte: %)',
      v_adopted_count, NEW.projeto_id, NEW.id, COALESCE(v_last_sv_date::text, 'VIRGEM');
  END IF;

  IF NEW.saldo_atual <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_existing_dv_count
  FROM public.cash_ledger
  WHERE tipo_transacao = 'DEPOSITO_VIRTUAL'
    AND destino_bookmaker_id = NEW.id
    AND projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO'
    AND created_at >= (now() - interval '30 seconds');

  IF v_existing_dv_count > 0 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(
    CASE
      WHEN destino_bookmaker_id = NEW.id THEN valor
      WHEN origem_bookmaker_id = NEW.id THEN -valor
      ELSE 0
    END
  ), 0)
  INTO v_net_real_flow
  FROM public.cash_ledger
  WHERE projeto_id_snapshot = NEW.projeto_id
    AND status = 'CONFIRMADO'
    AND (destino_bookmaker_id = NEW.id OR origem_bookmaker_id = NEW.id)
    AND tipo_transacao NOT IN ('DEPOSITO_VIRTUAL', 'SAQUE_VIRTUAL');

  v_virtual_amount := NEW.saldo_atual - v_net_real_flow;

  IF v_virtual_amount <= 0 THEN
    RAISE LOG '[fn_ensure_deposito_virtual_on_link] SKIP: saldo_atual=% já coberto por fluxo real=% bookmaker=% projeto=%',
      NEW.saldo_atual, v_net_real_flow, NEW.id, NEW.projeto_id;
    RETURN NEW;
  END IF;

  INSERT INTO public.cash_ledger (
    tipo_transacao,
    status,
    valor,
    moeda,
    tipo_moeda,
    destino_bookmaker_id,
    projeto_id_snapshot,
    user_id,
    workspace_id,
    data_transacao,
    impacta_caixa_operacional,
    descricao
  ) VALUES (
    'DEPOSITO_VIRTUAL',
    'CONFIRMADO',
    v_virtual_amount,
    NEW.moeda,
    CASE
      WHEN NEW.moeda IN ('BTC','ETH','USDT','USDC','SOL','BNB','ADA','XRP','DOGE','MATIC') THEN 'CRYPTO'
      ELSE 'FIAT'
    END,
    NEW.id,
    NEW.projeto_id,
    NEW.user_id,
    NEW.workspace_id,
    CURRENT_DATE,
    false,
    'Depósito virtual – baseline na vinculação (trigger automático)'
  );

  RAISE LOG '[fn_ensure_deposito_virtual_on_link] DV criado: valor=% (saldo=% - fluxo_real=%) bookmaker=% projeto=%',
    v_virtual_amount, NEW.saldo_atual, v_net_real_flow, NEW.id, NEW.projeto_id;

  RETURN NEW;
END;
$$;

-- 2) Cancelar os lançamentos indevidos visíveis no histórico.
UPDATE public.cash_ledger
SET status = 'CANCELADO',
    descricao = TRIM(BOTH FROM CONCAT(COALESCE(descricao, ''), ' [CANCELADO_AUTOMATICAMENTE: duplicidade operacional causada por safety net na vinculação]'))
WHERE id IN (
  '73631a62-16ca-4180-a853-719ee37167c9',
  '1054bc7e-9018-47ac-82bd-5542131c12c3'
)
AND status = 'CONFIRMADO';

-- 3) Neutralizar o impacto financeiro do depósito manual duplicado.
INSERT INTO public.financial_events (
  id,
  bookmaker_id,
  workspace_id,
  tipo_evento,
  tipo_uso,
  origem,
  valor,
  moeda,
  idempotency_key,
  descricao,
  metadata,
  created_at,
  created_by
)
SELECT
  gen_random_uuid(),
  'c2a832f6-cb95-44a6-ba71-3896e1c04ec4',
  'feee9758-a7f4-474c-b2b1-679b66ec1cd9',
  'AJUSTE',
  'NORMAL',
  'REVERSAL',
  -1500,
  'BRL',
  'reverse_duplicate_deposit_1054bc7e_9018_47ac_82bd_5542131c12c3',
  'Reversão técnica do depósito duplicado da KTO/Glayza após auditoria de vinculação',
  jsonb_build_object(
    'root_cause', 'deposito_orfao_nao_visivel_no_projeto + safety_net_indevido_na_vinculacao',
    'cancelled_ledger_id', '1054bc7e-9018-47ac-82bd-5542131c12c3',
    'cancelled_virtual_ledger_id', '73631a62-16ca-4180-a853-719ee37167c9',
    'bookmaker_id', 'c2a832f6-cb95-44a6-ba71-3896e1c04ec4',
    'project_id', '562b592a-4e29-447a-89c7-6d38b91c105a'
  ),
  now(),
  '4a0e13c3-319b-4b8e-b734-73f32890e77f'
WHERE NOT EXISTS (
  SELECT 1
  FROM public.financial_events fe
  WHERE fe.idempotency_key = 'reverse_duplicate_deposit_1054bc7e_9018_47ac_82bd_5542131c12c3'
);