
-- Adicionar campos de dispensa de pagamento na tabela parcerias
ALTER TABLE public.parcerias
  ADD COLUMN pagamento_dispensado boolean NOT NULL DEFAULT false,
  ADD COLUMN dispensa_motivo text,
  ADD COLUMN dispensa_at timestamptz,
  ADD COLUMN dispensa_por uuid;

-- Índice para queries que filtram por dispensa
CREATE INDEX idx_parcerias_pagamento_dispensado ON public.parcerias (pagamento_dispensado) WHERE pagamento_dispensado = true;

-- Atualizar a view v_custos_aquisicao para excluir parcerias dispensadas
-- (parcerias dispensadas não devem contar como indicação bem-sucedida)
CREATE OR REPLACE VIEW public.v_custos_aquisicao AS
SELECT 
    p.user_id,
    p.id AS parceria_id,
    p.parceiro_id,
    par.nome AS parceiro_nome,
    p.origem_tipo,
    p.data_inicio,
    p.status,
    p.indicacao_id,
    ind.indicador_id,
    ir.nome AS indicador_nome,
    p.valor_indicador,
    p.valor_parceiro,
    p.fornecedor_id,
    f.nome AS fornecedor_nome,
    p.valor_fornecedor,
    COALESCE(p.valor_indicador, 0::numeric) + COALESCE(p.valor_parceiro, 0::numeric) + COALESCE(p.valor_fornecedor, 0::numeric) AS custo_total
FROM parcerias p
LEFT JOIN parceiros par ON p.parceiro_id = par.id
LEFT JOIN indicacoes ind ON p.indicacao_id = ind.id
LEFT JOIN indicadores_referral ir ON ind.indicador_id = ir.id
LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
WHERE (p.workspace_id = get_current_workspace() OR (p.workspace_id IS NULL AND p.user_id = auth.uid()))
  AND p.pagamento_dispensado = false;
