-- 1. Tornar parceria_id nullable
ALTER TABLE public.movimentacoes_indicacao 
  ALTER COLUMN parceria_id DROP NOT NULL;

-- 2. Adicionar coluna parceiro_id
ALTER TABLE public.movimentacoes_indicacao 
  ADD COLUMN IF NOT EXISTS parceiro_id uuid REFERENCES public.parceiros(id);

-- 3. Índice para parceiro_id
CREATE INDEX IF NOT EXISTS idx_movimentacoes_indicacao_parceiro_id 
  ON public.movimentacoes_indicacao(parceiro_id) 
  WHERE parceiro_id IS NOT NULL;

-- 4. Dropar views dependentes (cascade)
DROP VIEW IF EXISTS public.v_indicador_performance CASCADE;
DROP VIEW IF EXISTS public.v_movimentacoes_indicacao_workspace CASCADE;

-- 5. Recriar v_movimentacoes_indicacao_workspace usando workspace_id direto
CREATE VIEW public.v_movimentacoes_indicacao_workspace AS
SELECT 
  mi.id,
  mi.user_id,
  mi.parceria_id,
  mi.parceiro_id,
  mi.indicador_id,
  mi.tipo,
  mi.valor,
  mi.moeda,
  mi.data_movimentacao,
  mi.descricao,
  mi.status,
  mi.created_at,
  mi.origem_tipo,
  mi.origem_caixa_operacional,
  mi.origem_conta_bancaria_id,
  mi.origem_wallet_id,
  mi.origem_parceiro_id,
  mi.tipo_moeda,
  mi.coin,
  mi.qtd_coin,
  mi.cotacao,
  mi.workspace_id
FROM public.movimentacoes_indicacao mi
WHERE mi.workspace_id = get_current_workspace();

-- 6. Recriar v_indicador_performance
CREATE VIEW public.v_indicador_performance AS
SELECT 
  i.id AS indicador_id,
  i.user_id,
  i.nome,
  i.cpf,
  i.status,
  i.telefone,
  i.email,
  COALESCE((
    SELECT count(DISTINCT ind.parceiro_id)
    FROM indicacoes ind
    JOIN parceiros par ON par.id = ind.parceiro_id
    WHERE ind.indicador_id = i.id AND par.workspace_id = get_current_workspace()
  ), 0) AS total_parceiros_indicados,
  COALESCE((
    SELECT count(DISTINCT p.id)
    FROM indicacoes ind
    JOIN parcerias p ON ind.id = p.indicacao_id
    WHERE ind.indicador_id = i.id AND p.status = 'ATIVA' AND p.workspace_id = get_current_workspace()
  ), 0) AS parcerias_ativas,
  COALESCE((
    SELECT count(DISTINCT p.id)
    FROM indicacoes ind
    JOIN parcerias p ON ind.id = p.indicacao_id
    WHERE ind.indicador_id = i.id AND p.status = 'ENCERRADA' AND p.workspace_id = get_current_workspace()
  ), 0) AS parcerias_encerradas,
  COALESCE((
    SELECT sum(m.valor)
    FROM v_movimentacoes_indicacao_workspace m
    WHERE m.indicador_id = i.id AND m.tipo = 'COMISSAO_INDICADOR' AND m.status = 'CONFIRMADO'
  ), 0) AS total_comissoes,
  COALESCE((
    SELECT sum(m.valor)
    FROM v_movimentacoes_indicacao_workspace m
    WHERE m.indicador_id = i.id AND m.tipo = 'BONUS_INDICADOR' AND m.status = 'CONFIRMADO'
  ), 0) AS total_bonus
FROM indicadores_referral i
WHERE i.workspace_id = get_current_workspace();
