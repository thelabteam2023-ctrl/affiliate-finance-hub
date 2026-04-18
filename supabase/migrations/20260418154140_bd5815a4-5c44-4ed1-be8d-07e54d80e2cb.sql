
-- =====================================================================
-- RECRIAÇÃO DE TRANSAÇÕES REVERTIDAS POR ENGANO (Lote "Sim P0-X" 17/04)
-- =====================================================================
-- Restaura o histórico das 5 transações originais que foram revertidas
-- em lote durante teste indevido. Cada nova transação aponta via
-- referencia_transacao_id para o estorno, fechando o ciclo:
--   ORIGINAL → ESTORNO → RECRIAÇÃO
-- =====================================================================

DO $$
DECLARE
  v_workspace uuid := 'feee9758-a7f4-474c-b2b1-679b66ec1cd9';
  v_user      uuid := '27d899b5-8f91-46b7-a71d-a22deb48c31d';
  v_now       timestamptz := now();
  v_audit_meta jsonb := jsonb_build_object(
    'origem_recreacao', 'recriacao_pos_estorno_indevido',
    'lote_estorno', 'Sim P0-X 17/04 22:48',
    'recriado_em', v_now,
    'recriado_por', v_user
  );
BEGIN

  -- 1) TRANSFERÊNCIA Caixa Operacional → Juliana (R$ 1.800)
  -- Estorno: 626b165b-522b-4f8d-a634-fe983b458fae
  INSERT INTO cash_ledger (
    tipo_transacao, status, valor, moeda, tipo_moeda,
    origem_tipo, destino_tipo,
    origem_parceiro_id, destino_parceiro_id,
    origem_conta_bancaria_id, destino_conta_bancaria_id,
    moeda_origem, moeda_destino,
    valor_origem, valor_destino,
    impacta_caixa_operacional, transit_status, status_valor,
    data_transacao, descricao,
    user_id, workspace_id,
    referencia_transacao_id,
    auditoria_metadata
  ) VALUES (
    'TRANSFERENCIA', 'CONFIRMADO', 1800, 'BRL', 'FIAT',
    'CAIXA_OPERACIONAL', 'PARCEIRO_CONTA',
    '94b2d2c0-dd5a-4215-948f-f9712f7ff34e', '4f264204-cc60-4112-8070-25ea8662f547',
    '991c0176-2434-4cdd-9ed9-169ed87907e5', 'c75c469f-8f47-43fc-af40-6963b85b5627',
    'BRL', 'BRL',
    1800, 1800,
    true, 'CONFIRMED', 'CONFIRMADO',
    v_now, 'Transferência Caixa → Juliana (recriada após estorno indevido)',
    v_user, v_workspace,
    '626b165b-522b-4f8d-a634-fe983b458fae',
    v_audit_meta || jsonb_build_object('original_id','c82de26b-c1ff-49f1-ac52-d90161779f5a')
  );

  -- 2) DEPÓSITO Lolisa Neon → BET365 (R$ 1.000)
  -- Estorno: 113b9fdb-95c8-4286-aca2-1e4d538434b5
  INSERT INTO cash_ledger (
    tipo_transacao, status, valor, moeda, tipo_moeda,
    origem_tipo, destino_tipo,
    origem_parceiro_id,
    origem_conta_bancaria_id,
    destino_bookmaker_id,
    moeda_origem, moeda_destino,
    valor_origem, valor_destino, valor_usd_referencia,
    impacta_caixa_operacional, transit_status, status_valor,
    data_transacao, descricao,
    user_id, workspace_id,
    projeto_id_snapshot,
    referencia_transacao_id,
    auditoria_metadata
  ) VALUES (
    'DEPOSITO', 'CONFIRMADO', 1000, 'BRL', 'FIAT',
    'PARCEIRO_CONTA', 'BOOKMAKER',
    '5b5f497b-4303-4bac-bb8d-89bde53cd9a2',
    '5a73372c-d12c-4d1d-b611-534a152c3c49',
    '072ddbd3-fd0c-476e-a37c-d892714a6bd8',
    'BRL', 'BRL',
    1000, 1000, 200.32051282051282,
    true, 'CONFIRMED', 'CONFIRMADO',
    v_now, 'Depósito Neon (Lolisa) → BET365 (recriado após estorno indevido)',
    v_user, v_workspace,
    '466aa6f6-9352-4c0b-9b45-c75d658a37c1',
    '113b9fdb-95c8-4286-aca2-1e4d538434b5',
    v_audit_meta || jsonb_build_object('original_id','0a2a51a8-eee6-45c4-84f5-53d1ae0b918f')
  );

  -- 3) DESPESA ADMINISTRATIVA R$ 27,75 (Café da Tarde - Pagseguro Alef)
  -- Estorno: 13a31d49-12a0-425f-a3ee-7fa845b3c420
  INSERT INTO cash_ledger (
    tipo_transacao, status, valor, moeda, tipo_moeda,
    origem_tipo,
    origem_parceiro_id,
    origem_conta_bancaria_id,
    impacta_caixa_operacional, transit_status, status_valor,
    data_transacao, descricao,
    user_id, workspace_id,
    referencia_transacao_id,
    auditoria_metadata
  ) VALUES (
    'DESPESA_ADMINISTRATIVA', 'CONFIRMADO', 27.75, 'BRL', 'FIAT',
    'PARCEIRO_CONTA',
    '522dc593-29b9-440f-9f44-4933a5af684c',
    'fcdb6d69-20d3-441b-9367-2142f361f32f',
    true, 'CONFIRMED', 'CONFIRMADO',
    v_now, 'Despesa administrativa - Outros: Café da Tarde (recriada após estorno indevido)',
    v_user, v_workspace,
    '13a31d49-12a0-425f-a3ee-7fa845b3c420',
    v_audit_meta || jsonb_build_object(
      'original_id','e4cff099-e9e5-4026-936f-18bb2597f377',
      'grupo','OUTROS','categoria','Outros'
    )
  );

  -- 4) AJUSTE_RECONCILIACAO ENTRADA R$ 370,32 no Caixa Nubank
  -- Estorno: 8f4615d7-7bc3-47c1-a77e-f561fa14c4df
  INSERT INTO cash_ledger (
    tipo_transacao, status, valor, moeda, tipo_moeda,
    origem_tipo, destino_tipo,
    destino_conta_bancaria_id,
    moeda_destino, valor_destino,
    impacta_caixa_operacional, transit_status, status_valor,
    ajuste_motivo, ajuste_direcao,
    data_transacao, descricao,
    user_id, workspace_id,
    referencia_transacao_id,
    auditoria_metadata
  ) VALUES (
    'AJUSTE_RECONCILIACAO', 'CONFIRMADO', 370.32, 'BRL', 'FIAT',
    'AJUSTE', 'CAIXA_OPERACIONAL',
    '991c0176-2434-4cdd-9ed9-169ed87907e5',
    'BRL', 370.32,
    true, 'CONFIRMED', 'CONFIRMADO',
    'ajuste', 'ENTRADA',
    v_now, '[RECONCILIAÇÃO ENTRADA] ajuste | Recriada após estorno indevido | Diferença original: 370.32',
    v_user, v_workspace,
    '8f4615d7-7bc3-47c1-a77e-f561fa14c4df',
    v_audit_meta || jsonb_build_object(
      'original_id','458d0b08-c1e0-42d8-abb2-5dec75d35cf8',
      'tipo_reconciliacao','RECONCILIACAO_VIA_AJUSTE',
      'tipo_destino','CAIXA_OPERACIONAL',
      'diferenca', 370.32,
      'entidade_nome','Caixa – Nu Pagamentos S.A. (Nubank) (LABBET ESPORTIVA)'
    )
  );

  -- 5) BONUS_CREDITADO 100 EUR na SPORTMARKET
  -- Estorno: e651eb35-9e21-4d4b-95e2-a5c73a223020
  INSERT INTO cash_ledger (
    tipo_transacao, status, valor, moeda, tipo_moeda,
    destino_bookmaker_id,
    valor_destino,
    impacta_caixa_operacional, transit_status, status_valor,
    data_transacao, descricao,
    user_id, workspace_id,
    projeto_id_snapshot,
    referencia_transacao_id,
    auditoria_metadata
  ) VALUES (
    'BONUS_CREDITADO', 'CONFIRMADO', 100, 'EUR', 'FIAT',
    'd4a0a459-6cfc-4d1d-bab3-2d815aab20d4',
    100,
    false, 'CONFIRMED', 'CONFIRMADO',
    v_now, 'Crédito de bônus: Boas-vindas 50% (recriado após estorno indevido)',
    v_user, v_workspace,
    '438cef89-4a9a-4e72-8bc9-b1c3d7dc9693',
    'e651eb35-9e21-4d4b-95e2-a5c73a223020',
    v_audit_meta || jsonb_build_object(
      'original_id','40daf0cc-30e6-425d-9414-a311ae49fef1',
      'origem','BONUS'
    )
  );

  RAISE NOTICE '✅ 5 transações originais recriadas com sucesso. Saldos restaurados ao estado pré-estorno.';
END $$;
