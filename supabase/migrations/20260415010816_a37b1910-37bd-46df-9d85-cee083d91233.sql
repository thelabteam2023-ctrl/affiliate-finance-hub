
DO $$
DECLARE
  ws_id UUID := 'f8b6f7ce-92b9-4d26-899a-0f0eeb1324cd';
BEGIN
  -- Desabilitar trigger de proteção
  ALTER TABLE parceiros DISABLE TRIGGER tr_protect_caixa_operacional;

  -- 1. APOSTAS
  DELETE FROM apostas_pernas WHERE aposta_id IN (SELECT id FROM apostas_unificada WHERE workspace_id = ws_id);
  DELETE FROM apostas_unificada WHERE workspace_id = ws_id;

  -- 2. FINANCEIRO
  DELETE FROM financial_events WHERE workspace_id = ws_id;
  DELETE FROM cash_ledger WHERE workspace_id = ws_id;
  DELETE FROM bookmaker_balance_audit WHERE workspace_id = ws_id;
  DELETE FROM exchange_adjustments WHERE workspace_id = ws_id;
  DELETE FROM capital_snapshots WHERE workspace_id = ws_id;
  DELETE FROM bookmaker_stake_reservations WHERE workspace_id = ws_id;

  -- 3. FREEBETS
  DELETE FROM freebets_recebidas WHERE workspace_id = ws_id;
  DELETE FROM giros_gratis_disponiveis WHERE workspace_id = ws_id;
  DELETE FROM giros_gratis WHERE workspace_id = ws_id;

  -- 4. VÍNCULOS PROJETO
  DELETE FROM project_bookmaker_link_bonuses WHERE workspace_id = ws_id;
  DELETE FROM projeto_bookmaker_historico WHERE workspace_id = ws_id;
  DELETE FROM projeto_conciliacoes WHERE workspace_id = ws_id;
  DELETE FROM projeto_perdas WHERE workspace_id = ws_id;
  DELETE FROM projeto_shared_links WHERE workspace_id = ws_id;
  DELETE FROM participacao_ciclos WHERE workspace_id = ws_id;
  DELETE FROM projeto_ciclos WHERE workspace_id = ws_id;

  -- 5. INVESTIDORES
  DELETE FROM projeto_investidores WHERE workspace_id = ws_id;
  DELETE FROM investidor_deals WHERE workspace_id = ws_id;
  DELETE FROM investidores WHERE workspace_id = ws_id;

  -- 6. OPERADORES
  DELETE FROM operador_projetos WHERE workspace_id = ws_id;
  DELETE FROM pagamentos_operador WHERE workspace_id = ws_id;
  DELETE FROM pagamentos_propostos WHERE workspace_id = ws_id;
  DELETE FROM operadores WHERE workspace_id = ws_id;

  -- 7. INDICADORES
  DELETE FROM movimentacoes_indicacao WHERE workspace_id = ws_id;
  DELETE FROM promocao_participantes WHERE workspace_id = ws_id;
  DELETE FROM promocoes_indicacao WHERE workspace_id = ws_id;
  DELETE FROM indicacoes WHERE workspace_id = ws_id;
  DELETE FROM indicador_acordos WHERE workspace_id = ws_id;
  DELETE FROM indicadores_referral WHERE workspace_id = ws_id;

  -- 8. BOOKMAKERS
  DELETE FROM bookmaker_unlinked_acks WHERE workspace_id = ws_id;
  DELETE FROM bookmaker_indisponiveis WHERE workspace_id = ws_id;
  DELETE FROM bookmaker_grupo_membros WHERE workspace_id = ws_id;
  DELETE FROM bookmaker_grupos WHERE workspace_id = ws_id;
  DELETE FROM bookmaker_workspace_access WHERE workspace_id = ws_id;
  DELETE FROM limitation_events WHERE workspace_id = ws_id;
  DELETE FROM bookmakers WHERE workspace_id = ws_id;

  -- 9. PARCEIROS
  DELETE FROM parceiro_lucro_alertas WHERE workspace_id = ws_id;
  DELETE FROM parcerias WHERE workspace_id = ws_id;
  DELETE FROM parceiros WHERE workspace_id = ws_id;

  -- 10. PROJETOS
  DELETE FROM project_favorites WHERE workspace_id = ws_id;
  DELETE FROM project_modules WHERE workspace_id = ws_id;
  DELETE FROM project_user_preferences WHERE workspace_id = ws_id;
  DELETE FROM projetos WHERE workspace_id = ws_id;

  -- 11. AUXILIARES
  DELETE FROM anotacoes_livres WHERE workspace_id = ws_id;
  DELETE FROM despesas_administrativas WHERE workspace_id = ws_id;
  DELETE FROM cashback_manual WHERE workspace_id = ws_id;
  DELETE FROM entregas WHERE workspace_id = ws_id;
  DELETE FROM fluxo_cards WHERE workspace_id = ws_id;
  DELETE FROM fluxo_colunas WHERE workspace_id = ws_id;
  DELETE FROM fornecedores WHERE workspace_id = ws_id;
  DELETE FROM solicitacoes WHERE workspace_id = ws_id;
  DELETE FROM transacoes_bookmakers WHERE workspace_id = ws_id;
  DELETE FROM sales_events WHERE workspace_id = ws_id;
  DELETE FROM workspace_bet_sources WHERE workspace_id = ws_id;
  DELETE FROM bancos WHERE workspace_id = ws_id;

  -- 12. LOGS
  DELETE FROM audit_logs WHERE workspace_id = ws_id;
  DELETE FROM login_history WHERE workspace_id = ws_id;
  DELETE FROM workspace_invites WHERE workspace_id = ws_id;

  -- Reabilitar trigger
  ALTER TABLE parceiros ENABLE TRIGGER tr_protect_caixa_operacional;
END $$;
