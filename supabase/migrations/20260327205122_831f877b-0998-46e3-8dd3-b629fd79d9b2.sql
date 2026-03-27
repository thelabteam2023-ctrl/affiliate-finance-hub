
-- FIX 1: Corrigir 5 apostas com stake_freebet > 0 mas fonte_saldo='REAL' e usar_freebet=false
-- Essas apostas teriam liquidação incorreta (debitando saldo_atual ao invés de saldo_freebet)
UPDATE apostas_unificada
SET 
  fonte_saldo = 'FREEBET',
  usar_freebet = true,
  updated_at = now()
WHERE id IN (
  '7a5272e1-38a3-4712-a65c-3f68444fea2c',
  'fe9b26ab-1953-4148-9de2-7fb286b486ef',
  '33a4fe07-5fc9-4efe-89dc-002f23596f01',
  'ce735242-3f68-4c4c-a353-c649a9817988',
  'bfdae614-3a23-46cd-86c6-d96774683cf4'
)
AND UPPER(status) = 'PENDENTE'
AND stake_freebet > 0
AND stake_real = 0;

-- FIX 2: Trigger de normalização para prevenir futuras inconsistências
-- Se stake_freebet > 0 e stake_real = 0, forçar fonte_saldo = 'FREEBET'
CREATE OR REPLACE FUNCTION fn_normalize_freebet_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Se 100% freebet, garantir metadata consistente
  IF COALESCE(NEW.stake_freebet, 0) > 0 AND COALESCE(NEW.stake_real, 0) = 0 THEN
    NEW.fonte_saldo := 'FREEBET';
    NEW.usar_freebet := true;
  END IF;
  
  -- Se 100% real, garantir metadata consistente
  IF COALESCE(NEW.stake_real, 0) > 0 AND COALESCE(NEW.stake_freebet, 0) = 0 THEN
    IF NEW.fonte_saldo = 'FREEBET' THEN
      NEW.fonte_saldo := 'REAL';
    END IF;
    IF NEW.usar_freebet IS NULL THEN
      NEW.usar_freebet := false;
    END IF;
  END IF;
  
  -- Misto: manter fonte_saldo como está, mas garantir usar_freebet = true
  IF COALESCE(NEW.stake_real, 0) > 0 AND COALESCE(NEW.stake_freebet, 0) > 0 THEN
    NEW.usar_freebet := true;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Criar trigger BEFORE INSERT/UPDATE
DROP TRIGGER IF EXISTS tr_normalize_freebet_metadata ON apostas_unificada;
CREATE TRIGGER tr_normalize_freebet_metadata
  BEFORE INSERT OR UPDATE ON apostas_unificada
  FOR EACH ROW
  EXECUTE FUNCTION fn_normalize_freebet_metadata();
