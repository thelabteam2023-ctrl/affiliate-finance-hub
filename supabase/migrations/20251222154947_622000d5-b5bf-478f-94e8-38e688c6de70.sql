-- ============================================================
-- FASE 1: Adicionar campo contexto_operacional
-- Este campo representa a ORIGEM do capital (NORMAL | FREEBET | BONUS)
-- É independente de estratégia e forma_registro
-- ============================================================

-- Adicionar campo contexto_operacional à tabela apostas
ALTER TABLE public.apostas 
ADD COLUMN IF NOT EXISTS contexto_operacional TEXT DEFAULT 'NORMAL';

-- Adicionar constraint de valores válidos
ALTER TABLE public.apostas 
ADD CONSTRAINT apostas_contexto_operacional_check 
CHECK (contexto_operacional IN ('NORMAL', 'FREEBET', 'BONUS'));

-- Migrar dados existentes baseado nos campos legados
UPDATE public.apostas 
SET contexto_operacional = 
  CASE 
    WHEN tipo_freebet IS NOT NULL AND tipo_freebet NOT IN ('normal', 'NORMAL', '') THEN 'FREEBET'
    WHEN is_bonus_bet = true THEN 'BONUS'
    ELSE 'NORMAL'
  END
WHERE contexto_operacional IS NULL OR contexto_operacional = 'NORMAL';

-- Adicionar campo contexto_operacional à tabela apostas_multiplas
ALTER TABLE public.apostas_multiplas 
ADD COLUMN IF NOT EXISTS contexto_operacional TEXT DEFAULT 'NORMAL';

-- Adicionar constraint de valores válidos
ALTER TABLE public.apostas_multiplas 
ADD CONSTRAINT apostas_multiplas_contexto_operacional_check 
CHECK (contexto_operacional IN ('NORMAL', 'FREEBET', 'BONUS'));

-- Migrar dados existentes para apostas_multiplas
UPDATE public.apostas_multiplas 
SET contexto_operacional = 
  CASE 
    WHEN tipo_freebet IS NOT NULL AND tipo_freebet NOT IN ('normal', 'NORMAL', '') THEN 'FREEBET'
    WHEN is_bonus_bet = true THEN 'BONUS'
    ELSE 'NORMAL'
  END
WHERE contexto_operacional IS NULL OR contexto_operacional = 'NORMAL';

-- Comentários para documentação
COMMENT ON COLUMN public.apostas.contexto_operacional IS 'Origem do capital: NORMAL (saldo real), FREEBET (freebet), BONUS (saldo de bônus). Escolha explícita do usuário, nunca inferida.';
COMMENT ON COLUMN public.apostas_multiplas.contexto_operacional IS 'Origem do capital: NORMAL (saldo real), FREEBET (freebet), BONUS (saldo de bônus). Escolha explícita do usuário, nunca inferida.';