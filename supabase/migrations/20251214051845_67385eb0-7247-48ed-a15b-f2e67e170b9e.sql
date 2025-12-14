-- Simplificação do modelo de operador-projeto
-- 1. Renomear frequencia_entrega para frequencia_conciliacao
ALTER TABLE public.operador_projetos 
  RENAME COLUMN frequencia_entrega TO frequencia_conciliacao;

-- 2. Adicionar campo resumo_acordo para documentar o acordo de forma textual
ALTER TABLE public.operador_projetos 
  ADD COLUMN IF NOT EXISTS resumo_acordo text;