
-- ============================================================================
-- CORREÇÃO: Remover UPDATE duplicado em processar_credito_ganho
-- O trigger atualizar_saldo_bookmaker_v3 já processa o APOSTA_GREEN
-- ============================================================================

CREATE OR REPLACE FUNCTION public.processar_credito_ganho(
  p_bookmaker_id UUID,
  p_lucro NUMERIC,
  p_debito_bonus NUMERIC,
  p_debito_freebet NUMERIC,
  p_debito_real NUMERIC,
  p_workspace_id UUID,
  p_user_id UUID,
  p_aposta_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_retorno_total NUMERIC;
  v_saldo_anterior NUMERIC;
  v_moeda TEXT;
BEGIN
  -- Calcular retorno total
  -- Bônus e Freebet: apenas lucro retorna
  -- Real: stake + lucro retorna
  v_retorno_total := p_lucro + p_debito_real; -- lucro + stake real devolvido
  
  -- Buscar saldo anterior e moeda para auditoria
  SELECT saldo_atual, moeda INTO v_saldo_anterior, v_moeda
  FROM bookmakers
  WHERE id = p_bookmaker_id;
  
  -- REMOVIDO: UPDATE direto no bookmakers - agora o trigger cuida disso
  -- O trigger atualizar_saldo_bookmaker_v3 processa APOSTA_GREEN automaticamente
  
  -- Inserir no ledger (trigger irá processar e atualizar saldo)
  INSERT INTO cash_ledger (
    tipo_transacao,
    workspace_id,
    user_id,
    destino_bookmaker_id,
    valor,
    valor_destino,
    moeda,
    tipo_moeda,
    descricao,
    status,
    impacta_caixa_operacional
  ) VALUES (
    'APOSTA_GREEN',
    p_workspace_id,
    p_user_id,
    p_bookmaker_id,
    v_retorno_total,
    v_retorno_total,
    COALESCE(v_moeda, 'USD'),
    'FIAT',
    FORMAT('Aposta GREEN - Retorno: %s (Lucro: %s, Stake Real: %s, Bonus consumido: %s, Freebet consumido: %s)', 
           v_retorno_total, p_lucro, p_debito_real, p_debito_bonus, p_debito_freebet),
    'CONFIRMADO',
    true
  );
  
  -- Auditoria manual (opcional - o trigger também cria)
  INSERT INTO bookmaker_balance_audit (
    bookmaker_id, workspace_id, user_id, origem,
    saldo_anterior, saldo_novo, diferenca, observacoes, referencia_id, referencia_tipo
  ) VALUES (
    p_bookmaker_id, p_workspace_id, p_user_id, 'APOSTA_GREEN_WATERFALL',
    v_saldo_anterior, v_saldo_anterior + v_retorno_total,
    v_retorno_total,
    FORMAT('GREEN: lucro=%s, stake_real_devolvido=%s, total=%s (bonus=%s e freebet=%s consumidos)', 
           p_lucro, p_debito_real, v_retorno_total, p_debito_bonus, p_debito_freebet),
    p_aposta_id, 'APOSTA'
  );
  
  RETURN true;
END;
$$;
