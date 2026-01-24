-- Fix: allow cascade marker 'parceiro_inativo' in bookmakers.estado_conta
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'bookmakers'
      AND c.conname = 'bookmakers_estado_conta_check'
  ) THEN
    ALTER TABLE public.bookmakers DROP CONSTRAINT bookmakers_estado_conta_check;
  END IF;
END $$;

ALTER TABLE public.bookmakers
ADD CONSTRAINT bookmakers_estado_conta_check
CHECK (
  estado_conta = ANY (ARRAY['ativo'::text, 'limitada'::text, 'encerrada'::text, 'parceiro_inativo'::text])
);

-- Update cascade to avoid setting estado_conta = NULL (which violates the check)
CREATE OR REPLACE FUNCTION public.cascade_parceiro_inativo_bookmakers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Se parceiro está sendo inativado
  IF OLD.status = 'ativo' AND NEW.status = 'inativo' THEN
    UPDATE public.bookmakers
    SET 
      status = 'bloqueada',
      estado_conta = 'parceiro_inativo',
      updated_at = NOW()
    WHERE parceiro_id = NEW.id
      AND status NOT IN ('encerrada', 'bloqueada');

    RAISE NOTICE 'Parceiro % inativado. Bookmakers bloqueadas.', NEW.nome;
  END IF;

  -- Se parceiro está sendo reativado
  IF OLD.status = 'inativo' AND NEW.status = 'ativo' THEN
    UPDATE public.bookmakers
    SET 
      status = 'ativo',
      estado_conta = 'ativo',
      updated_at = NOW()
    WHERE parceiro_id = NEW.id
      AND status = 'bloqueada'
      AND estado_conta = 'parceiro_inativo';

    RAISE NOTICE 'Parceiro % reativado. Bookmakers desbloqueadas.', NEW.nome;
  END IF;

  RETURN NEW;
END;
$$;