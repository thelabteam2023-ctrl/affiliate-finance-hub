-- ============================================
-- LIMPEZA: Remover políticas RLS antigas que filtram por user_id
-- Manter apenas as políticas de workspace
-- ============================================

-- 1. cash_ledger - remover políticas antigas baseadas em user_id
DROP POLICY IF EXISTS "Users can view own cash ledger" ON public.cash_ledger;
DROP POLICY IF EXISTS "Users can insert own cash ledger" ON public.cash_ledger;
DROP POLICY IF EXISTS "Users can update own cash ledger" ON public.cash_ledger;
DROP POLICY IF EXISTS "Users can delete own cash ledger" ON public.cash_ledger;

-- 2. operadores - remover políticas antigas baseadas em user_id
DROP POLICY IF EXISTS "Users can view own operadores" ON public.operadores;
DROP POLICY IF EXISTS "Users can insert own operadores" ON public.operadores;
DROP POLICY IF EXISTS "Users can update own operadores" ON public.operadores;
DROP POLICY IF EXISTS "Users can delete own operadores" ON public.operadores;

-- 3. movimentacoes_indicacao - remover políticas antigas baseadas em user_id
DROP POLICY IF EXISTS "Users can view own movimentacoes_indicacao" ON public.movimentacoes_indicacao;
DROP POLICY IF EXISTS "Users can insert own movimentacoes_indicacao" ON public.movimentacoes_indicacao;
DROP POLICY IF EXISTS "Users can update own movimentacoes_indicacao" ON public.movimentacoes_indicacao;
DROP POLICY IF EXISTS "Users can delete own movimentacoes_indicacao" ON public.movimentacoes_indicacao;

-- 4. Remover políticas de "Workspace isolation INSERT" que exigem user_id
-- Estas são redundantes com as políticas *_ws_insert que já existem
DROP POLICY IF EXISTS "Workspace isolation indicacoes INSERT" ON public.indicacoes;
DROP POLICY IF EXISTS "Workspace isolation indicadores_referral INSERT" ON public.indicadores_referral;
DROP POLICY IF EXISTS "Workspace isolation movimentacoes_indicacao INSERT" ON public.movimentacoes_indicacao;

-- Verificar outras tabelas e remover políticas antigas redundantes
DROP POLICY IF EXISTS "Workspace isolation apostas_unificada INSERT" ON public.apostas_unificada;
DROP POLICY IF EXISTS "Workspace isolation bookmakers INSERT" ON public.bookmakers;
DROP POLICY IF EXISTS "Workspace isolation fornecedores INSERT" ON public.fornecedores;
DROP POLICY IF EXISTS "Workspace isolation investidores INSERT" ON public.investidores;
DROP POLICY IF EXISTS "Workspace isolation parceiros INSERT" ON public.parceiros;
DROP POLICY IF EXISTS "Workspace isolation parcerias INSERT" ON public.parcerias;