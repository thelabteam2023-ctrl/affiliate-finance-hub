
-- FASE 3 (Parte 3): Remover policies problemáticas restantes e criar corretas

-- ========== INDICADOR_ACORDOS ==========
DROP POLICY IF EXISTS "Workspace isolation indicador_acordos DELETE" ON indicador_acordos;
DROP POLICY IF EXISTS "Workspace isolation indicador_acordos SELECT" ON indicador_acordos;
DROP POLICY IF EXISTS "Workspace isolation indicador_acordos UPDATE" ON indicador_acordos;

CREATE POLICY "ind_acordos_ws_select" ON indicador_acordos FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "ind_acordos_ws_update" ON indicador_acordos FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "ind_acordos_ws_delete" ON indicador_acordos FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "ind_acordos_ws_insert" ON indicador_acordos FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== INVESTIDOR_DEALS ==========
DROP POLICY IF EXISTS "Workspace isolation investidor_deals DELETE" ON investidor_deals;
DROP POLICY IF EXISTS "Workspace isolation investidor_deals SELECT" ON investidor_deals;
DROP POLICY IF EXISTS "Workspace isolation investidor_deals UPDATE" ON investidor_deals;

CREATE POLICY "inv_deals_ws_select" ON investidor_deals FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "inv_deals_ws_update" ON investidor_deals FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "inv_deals_ws_delete" ON investidor_deals FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "inv_deals_ws_insert" ON investidor_deals FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== INVESTIDORES ==========
DROP POLICY IF EXISTS "Workspace isolation investidores DELETE" ON investidores;
DROP POLICY IF EXISTS "Workspace isolation investidores SELECT" ON investidores;
DROP POLICY IF EXISTS "Workspace isolation investidores UPDATE" ON investidores;

CREATE POLICY "investidores_ws_select" ON investidores FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "investidores_ws_update" ON investidores FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "investidores_ws_delete" ON investidores FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "investidores_ws_insert" ON investidores FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== OPERADORES ==========
CREATE POLICY "operadores_ws_select" ON operadores FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "operadores_ws_update" ON operadores FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "operadores_ws_delete" ON operadores FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "operadores_ws_insert" ON operadores FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PAGAMENTOS_PROPOSTOS ==========
DROP POLICY IF EXISTS "Workspace isolation pagamentos_propostos DELETE" ON pagamentos_propostos;
DROP POLICY IF EXISTS "Workspace isolation pagamentos_propostos SELECT" ON pagamentos_propostos;
DROP POLICY IF EXISTS "Workspace isolation pagamentos_propostos UPDATE" ON pagamentos_propostos;

CREATE POLICY "pag_prop_ws_select" ON pagamentos_propostos FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "pag_prop_ws_update" ON pagamentos_propostos FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "pag_prop_ws_delete" ON pagamentos_propostos FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "pag_prop_ws_insert" ON pagamentos_propostos FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PARCEIRO_LUCRO_ALERTAS ==========
DROP POLICY IF EXISTS "Workspace isolation parceiro_lucro_alertas DELETE" ON parceiro_lucro_alertas;
DROP POLICY IF EXISTS "Workspace isolation parceiro_lucro_alertas SELECT" ON parceiro_lucro_alertas;
DROP POLICY IF EXISTS "Workspace isolation parceiro_lucro_alertas UPDATE" ON parceiro_lucro_alertas;

CREATE POLICY "parc_alertas_ws_select" ON parceiro_lucro_alertas FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "parc_alertas_ws_update" ON parceiro_lucro_alertas FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "parc_alertas_ws_delete" ON parceiro_lucro_alertas FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "parc_alertas_ws_insert" ON parceiro_lucro_alertas FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PARTICIPACAO_CICLOS ==========
DROP POLICY IF EXISTS "Workspace isolation participacao_ciclos DELETE" ON participacao_ciclos;
DROP POLICY IF EXISTS "Workspace isolation participacao_ciclos SELECT" ON participacao_ciclos;
DROP POLICY IF EXISTS "Workspace isolation participacao_ciclos UPDATE" ON participacao_ciclos;

CREATE POLICY "part_ciclos_ws_select" ON participacao_ciclos FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "part_ciclos_ws_update" ON participacao_ciclos FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "part_ciclos_ws_delete" ON participacao_ciclos FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "part_ciclos_ws_insert" ON participacao_ciclos FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PROJECT_BOOKMAKER_LINK_BONUSES ==========
DROP POLICY IF EXISTS "Workspace isolation project_bookmaker_link_bonuses DELETE" ON project_bookmaker_link_bonuses;
DROP POLICY IF EXISTS "Workspace isolation project_bookmaker_link_bonuses SELECT" ON project_bookmaker_link_bonuses;
DROP POLICY IF EXISTS "Workspace isolation project_bookmaker_link_bonuses UPDATE" ON project_bookmaker_link_bonuses;

CREATE POLICY "proj_bk_bonuses_ws_select" ON project_bookmaker_link_bonuses FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "proj_bk_bonuses_ws_update" ON project_bookmaker_link_bonuses FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "proj_bk_bonuses_ws_delete" ON project_bookmaker_link_bonuses FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "proj_bk_bonuses_ws_insert" ON project_bookmaker_link_bonuses FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PROJETO_BOOKMAKER_HISTORICO ==========
DROP POLICY IF EXISTS "Workspace isolation projeto_bookmaker_historico DELETE" ON projeto_bookmaker_historico;
DROP POLICY IF EXISTS "Workspace isolation projeto_bookmaker_historico SELECT" ON projeto_bookmaker_historico;
DROP POLICY IF EXISTS "Workspace isolation projeto_bookmaker_historico UPDATE" ON projeto_bookmaker_historico;

CREATE POLICY "proj_bk_hist_ws_select" ON projeto_bookmaker_historico FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "proj_bk_hist_ws_update" ON projeto_bookmaker_historico FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "proj_bk_hist_ws_delete" ON projeto_bookmaker_historico FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "proj_bk_hist_ws_insert" ON projeto_bookmaker_historico FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PROJETO_CONCILIACOES ==========
DROP POLICY IF EXISTS "Workspace isolation projeto_conciliacoes DELETE" ON projeto_conciliacoes;
DROP POLICY IF EXISTS "Workspace isolation projeto_conciliacoes SELECT" ON projeto_conciliacoes;
DROP POLICY IF EXISTS "Workspace isolation projeto_conciliacoes UPDATE" ON projeto_conciliacoes;

CREATE POLICY "proj_conc_ws_select" ON projeto_conciliacoes FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "proj_conc_ws_update" ON projeto_conciliacoes FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "proj_conc_ws_delete" ON projeto_conciliacoes FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "proj_conc_ws_insert" ON projeto_conciliacoes FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PROMOCAO_PARTICIPANTES ==========
DROP POLICY IF EXISTS "Workspace isolation promocao_participantes DELETE" ON promocao_participantes;
DROP POLICY IF EXISTS "Workspace isolation promocao_participantes SELECT" ON promocao_participantes;
DROP POLICY IF EXISTS "Workspace isolation promocao_participantes UPDATE" ON promocao_participantes;

CREATE POLICY "promo_part_ws_select" ON promocao_participantes FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "promo_part_ws_update" ON promocao_participantes FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "promo_part_ws_delete" ON promocao_participantes FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "promo_part_ws_insert" ON promocao_participantes FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== TRANSACOES_BOOKMAKERS ==========
DROP POLICY IF EXISTS "Workspace isolation transacoes_bookmakers DELETE" ON transacoes_bookmakers;
DROP POLICY IF EXISTS "Workspace isolation transacoes_bookmakers SELECT" ON transacoes_bookmakers;
DROP POLICY IF EXISTS "Workspace isolation transacoes_bookmakers UPDATE" ON transacoes_bookmakers;

CREATE POLICY "trans_bk_ws_select" ON transacoes_bookmakers FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "trans_bk_ws_update" ON transacoes_bookmakers FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "trans_bk_ws_delete" ON transacoes_bookmakers FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "trans_bk_ws_insert" ON transacoes_bookmakers FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== CASH_LEDGER - Atualizar policies existentes ==========
-- Já tem policies corretas (Users can...) mas precisamos remover as duplicadas problemáticas
DROP POLICY IF EXISTS "Workspace isolation cash_ledger INSERT" ON cash_ledger;

CREATE POLICY "cash_ledger_ws_select" ON cash_ledger FOR SELECT
  USING (workspace_id = get_current_workspace());
CREATE POLICY "cash_ledger_ws_update" ON cash_ledger FOR UPDATE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "cash_ledger_ws_delete" ON cash_ledger FOR DELETE
  USING (workspace_id = get_current_workspace());
CREATE POLICY "cash_ledger_ws_insert" ON cash_ledger FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());
