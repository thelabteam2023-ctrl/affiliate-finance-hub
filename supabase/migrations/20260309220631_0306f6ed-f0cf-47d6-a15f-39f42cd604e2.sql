
-- 🔒 CORREÇÃO: Atualizar lançamentos DESPESA_ADMINISTRATIVA órfãos da Caixa Operacional
-- Estes lançamentos tinham origem_tipo = CAIXA_OPERACIONAL mas sem origem_conta_bancaria_id,
-- fazendo com que as views de saldo não contabilizassem o débito.

-- Identificar a conta bancária da Caixa Operacional
DO $$
DECLARE
  v_caixa_parceiro_id UUID;
  v_caixa_conta_id UUID;
BEGIN
  -- Encontrar o parceiro Caixa Operacional
  SELECT id INTO v_caixa_parceiro_id
  FROM parceiros
  WHERE is_caixa_operacional = true
  LIMIT 1;

  IF v_caixa_parceiro_id IS NULL THEN
    RAISE NOTICE 'Parceiro Caixa Operacional não encontrado';
    RETURN;
  END IF;

  -- Encontrar a conta bancária BRL da Caixa
  SELECT id INTO v_caixa_conta_id
  FROM contas_bancarias
  WHERE parceiro_id = v_caixa_parceiro_id
    AND moeda = 'BRL'
  LIMIT 1;

  IF v_caixa_conta_id IS NULL THEN
    RAISE NOTICE 'Conta bancária BRL da Caixa não encontrada';
    RETURN;
  END IF;

  -- Atualizar todos os lançamentos órfãos: CAIXA_OPERACIONAL sem conta vinculada
  UPDATE cash_ledger
  SET origem_conta_bancaria_id = v_caixa_conta_id,
      origem_parceiro_id = v_caixa_parceiro_id
  WHERE origem_tipo = 'CAIXA_OPERACIONAL'
    AND origem_conta_bancaria_id IS NULL
    AND tipo_moeda = 'FIAT'
    AND moeda = 'BRL'
    AND status = 'CONFIRMADO';

  RAISE NOTICE 'Lançamentos órfãos corrigidos com conta_id: %, parceiro_id: %', v_caixa_conta_id, v_caixa_parceiro_id;
END $$;
