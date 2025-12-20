-- ============================================================================
-- MIGRAÇÃO: Categorização Determinística por Estratégia
-- ============================================================================

-- 1. Adicionar campo forma_registro em apostas
ALTER TABLE public.apostas ADD COLUMN IF NOT EXISTS forma_registro TEXT DEFAULT 'SIMPLES';

-- 2. Adicionar campos estrategia e forma_registro em apostas_multiplas
ALTER TABLE public.apostas_multiplas ADD COLUMN IF NOT EXISTS estrategia TEXT DEFAULT 'PUNTER';
ALTER TABLE public.apostas_multiplas ADD COLUMN IF NOT EXISTS forma_registro TEXT DEFAULT 'MULTIPLA';

-- 3. Migrar dados legados em apostas
-- 3.1 SUREBET: surebet_id não nulo
UPDATE public.apostas 
SET estrategia = 'SUREBET', forma_registro = 'ARBITRAGEM'
WHERE surebet_id IS NOT NULL 
  AND (estrategia IS NULL OR estrategia = 'VALOR' OR estrategia = 'PUNTER');

-- 3.2 EXTRACAO_FREEBET: tipo_freebet não nulo OU gerou_freebet = true (sem surebet)
UPDATE public.apostas 
SET estrategia = 'EXTRACAO_FREEBET'
WHERE surebet_id IS NULL
  AND (tipo_freebet IS NOT NULL OR gerou_freebet = true)
  AND (estrategia IS NULL OR estrategia = 'VALOR');

-- 3.3 EXTRACAO_BONUS: is_bonus_bet = true (sem surebet e sem freebet)
UPDATE public.apostas 
SET estrategia = 'EXTRACAO_BONUS'
WHERE surebet_id IS NULL
  AND tipo_freebet IS NULL
  AND gerou_freebet IS NOT TRUE
  AND is_bonus_bet = true
  AND (estrategia IS NULL OR estrategia = 'VALOR');

-- 3.4 Converter 'VALOR' legado para 'PUNTER'
UPDATE public.apostas 
SET estrategia = 'PUNTER'
WHERE estrategia = 'VALOR';

-- 3.5 Garantir que apostas sem estratégia tenham PUNTER
UPDATE public.apostas 
SET estrategia = 'PUNTER'
WHERE estrategia IS NULL;

-- 4. Migrar dados legados em apostas_multiplas
-- 4.1 EXTRACAO_FREEBET
UPDATE public.apostas_multiplas 
SET estrategia = 'EXTRACAO_FREEBET'
WHERE (tipo_freebet IS NOT NULL OR gerou_freebet = true)
  AND (estrategia IS NULL OR estrategia = 'PUNTER');

-- 4.2 EXTRACAO_BONUS
UPDATE public.apostas_multiplas 
SET estrategia = 'EXTRACAO_BONUS'
WHERE tipo_freebet IS NULL
  AND gerou_freebet IS NOT TRUE
  AND is_bonus_bet = true
  AND (estrategia IS NULL OR estrategia = 'PUNTER');

-- 4.3 Garantir que múltiplas sem estratégia tenham PUNTER
UPDATE public.apostas_multiplas 
SET estrategia = 'PUNTER'
WHERE estrategia IS NULL;

-- 5. Alterar default de estrategia em apostas para PUNTER
ALTER TABLE public.apostas ALTER COLUMN estrategia SET DEFAULT 'PUNTER';

-- 6. Definir forma_registro para apostas existentes (todas são SIMPLES se não tiverem surebet)
UPDATE public.apostas 
SET forma_registro = 'ARBITRAGEM'
WHERE surebet_id IS NOT NULL AND forma_registro IS NULL;

UPDATE public.apostas 
SET forma_registro = 'SIMPLES'
WHERE surebet_id IS NULL AND (forma_registro IS NULL OR forma_registro = 'SIMPLES');