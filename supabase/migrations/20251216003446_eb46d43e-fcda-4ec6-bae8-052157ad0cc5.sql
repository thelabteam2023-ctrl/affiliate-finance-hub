-- Padronização de Status de Apostas: Converter todos os status finais para LIQUIDADA

-- 1. Apostas simples - converter CONCLUIDA e FINALIZADA para LIQUIDADA
UPDATE apostas 
SET status = 'LIQUIDADA' 
WHERE status IN ('CONCLUIDA', 'FINALIZADA', 'REALIZADA') 
  AND resultado IS NOT NULL;

-- 2. Apostas múltiplas - converter CONCLUIDA, FINALIZADA e REALIZADA para LIQUIDADA
UPDATE apostas_multiplas 
SET status = 'LIQUIDADA' 
WHERE status IN ('CONCLUIDA', 'FINALIZADA', 'REALIZADA') 
  AND resultado IS NOT NULL 
  AND resultado != 'PENDENTE';

-- 3. Garantir consistência: apostas com resultado mas status errado
UPDATE apostas 
SET status = 'LIQUIDADA' 
WHERE resultado IS NOT NULL 
  AND resultado != 'PENDENTE'
  AND status NOT IN ('LIQUIDADA', 'PENDENTE');

UPDATE apostas_multiplas 
SET status = 'LIQUIDADA' 
WHERE resultado IS NOT NULL 
  AND resultado != 'PENDENTE'
  AND status NOT IN ('LIQUIDADA', 'PENDENTE');

-- 4. Atualizar pernas de surebet (apostas vinculadas) para LIQUIDADA
UPDATE apostas 
SET status = 'LIQUIDADA' 
WHERE surebet_id IS NOT NULL 
  AND resultado IS NOT NULL 
  AND resultado != 'PENDENTE'
  AND status != 'LIQUIDADA';