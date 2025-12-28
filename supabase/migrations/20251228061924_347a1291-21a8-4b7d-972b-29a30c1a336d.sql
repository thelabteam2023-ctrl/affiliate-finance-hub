
-- FASE 3 (Parte 2): Criar novas policies corretas usando workspace_id (sem permitir NULL)

-- Função auxiliar para obter workspace do usuário atual (se não existir)
CREATE OR REPLACE FUNCTION public.get_current_workspace()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id FROM public.workspace_members 
  WHERE user_id = auth.uid() AND is_active = true 
  LIMIT 1
$$;

-- ========== APOSTAS_UNIFICADA ==========
CREATE POLICY "apostas_unificada_select" ON apostas_unificada FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "apostas_unificada_update" ON apostas_unificada FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "apostas_unificada_delete" ON apostas_unificada FOR DELETE
  USING (workspace_id = get_current_workspace());

-- ========== BOOKMAKERS ==========
CREATE POLICY "bookmakers_ws_select" ON bookmakers FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "bookmakers_ws_update" ON bookmakers FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "bookmakers_ws_delete" ON bookmakers FOR DELETE
  USING (workspace_id = get_current_workspace());

-- ========== DESPESAS_ADMINISTRATIVAS ==========
CREATE POLICY "despesas_ws_select" ON despesas_administrativas FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "despesas_ws_update" ON despesas_administrativas FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "despesas_ws_delete" ON despesas_administrativas FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "despesas_ws_insert" ON despesas_administrativas FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== ENTREGAS ==========
CREATE POLICY "entregas_ws_select" ON entregas FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "entregas_ws_update" ON entregas FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "entregas_ws_delete" ON entregas FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "entregas_ws_insert" ON entregas FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== FORNECEDORES ==========
CREATE POLICY "fornecedores_ws_select" ON fornecedores FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "fornecedores_ws_update" ON fornecedores FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "fornecedores_ws_delete" ON fornecedores FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "fornecedores_ws_insert" ON fornecedores FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== FREEBETS_RECEBIDAS ==========
CREATE POLICY "freebets_ws_select" ON freebets_recebidas FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "freebets_ws_update" ON freebets_recebidas FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "freebets_ws_delete" ON freebets_recebidas FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "freebets_ws_insert" ON freebets_recebidas FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== INDICACOES ==========
CREATE POLICY "indicacoes_ws_select" ON indicacoes FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "indicacoes_ws_update" ON indicacoes FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "indicacoes_ws_delete" ON indicacoes FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "indicacoes_ws_insert" ON indicacoes FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== INDICADORES_REFERRAL ==========
CREATE POLICY "indicadores_ws_select" ON indicadores_referral FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "indicadores_ws_update" ON indicadores_referral FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "indicadores_ws_delete" ON indicadores_referral FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "indicadores_ws_insert" ON indicadores_referral FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== MOVIMENTACOES_INDICACAO ==========
CREATE POLICY "mov_indicacao_ws_select" ON movimentacoes_indicacao FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "mov_indicacao_ws_update" ON movimentacoes_indicacao FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "mov_indicacao_ws_delete" ON movimentacoes_indicacao FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "mov_indicacao_ws_insert" ON movimentacoes_indicacao FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== OPERADOR_PROJETOS ==========
CREATE POLICY "op_proj_ws_select" ON operador_projetos FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "op_proj_ws_update" ON operador_projetos FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "op_proj_ws_delete" ON operador_projetos FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "op_proj_ws_insert" ON operador_projetos FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PAGAMENTOS_OPERADOR ==========
CREATE POLICY "pagto_op_ws_select" ON pagamentos_operador FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "pagto_op_ws_update" ON pagamentos_operador FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "pagto_op_ws_delete" ON pagamentos_operador FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "pagto_op_ws_insert" ON pagamentos_operador FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PARCEIROS ==========
CREATE POLICY "parceiros_ws_select" ON parceiros FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "parceiros_ws_update" ON parceiros FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "parceiros_ws_delete" ON parceiros FOR DELETE
  USING (workspace_id = get_current_workspace());

-- ========== PARCERIAS ==========
CREATE POLICY "parcerias_ws_select" ON parcerias FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "parcerias_ws_update" ON parcerias FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "parcerias_ws_delete" ON parcerias FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "parcerias_ws_insert" ON parcerias FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PROJETO_CICLOS ==========
CREATE POLICY "proj_ciclos_ws_select" ON projeto_ciclos FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "proj_ciclos_ws_update" ON projeto_ciclos FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "proj_ciclos_ws_delete" ON projeto_ciclos FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "proj_ciclos_ws_insert" ON projeto_ciclos FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PROJETO_PERDAS ==========
CREATE POLICY "proj_perdas_ws_select" ON projeto_perdas FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "proj_perdas_ws_update" ON projeto_perdas FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "proj_perdas_ws_delete" ON projeto_perdas FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "proj_perdas_ws_insert" ON projeto_perdas FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

-- ========== PROJETOS ==========
CREATE POLICY "projetos_ws_select" ON projetos FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "projetos_ws_update" ON projetos FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "projetos_ws_delete" ON projetos FOR DELETE
  USING (workspace_id = get_current_workspace());

-- ========== PROMOCOES_INDICACAO ==========
CREATE POLICY "promo_ind_ws_select" ON promocoes_indicacao FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "promo_ind_ws_update" ON promocoes_indicacao FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "promo_ind_ws_delete" ON promocoes_indicacao FOR DELETE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "promo_ind_ws_insert" ON promocoes_indicacao FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());
