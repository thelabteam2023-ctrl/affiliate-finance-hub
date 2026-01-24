
-- Corrigir search_path da função protect_bookmaker_lifecycle
CREATE OR REPLACE FUNCTION public.protect_bookmaker_lifecycle()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Se estava encerrada e tentou voltar para ativo, bloqueia
  IF OLD.estado_conta = 'encerrada' AND NEW.estado_conta IN ('ativo', 'limitada') THEN
    RAISE EXCEPTION 'Conta encerrada não pode ser reativada. Crie uma nova conta.';
  END IF;
  
  RETURN NEW;
END;
$$;
