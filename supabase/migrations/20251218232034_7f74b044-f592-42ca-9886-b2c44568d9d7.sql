-- =============================================
-- RLS POLICIES PARA TABELAS COM WORKSPACE_ID
-- =============================================

-- Função auxiliar para obter workspace do usuário atual
CREATE OR REPLACE FUNCTION public.get_current_workspace()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT workspace_id 
  FROM public.workspace_members 
  WHERE user_id = auth.uid() 
  LIMIT 1;
$$;

-- =============================================
-- 1. APOSTAS
-- =============================================
DROP POLICY IF EXISTS "apostas_select" ON public.apostas;
DROP POLICY IF EXISTS "apostas_insert" ON public.apostas;
DROP POLICY IF EXISTS "apostas_update" ON public.apostas;
DROP POLICY IF EXISTS "apostas_delete" ON public.apostas;

CREATE POLICY "apostas_select" ON public.apostas FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "apostas_insert" ON public.apostas FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "apostas_update" ON public.apostas FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "apostas_delete" ON public.apostas FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 2. APOSTAS_MULTIPLAS
-- =============================================
DROP POLICY IF EXISTS "apostas_multiplas_select" ON public.apostas_multiplas;
DROP POLICY IF EXISTS "apostas_multiplas_insert" ON public.apostas_multiplas;
DROP POLICY IF EXISTS "apostas_multiplas_update" ON public.apostas_multiplas;
DROP POLICY IF EXISTS "apostas_multiplas_delete" ON public.apostas_multiplas;

CREATE POLICY "apostas_multiplas_select" ON public.apostas_multiplas FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "apostas_multiplas_insert" ON public.apostas_multiplas FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "apostas_multiplas_update" ON public.apostas_multiplas FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "apostas_multiplas_delete" ON public.apostas_multiplas FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 3. BOOKMAKERS
-- =============================================
DROP POLICY IF EXISTS "bookmakers_select" ON public.bookmakers;
DROP POLICY IF EXISTS "bookmakers_insert" ON public.bookmakers;
DROP POLICY IF EXISTS "bookmakers_update" ON public.bookmakers;
DROP POLICY IF EXISTS "bookmakers_delete" ON public.bookmakers;

CREATE POLICY "bookmakers_select" ON public.bookmakers FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "bookmakers_insert" ON public.bookmakers FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "bookmakers_update" ON public.bookmakers FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "bookmakers_delete" ON public.bookmakers FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 4. CASH_LEDGER
-- =============================================
DROP POLICY IF EXISTS "cash_ledger_select" ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_insert" ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_update" ON public.cash_ledger;
DROP POLICY IF EXISTS "cash_ledger_delete" ON public.cash_ledger;

CREATE POLICY "cash_ledger_select" ON public.cash_ledger FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "cash_ledger_insert" ON public.cash_ledger FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "cash_ledger_update" ON public.cash_ledger FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "cash_ledger_delete" ON public.cash_ledger FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 5. DESPESAS_ADMINISTRATIVAS
-- =============================================
DROP POLICY IF EXISTS "despesas_administrativas_select" ON public.despesas_administrativas;
DROP POLICY IF EXISTS "despesas_administrativas_insert" ON public.despesas_administrativas;
DROP POLICY IF EXISTS "despesas_administrativas_update" ON public.despesas_administrativas;
DROP POLICY IF EXISTS "despesas_administrativas_delete" ON public.despesas_administrativas;

CREATE POLICY "despesas_administrativas_select" ON public.despesas_administrativas FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "despesas_administrativas_insert" ON public.despesas_administrativas FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "despesas_administrativas_update" ON public.despesas_administrativas FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "despesas_administrativas_delete" ON public.despesas_administrativas FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 6. ENTREGAS
-- =============================================
DROP POLICY IF EXISTS "entregas_select" ON public.entregas;
DROP POLICY IF EXISTS "entregas_insert" ON public.entregas;
DROP POLICY IF EXISTS "entregas_update" ON public.entregas;
DROP POLICY IF EXISTS "entregas_delete" ON public.entregas;

CREATE POLICY "entregas_select" ON public.entregas FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "entregas_insert" ON public.entregas FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "entregas_update" ON public.entregas FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "entregas_delete" ON public.entregas FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 7. FORNECEDORES
-- =============================================
DROP POLICY IF EXISTS "fornecedores_select" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores_insert" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores_update" ON public.fornecedores;
DROP POLICY IF EXISTS "fornecedores_delete" ON public.fornecedores;

CREATE POLICY "fornecedores_select" ON public.fornecedores FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "fornecedores_insert" ON public.fornecedores FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "fornecedores_update" ON public.fornecedores FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "fornecedores_delete" ON public.fornecedores FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 8. FREEBETS_RECEBIDAS
-- =============================================
DROP POLICY IF EXISTS "freebets_recebidas_select" ON public.freebets_recebidas;
DROP POLICY IF EXISTS "freebets_recebidas_insert" ON public.freebets_recebidas;
DROP POLICY IF EXISTS "freebets_recebidas_update" ON public.freebets_recebidas;
DROP POLICY IF EXISTS "freebets_recebidas_delete" ON public.freebets_recebidas;

CREATE POLICY "freebets_recebidas_select" ON public.freebets_recebidas FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "freebets_recebidas_insert" ON public.freebets_recebidas FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "freebets_recebidas_update" ON public.freebets_recebidas FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "freebets_recebidas_delete" ON public.freebets_recebidas FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 9. INDICACOES
-- =============================================
DROP POLICY IF EXISTS "indicacoes_select" ON public.indicacoes;
DROP POLICY IF EXISTS "indicacoes_insert" ON public.indicacoes;
DROP POLICY IF EXISTS "indicacoes_update" ON public.indicacoes;
DROP POLICY IF EXISTS "indicacoes_delete" ON public.indicacoes;

CREATE POLICY "indicacoes_select" ON public.indicacoes FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "indicacoes_insert" ON public.indicacoes FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "indicacoes_update" ON public.indicacoes FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "indicacoes_delete" ON public.indicacoes FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 10. INDICADORES_REFERRAL
-- =============================================
DROP POLICY IF EXISTS "indicadores_referral_select" ON public.indicadores_referral;
DROP POLICY IF EXISTS "indicadores_referral_insert" ON public.indicadores_referral;
DROP POLICY IF EXISTS "indicadores_referral_update" ON public.indicadores_referral;
DROP POLICY IF EXISTS "indicadores_referral_delete" ON public.indicadores_referral;

CREATE POLICY "indicadores_referral_select" ON public.indicadores_referral FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "indicadores_referral_insert" ON public.indicadores_referral FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "indicadores_referral_update" ON public.indicadores_referral FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "indicadores_referral_delete" ON public.indicadores_referral FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 11. INVESTIDORES
-- =============================================
DROP POLICY IF EXISTS "investidores_select" ON public.investidores;
DROP POLICY IF EXISTS "investidores_insert" ON public.investidores;
DROP POLICY IF EXISTS "investidores_update" ON public.investidores;
DROP POLICY IF EXISTS "investidores_delete" ON public.investidores;

CREATE POLICY "investidores_select" ON public.investidores FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "investidores_insert" ON public.investidores FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "investidores_update" ON public.investidores FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "investidores_delete" ON public.investidores FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 12. MATCHED_BETTING_ROUNDS
-- =============================================
DROP POLICY IF EXISTS "matched_betting_rounds_select" ON public.matched_betting_rounds;
DROP POLICY IF EXISTS "matched_betting_rounds_insert" ON public.matched_betting_rounds;
DROP POLICY IF EXISTS "matched_betting_rounds_update" ON public.matched_betting_rounds;
DROP POLICY IF EXISTS "matched_betting_rounds_delete" ON public.matched_betting_rounds;

CREATE POLICY "matched_betting_rounds_select" ON public.matched_betting_rounds FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "matched_betting_rounds_insert" ON public.matched_betting_rounds FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "matched_betting_rounds_update" ON public.matched_betting_rounds FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "matched_betting_rounds_delete" ON public.matched_betting_rounds FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 13. MOVIMENTACOES_INDICACAO
-- =============================================
DROP POLICY IF EXISTS "movimentacoes_indicacao_select" ON public.movimentacoes_indicacao;
DROP POLICY IF EXISTS "movimentacoes_indicacao_insert" ON public.movimentacoes_indicacao;
DROP POLICY IF EXISTS "movimentacoes_indicacao_update" ON public.movimentacoes_indicacao;
DROP POLICY IF EXISTS "movimentacoes_indicacao_delete" ON public.movimentacoes_indicacao;

CREATE POLICY "movimentacoes_indicacao_select" ON public.movimentacoes_indicacao FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "movimentacoes_indicacao_insert" ON public.movimentacoes_indicacao FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "movimentacoes_indicacao_update" ON public.movimentacoes_indicacao FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "movimentacoes_indicacao_delete" ON public.movimentacoes_indicacao FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 14. OPERADOR_PROJETOS
-- =============================================
DROP POLICY IF EXISTS "operador_projetos_select" ON public.operador_projetos;
DROP POLICY IF EXISTS "operador_projetos_insert" ON public.operador_projetos;
DROP POLICY IF EXISTS "operador_projetos_update" ON public.operador_projetos;
DROP POLICY IF EXISTS "operador_projetos_delete" ON public.operador_projetos;

CREATE POLICY "operador_projetos_select" ON public.operador_projetos FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "operador_projetos_insert" ON public.operador_projetos FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "operador_projetos_update" ON public.operador_projetos FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "operador_projetos_delete" ON public.operador_projetos FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 15. OPERADORES
-- =============================================
DROP POLICY IF EXISTS "operadores_select" ON public.operadores;
DROP POLICY IF EXISTS "operadores_insert" ON public.operadores;
DROP POLICY IF EXISTS "operadores_update" ON public.operadores;
DROP POLICY IF EXISTS "operadores_delete" ON public.operadores;

CREATE POLICY "operadores_select" ON public.operadores FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "operadores_insert" ON public.operadores FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "operadores_update" ON public.operadores FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "operadores_delete" ON public.operadores FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 16. PAGAMENTOS_OPERADOR
-- =============================================
DROP POLICY IF EXISTS "pagamentos_operador_select" ON public.pagamentos_operador;
DROP POLICY IF EXISTS "pagamentos_operador_insert" ON public.pagamentos_operador;
DROP POLICY IF EXISTS "pagamentos_operador_update" ON public.pagamentos_operador;
DROP POLICY IF EXISTS "pagamentos_operador_delete" ON public.pagamentos_operador;

CREATE POLICY "pagamentos_operador_select" ON public.pagamentos_operador FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "pagamentos_operador_insert" ON public.pagamentos_operador FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "pagamentos_operador_update" ON public.pagamentos_operador FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "pagamentos_operador_delete" ON public.pagamentos_operador FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 17. PARCEIROS
-- =============================================
DROP POLICY IF EXISTS "parceiros_select" ON public.parceiros;
DROP POLICY IF EXISTS "parceiros_insert" ON public.parceiros;
DROP POLICY IF EXISTS "parceiros_update" ON public.parceiros;
DROP POLICY IF EXISTS "parceiros_delete" ON public.parceiros;

CREATE POLICY "parceiros_select" ON public.parceiros FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "parceiros_insert" ON public.parceiros FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "parceiros_update" ON public.parceiros FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "parceiros_delete" ON public.parceiros FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 18. PARCERIAS
-- =============================================
DROP POLICY IF EXISTS "parcerias_select" ON public.parcerias;
DROP POLICY IF EXISTS "parcerias_insert" ON public.parcerias;
DROP POLICY IF EXISTS "parcerias_update" ON public.parcerias;
DROP POLICY IF EXISTS "parcerias_delete" ON public.parcerias;

CREATE POLICY "parcerias_select" ON public.parcerias FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "parcerias_insert" ON public.parcerias FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "parcerias_update" ON public.parcerias FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "parcerias_delete" ON public.parcerias FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 19. PROJETO_CICLOS
-- =============================================
DROP POLICY IF EXISTS "projeto_ciclos_select" ON public.projeto_ciclos;
DROP POLICY IF EXISTS "projeto_ciclos_insert" ON public.projeto_ciclos;
DROP POLICY IF EXISTS "projeto_ciclos_update" ON public.projeto_ciclos;
DROP POLICY IF EXISTS "projeto_ciclos_delete" ON public.projeto_ciclos;

CREATE POLICY "projeto_ciclos_select" ON public.projeto_ciclos FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "projeto_ciclos_insert" ON public.projeto_ciclos FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "projeto_ciclos_update" ON public.projeto_ciclos FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "projeto_ciclos_delete" ON public.projeto_ciclos FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 20. PROJETO_PERDAS
-- =============================================
DROP POLICY IF EXISTS "projeto_perdas_select" ON public.projeto_perdas;
DROP POLICY IF EXISTS "projeto_perdas_insert" ON public.projeto_perdas;
DROP POLICY IF EXISTS "projeto_perdas_update" ON public.projeto_perdas;
DROP POLICY IF EXISTS "projeto_perdas_delete" ON public.projeto_perdas;

CREATE POLICY "projeto_perdas_select" ON public.projeto_perdas FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "projeto_perdas_insert" ON public.projeto_perdas FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "projeto_perdas_update" ON public.projeto_perdas FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "projeto_perdas_delete" ON public.projeto_perdas FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 21. PROJETOS
-- =============================================
DROP POLICY IF EXISTS "projetos_select" ON public.projetos;
DROP POLICY IF EXISTS "projetos_insert" ON public.projetos;
DROP POLICY IF EXISTS "projetos_update" ON public.projetos;
DROP POLICY IF EXISTS "projetos_delete" ON public.projetos;

CREATE POLICY "projetos_select" ON public.projetos FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "projetos_insert" ON public.projetos FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "projetos_update" ON public.projetos FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "projetos_delete" ON public.projetos FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 22. PROMOCOES_INDICACAO
-- =============================================
DROP POLICY IF EXISTS "promocoes_indicacao_select" ON public.promocoes_indicacao;
DROP POLICY IF EXISTS "promocoes_indicacao_insert" ON public.promocoes_indicacao;
DROP POLICY IF EXISTS "promocoes_indicacao_update" ON public.promocoes_indicacao;
DROP POLICY IF EXISTS "promocoes_indicacao_delete" ON public.promocoes_indicacao;

CREATE POLICY "promocoes_indicacao_select" ON public.promocoes_indicacao FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "promocoes_indicacao_insert" ON public.promocoes_indicacao FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "promocoes_indicacao_update" ON public.promocoes_indicacao FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "promocoes_indicacao_delete" ON public.promocoes_indicacao FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 23. SUREBETS
-- =============================================
DROP POLICY IF EXISTS "surebets_select" ON public.surebets;
DROP POLICY IF EXISTS "surebets_insert" ON public.surebets;
DROP POLICY IF EXISTS "surebets_update" ON public.surebets;
DROP POLICY IF EXISTS "surebets_delete" ON public.surebets;

CREATE POLICY "surebets_select" ON public.surebets FOR SELECT
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "surebets_insert" ON public.surebets FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "surebets_update" ON public.surebets FOR UPDATE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

CREATE POLICY "surebets_delete" ON public.surebets FOR DELETE
  USING (workspace_id = get_current_workspace() OR (workspace_id IS NULL AND user_id = auth.uid()));

-- =============================================
-- 24. TRANSACOES_BOOKMAKERS
-- =============================================
DROP POLICY IF EXISTS "transacoes_bookmakers_select" ON public.transacoes_bookmakers;
DROP POLICY IF EXISTS "transacoes_bookmakers_insert" ON public.transacoes_bookmakers;
DROP POLICY IF EXISTS "transacoes_bookmakers_update" ON public.transacoes_bookmakers;
DROP POLICY IF EXISTS "transacoes_bookmakers_delete" ON public.transacoes_bookmakers;

CREATE POLICY "transacoes_bookmakers_select" ON public.transacoes_bookmakers FOR SELECT
  USING (workspace_id = get_current_workspace());

CREATE POLICY "transacoes_bookmakers_insert" ON public.transacoes_bookmakers FOR INSERT
  WITH CHECK (workspace_id = get_current_workspace());

CREATE POLICY "transacoes_bookmakers_update" ON public.transacoes_bookmakers FOR UPDATE
  USING (workspace_id = get_current_workspace());

CREATE POLICY "transacoes_bookmakers_delete" ON public.transacoes_bookmakers FOR DELETE
  USING (workspace_id = get_current_workspace());