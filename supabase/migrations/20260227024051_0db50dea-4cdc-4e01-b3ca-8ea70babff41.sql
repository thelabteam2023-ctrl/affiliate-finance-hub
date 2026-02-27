
-- ============================================================
-- FASE 1: Campos financeiros na tabela ocorrencias
-- ============================================================

-- Enum para resultado financeiro
DO $$ BEGIN
  CREATE TYPE public.ocorrencia_resultado_financeiro AS ENUM (
    'sem_impacto',
    'perda_confirmada', 
    'perda_parcial'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Adicionar campos financeiros
ALTER TABLE public.ocorrencias
  ADD COLUMN IF NOT EXISTS valor_risco numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resultado_financeiro public.ocorrencia_resultado_financeiro DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS valor_perda numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS perda_registrada_ledger boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS moeda text DEFAULT 'BRL';

-- Índice para buscar ocorrências por projeto (aba do projeto)
CREATE INDEX IF NOT EXISTS idx_ocorrencias_projeto_id ON public.ocorrencias(projeto_id) WHERE projeto_id IS NOT NULL;

-- Índice para buscar perdas confirmadas (cálculo de lucro)
CREATE INDEX IF NOT EXISTS idx_ocorrencias_perda_confirmada ON public.ocorrencias(projeto_id, resultado_financeiro) 
  WHERE resultado_financeiro IN ('perda_confirmada', 'perda_parcial');
