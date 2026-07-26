
-- 1) Novo tipo de movimentação
ALTER TABLE public.cash_ledger DROP CONSTRAINT IF EXISTS cash_ledger_tipo_transacao_check;
ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_tipo_transacao_check
  CHECK (tipo_transacao = ANY (ARRAY[
    'DEPOSITO','SAQUE','TRANSFERENCIA','AJUSTE_MANUAL','AJUSTE_SALDO',
    'APOSTA_STAKE','APOSTA_GREEN','APOSTA_RED','APOSTA_MEIO_GREEN','APOSTA_MEIO_RED',
    'APOSTA_VOID','APOSTA_REEMBOLSO','APOSTA_REVERSAO',
    'FREEBET_CREDITADA','FREEBET_CONSUMIDA','FREEBET_EXPIRADA','FREEBET_ESTORNO','FREEBET_CONVERTIDA',
    'BONUS_CREDITADO','BONUS_ESTORNO','CASHBACK_CREDITADO','CASHBACK_ESTORNO','CASHBACK_MANUAL',
    'GIRO_GRATIS','GIRO_GRATIS_ESTORNO','COMISSAO','DESPESA','RECEITA','INVESTIMENTO','RESGATE',
    'APORTE_FINANCEIRO','RETIRADA_FINANCEIRA','PERDA_CAMBIAL','GANHO_CAMBIAL','TAXA_REDE',
    'AJUSTE_RECONCILIACAO','PAGAMENTO_TITULAR','ESTORNO_PAGAMENTO_TITULAR','SWAP_OUT','SWAP_IN',
    'REVERSAO_AUDITORIA','ALOCACAO_FORNECEDOR','BONIFICACAO_ESTRATEGICA','COMISSAO_INDICADOR',
    'DEPOSITO_VIRTUAL','DESPESA_ADMINISTRATIVA','ESTORNO','PAGTO_FORNECEDOR','PAGTO_OPERADOR',
    'PAGTO_PARCEIRO','PERDA_OPERACIONAL','PERDA_REVERSAO','RENOVACAO_PARCERIA','SAQUE_VIRTUAL',
    'AJUSTE_NEGATIVO','AJUSTE_POSITIVO',
    'PERDA_ATIVO'  -- NOVO
  ]));

-- 2) projeto_perdas: aceitar registros sem projeto + rastreabilidade
ALTER TABLE public.projeto_perdas ALTER COLUMN projeto_id DROP NOT NULL;
ALTER TABLE public.projeto_perdas
  ADD COLUMN IF NOT EXISTS ledger_id_ref uuid REFERENCES public.cash_ledger(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moeda text,
  ADD COLUMN IF NOT EXISTS valor_usd numeric;
CREATE INDEX IF NOT EXISTS idx_projeto_perdas_workspace_categoria_data
  ON public.projeto_perdas (workspace_id, categoria, data_registro DESC);
CREATE INDEX IF NOT EXISTS idx_projeto_perdas_ledger_ref
  ON public.projeto_perdas (ledger_id_ref);

-- 3) RPC v2 idempotente com PERDA_ATIVO
DROP FUNCTION IF EXISTS public.reportar_perda_transit_wallet(uuid, text, text, text, text);

CREATE OR REPLACE FUNCTION public.reportar_perda_transit_wallet(
  p_ledger_id uuid,
  p_motivo text,
  p_rede text DEFAULT NULL,
  p_hash text DEFAULT NULL,
  p_observacao text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ledger        RECORD;
  v_workspace     uuid;
  v_user          uuid;
  v_projeto       uuid;
  v_perda_id      uuid;
  v_perda_ledger  uuid;
  v_motivo_norm   text;
  v_valor_usd     numeric;
  v_existing      uuid;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  IF p_motivo IS NULL OR length(trim(p_motivo)) = 0 THEN
    RETURN json_build_object('success', false, 'error', 'MOTIVO_REQUIRED');
  END IF;

  v_motivo_norm := upper(trim(p_motivo));
  IF v_motivo_norm NOT IN ('REDE_INCORRETA','ENDERECO_INVALIDO','FRAUDE','OUTRO') THEN
    RETURN json_build_object('success', false, 'error', 'MOTIVO_INVALIDO');
  END IF;

  SELECT * INTO v_ledger FROM cash_ledger WHERE id = p_ledger_id;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'LEDGER_NOT_FOUND');
  END IF;

  v_workspace := v_ledger.workspace_id;
  IF v_workspace IS DISTINCT FROM get_current_workspace() THEN
    RETURN json_build_object('success', false, 'error', 'WORKSPACE_MISMATCH');
  END IF;

  IF v_ledger.origem_wallet_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'ORIGEM_WALLET_REQUIRED');
  END IF;

  v_projeto := v_ledger.projeto_id_snapshot;
  v_valor_usd := ABS(COALESCE(v_ledger.valor_usd, 0));

  -- IDEMPOTÊNCIA: se já existe PERDA_ATIVO referenciando este ledger, retorna
  SELECT id INTO v_existing
    FROM cash_ledger
   WHERE referencia_transacao_id = p_ledger_id
     AND tipo_transacao = 'PERDA_ATIVO'
   LIMIT 1;
  IF v_existing IS NOT NULL THEN
    SELECT id INTO v_perda_id FROM projeto_perdas WHERE ledger_id_ref = v_existing LIMIT 1;
    RETURN json_build_object(
      'success', true,
      'idempotent', true,
      'ledger_original_id', p_ledger_id,
      'perda_ledger_id', v_existing,
      'projeto_perda_id', v_perda_id,
      'valor_perdido_usd', v_valor_usd,
      'motivo', v_motivo_norm
    );
  END IF;

  -- 1) Destravar saldo (se estava travado)
  BEGIN
    PERFORM revert_wallet_transit(p_ledger_id, 'LOST', v_motivo_norm);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 2) Marcar ledger original como CANCELADO + LOST
  UPDATE cash_ledger
     SET status         = 'CANCELADO',
         transit_status = 'LOST',
         descricao      = COALESCE(descricao,'') ||
                          format(' [PERDA_ATIVO_%s: %s%s%s]',
                            v_motivo_norm,
                            COALESCE(p_rede,''),
                            CASE WHEN p_hash IS NOT NULL THEN ' hash='||p_hash ELSE '' END,
                            CASE WHEN p_observacao IS NOT NULL THEN ' obs='||p_observacao ELSE '' END
                          ),
         auditoria_metadata = COALESCE(auditoria_metadata,'{}'::jsonb) ||
           jsonb_build_object(
             'perda_ativo', jsonb_build_object(
               'categoria', v_motivo_norm,
               'rede_incorreta', p_rede,
               'hash_perdido', p_hash,
               'observacao', p_observacao,
               'reportado_por', v_user,
               'reportado_em', NOW()
             )
           ),
         updated_at = NOW()
   WHERE id = p_ledger_id;

  -- 3) NOVO tipo PERDA_ATIVO (substitui AJUSTE_SALDO opaco)
  INSERT INTO cash_ledger (
    workspace_id, user_id, data_transacao,
    tipo_transacao, tipo_moeda, moeda, coin,
    valor, valor_usd, qtd_coin,
    origem_tipo, origem_wallet_id,
    descricao, status,
    referencia_transacao_id, projeto_id_snapshot,
    auditoria_metadata, impacta_caixa_operacional
  ) VALUES (
    v_workspace, v_user, NOW(),
    'PERDA_ATIVO', 'CRYPTO', v_ledger.moeda, v_ledger.coin,
    -ABS(COALESCE(v_ledger.valor, 0)),
    -ABS(COALESCE(v_ledger.valor_usd, 0)),
    -ABS(COALESCE(v_ledger.qtd_coin, 0)),
    'PARCEIRO_WALLET', v_ledger.origem_wallet_id,
    format('Ativo perdido (%s) - conciliacao #%s', v_motivo_norm, p_ledger_id),
    'CONFIRMADO',
    p_ledger_id, v_projeto,
    jsonb_build_object(
      'origem', 'PERDA_ATIVO',
      'categoria', v_motivo_norm,
      'ledger_original', p_ledger_id,
      'rede', p_rede,
      'hash', p_hash,
      'observacao', p_observacao
    ),
    true
  ) RETURNING id INTO v_perda_ledger;

  -- 4) Registrar em projeto_perdas (sempre, mesmo sem projeto)
  INSERT INTO projeto_perdas (
    workspace_id, user_id, projeto_id, bookmaker_id,
    valor, valor_usd, moeda,
    categoria, descricao, status, data_registro,
    ledger_id_ref
  ) VALUES (
    v_workspace, v_user, v_projeto, NULL,
    ABS(COALESCE(v_ledger.valor, 0)),
    v_valor_usd,
    v_ledger.moeda,
    'PERDA_ATIVO_'||v_motivo_norm,
    format('Ativo perdido: %s | rede=%s | hash=%s | obs=%s | ledger_origem=%s',
      v_motivo_norm,
      COALESCE(p_rede,'-'),
      COALESCE(p_hash,'-'),
      COALESCE(p_observacao,'-'),
      p_ledger_id
    ),
    'CONFIRMADA',
    NOW(),
    v_perda_ledger
  ) RETURNING id INTO v_perda_id;

  RETURN json_build_object(
    'success', true,
    'ledger_original_id', p_ledger_id,
    'perda_ledger_id', v_perda_ledger,
    'projeto_perda_id', v_perda_id,
    'valor_perdido_usd', v_valor_usd,
    'motivo', v_motivo_norm
  );
END;
$function$;

-- 4) RPC agregadora para o card consolidado
DROP FUNCTION IF EXISTS public.get_resumo_perdas(uuid, timestamptz, timestamptz);
CREATE OR REPLACE FUNCTION public.get_resumo_perdas(
  p_workspace_id uuid,
  p_start timestamptz DEFAULT NULL,
  p_end   timestamptz DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ws uuid;
  v_result json;
BEGIN
  v_ws := COALESCE(p_workspace_id, get_current_workspace());
  IF v_ws IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'NO_WORKSPACE');
  END IF;

  WITH base AS (
    SELECT
      CASE
        WHEN tipo_transacao = 'PERDA_ATIVO' THEN 'PERDA_ATIVO'
        WHEN tipo_transacao = 'PERDA_OPERACIONAL' THEN 'PERDA_SCAN'
        WHEN tipo_transacao = 'PERDA_CAMBIAL' THEN 'PERDA_CAMBIAL'
      END AS categoria,
      ABS(COALESCE(valor_usd, 0)) AS valor_usd_abs,
      id
    FROM cash_ledger
    WHERE workspace_id = v_ws
      AND status = 'CONFIRMADO'
      AND tipo_transacao IN ('PERDA_ATIVO','PERDA_OPERACIONAL','PERDA_CAMBIAL')
      AND (p_start IS NULL OR data_transacao >= p_start)
      AND (p_end   IS NULL OR data_transacao <  p_end)
  )
  SELECT json_build_object(
    'total_usd', COALESCE(SUM(valor_usd_abs), 0),
    'total_count', COUNT(*),
    'breakdown', COALESCE(json_agg(
        json_build_object(
          'categoria', categoria,
          'total_usd', total_usd,
          'count', qtd
        )
      ) FILTER (WHERE categoria IS NOT NULL), '[]'::json)
  ) INTO v_result
  FROM (
    SELECT categoria, SUM(valor_usd_abs) AS total_usd, COUNT(*) AS qtd
    FROM base
    GROUP BY categoria
  ) agg
  CROSS JOIN (SELECT SUM(valor_usd_abs) AS s, COUNT(*) AS c FROM base) t;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_resumo_perdas(uuid, timestamptz, timestamptz) TO authenticated;

-- 5) Backfill: reclassifica AJUSTE_SALDO com motivo PERDA_TRANSIT_WALLET para PERDA_ATIVO
UPDATE public.cash_ledger
   SET tipo_transacao = 'PERDA_ATIVO',
       auditoria_metadata = COALESCE(auditoria_metadata,'{}'::jsonb) ||
         jsonb_build_object('reclassificado_em', NOW(), 'reclassificado_de', 'AJUSTE_SALDO')
 WHERE tipo_transacao = 'AJUSTE_SALDO'
   AND ajuste_motivo = 'PERDA_TRANSIT_WALLET';

-- Vincular projeto_perdas legadas ao ledger reclassificado (quando existir)
UPDATE public.projeto_perdas pp
   SET ledger_id_ref = cl.id
  FROM public.cash_ledger cl
 WHERE pp.ledger_id_ref IS NULL
   AND cl.tipo_transacao = 'PERDA_ATIVO'
   AND cl.projeto_id_snapshot = pp.projeto_id
   AND cl.workspace_id = pp.workspace_id
   AND pp.categoria LIKE 'PERDA_TRANSIT_%';
