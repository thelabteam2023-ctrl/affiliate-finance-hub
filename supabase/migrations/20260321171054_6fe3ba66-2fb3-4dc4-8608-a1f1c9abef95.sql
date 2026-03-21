-- Betano Sebastian: net ledger = DEPOSITO(+1500) + DEPOSITO_VIRTUAL(+1500) - SAQUE_VIRTUAL(-1500) = +1500
-- O trigger BEFORE INSERT/UPDATE atualiza saldo_atual diretamente para DEPOSITO/SAQUE_VIRTUAL/DEPOSITO_VIRTUAL
-- mas como zeramos o saldo e re-triggamos, o trigger vê financial_events_generated=true (já processou)
-- e não re-atualiza. Precisamos recalcular manualmente.

-- Recalcular saldo de Betano Sebastian baseado no ledger
DO $$
DECLARE
  v_saldo NUMERIC := 0;
  v_rec RECORD;
BEGIN
  FOR v_rec IN 
    SELECT cl.tipo_transacao, cl.valor, cl.origem_bookmaker_id, cl.destino_bookmaker_id
    FROM cash_ledger cl
    WHERE '5f599383-db75-49a9-b4f6-306aa1e323b1' IN (cl.origem_bookmaker_id, cl.destino_bookmaker_id)
      AND cl.status = 'CONFIRMADO'
    ORDER BY cl.data_transacao ASC, cl.created_at ASC
  LOOP
    CASE v_rec.tipo_transacao
      WHEN 'DEPOSITO', 'DEPOSITO_VIRTUAL', 'BONUS_CREDITADO', 'GIRO_GRATIS', 'CASHBACK_MANUAL' THEN
        v_saldo := v_saldo + v_rec.valor;
      WHEN 'SAQUE', 'SAQUE_VIRTUAL' THEN
        v_saldo := v_saldo - v_rec.valor;
      WHEN 'AJUSTE_MANUAL' THEN
        IF v_rec.destino_bookmaker_id = '5f599383-db75-49a9-b4f6-306aa1e323b1' THEN
          v_saldo := v_saldo + v_rec.valor;
        ELSE
          v_saldo := v_saldo - v_rec.valor;
        END IF;
      ELSE
        NULL;
    END CASE;
  END LOOP;
  
  UPDATE bookmakers SET saldo_atual = v_saldo, updated_at = NOW()
  WHERE id = '5f599383-db75-49a9-b4f6-306aa1e323b1';
  
  RAISE NOTICE 'Betano Sebastian saldo recalculado: %', v_saldo;
END $$;