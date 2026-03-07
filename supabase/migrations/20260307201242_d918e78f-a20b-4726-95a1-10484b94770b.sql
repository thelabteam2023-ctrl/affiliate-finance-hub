
-- 1. Add marco_zero_at column to projetos
ALTER TABLE public.projetos ADD COLUMN IF NOT EXISTS marco_zero_at timestamptz DEFAULT NULL;

-- 2. Add DEPOSITO_BASELINE to constraint
ALTER TABLE public.cash_ledger DROP CONSTRAINT cash_ledger_tipo_transacao_check;
ALTER TABLE public.cash_ledger ADD CONSTRAINT cash_ledger_tipo_transacao_check CHECK (
  tipo_transacao = ANY (ARRAY[
    'AJUSTE_SALDO', 'AJUSTE_MANUAL', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'AJUSTE_RECONCILIACAO',
    'CASHBACK_MANUAL', 'CASHBACK_ESTORNO',
    'APOSTA_GREEN', 'APOSTA_RED', 'APOSTA_VOID', 'APOSTA_MEIO_GREEN', 'APOSTA_MEIO_RED', 'APOSTA_REVERSAO',
    'BONUS_CREDITADO', 'BONUS_ESTORNO',
    'GIRO_GRATIS', 'GIRO_GRATIS_ESTORNO',
    'DEPOSITO', 'SAQUE',
    'SAQUE_VIRTUAL', 'DEPOSITO_VIRTUAL',
    'DEPOSITO_BASELINE',
    'TRANSFERENCIA',
    'APORTE_FINANCEIRO',
    'PERDA_OPERACIONAL', 'PERDA_REVERSAO',
    'CONCILIACAO', 'ESTORNO',
    'EVENTO_PROMOCIONAL',
    'GANHO_CAMBIAL', 'PERDA_CAMBIAL',
    'PAGTO_PARCEIRO', 'PAGTO_FORNECEDOR', 'PAGTO_OPERADOR',
    'COMISSAO_INDICADOR', 'BONUS_INDICADOR',
    'DESPESA_ADMINISTRATIVA',
    'APORTE_INVESTIDOR', 'RETIRADA_INVESTIDOR',
    'FREEBET_CREDITADA', 'FREEBET_CONSUMIDA', 'FREEBET_EXPIRADA', 'FREEBET_CONVERTIDA', 'FREEBET_ESTORNO',
    'RENOVACAO_PARCERIA', 'BONIFICACAO_ESTRATEGICA'
  ])
);

-- 3. Create RPC for atomic marco zero reset
CREATE OR REPLACE FUNCTION public.executar_marco_zero(
  p_projeto_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_bookmaker record;
  v_baseline_count int := 0;
  v_workspace_id uuid;
BEGIN
  -- Validate project exists and belongs to user
  SELECT workspace_id INTO v_workspace_id
  FROM projetos
  WHERE id = p_projeto_id;

  IF v_workspace_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Projeto não encontrado');
  END IF;

  -- Set marco_zero_at on the project
  UPDATE projetos
  SET marco_zero_at = v_now, updated_at = v_now
  WHERE id = p_projeto_id;

  -- For each bookmaker currently linked to this project, create a DEPOSITO_BASELINE
  FOR v_bookmaker IN
    SELECT id, saldo_atual, moeda, nome
    FROM bookmakers
    WHERE projeto_id = p_projeto_id
  LOOP
    -- Only create baseline if there's a balance
    IF v_bookmaker.saldo_atual <> 0 THEN
      INSERT INTO cash_ledger (
        tipo_transacao, tipo_moeda, moeda, valor, status,
        data_transacao, user_id, workspace_id,
        destino_bookmaker_id, projeto_id_snapshot,
        descricao, impacta_caixa_operacional
      ) VALUES (
        'DEPOSITO_BASELINE', 'FIAT', v_bookmaker.moeda, v_bookmaker.saldo_atual, 'CONFIRMADO',
        v_now, p_user_id, v_workspace_id,
        v_bookmaker.id, p_projeto_id,
        'Marco Zero — baseline de saldo em ' || to_char(v_now AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
        false
      );
      v_baseline_count := v_baseline_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'marco_zero_at', v_now,
    'baselines_criados', v_baseline_count,
    'mensagem', 'Marco Zero aplicado com ' || v_baseline_count || ' baseline(s) criado(s)'
  );
END;
$$;
