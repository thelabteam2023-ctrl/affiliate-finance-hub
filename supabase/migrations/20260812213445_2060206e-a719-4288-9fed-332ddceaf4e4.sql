DO $$
DECLARE
  v_ledger_id UUID := gen_random_uuid();
BEGIN
  -- Verificar se já não existe (idempotência)
  IF NOT EXISTS (
    SELECT 1 FROM public.cash_ledger 
    WHERE auditoria_metadata->>'perda_id' = '9ae8e437-006e-40e2-ae43-993e09fb7e52'
  ) THEN
    
    INSERT INTO public.cash_ledger (
      id,
      tipo_transacao,
      valor,
      moeda,
      workspace_id,
      user_id,
      origem_bookmaker_id,
      valor_origem,
      descricao,
      data_transacao,
      impacta_caixa_operacional,
      tipo_moeda,
      status,
      projeto_id_snapshot,
      auditoria_metadata,
      ocorrencia_id
    ) VALUES (
      v_ledger_id,
      'PERDA_OPERACIONAL',
      1422.44,
      'USD',
      'b1125a67-439e-4b4c-a0e6-32ed322ec4d5',
      '8e29dbc6-76fd-44ac-aad4-38105311dd42',
      '50808c70-f697-4a5d-9812-b04cd7a41225',
      1422.44,
      'Perda via ocorrência: Verificação para poder sacar (Regularização Sincronismo)',
      '2026-08-12',
      true,
      'FIAT',
      'CONFIRMADO',
      'df91f7e8-ca51-4652-913b-ae942462ba9d',
      jsonb_build_object('perda_id', '9ae8e437-006e-40e2-ae43-993e09fb7e52', 'categoria', 'kyc', 'remediacao_manual', true),
      '9ae8e437-006e-40e2-ae43-993e09fb7e52'
    );

    -- Atualizar o registro de projeto_perdas para referenciar este novo ledger_id
    UPDATE public.projeto_perdas
    SET ledger_id_ref = v_ledger_id
    WHERE ocorrencia_id = '9ae8e437-006e-40e2-ae43-993e09fb7e52';

    -- Atualizar a ocorrência para referenciar este novo ledger_id
    UPDATE public.ocorrencias
    SET perda_ledger_id = v_ledger_id
    WHERE id = '9ae8e437-006e-40e2-ae43-993e09fb7e52';

  END IF;
END $$;