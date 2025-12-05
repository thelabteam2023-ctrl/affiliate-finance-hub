-- Create function to validate PIX key uniqueness across all bank accounts per tenant
CREATE OR REPLACE FUNCTION public.validate_pix_key_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id UUID;
  v_exists BOOLEAN;
BEGIN
  -- Skip if pix_key is null or empty
  IF NEW.pix_key IS NULL OR NEW.pix_key = '' THEN
    RETURN NEW;
  END IF;

  -- Get user_id from the parceiro
  SELECT p.user_id INTO v_user_id
  FROM public.parceiros p
  WHERE p.id = NEW.parceiro_id;

  -- Check if this PIX key already exists for another bank account in the same tenant
  SELECT EXISTS(
    SELECT 1
    FROM public.contas_bancarias cb
    INNER JOIN public.parceiros p ON cb.parceiro_id = p.id
    WHERE cb.pix_key = NEW.pix_key
    AND p.user_id = v_user_id
    AND cb.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID)
  ) INTO v_exists;

  -- If already exists, raise error
  IF v_exists THEN
    RAISE EXCEPTION 'Esta chave PIX já está cadastrada em outra conta bancária'
      USING ERRCODE = '23505'; -- unique_violation
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger for PIX key validation
DROP TRIGGER IF EXISTS validate_pix_key_unique_trigger ON public.contas_bancarias;
CREATE TRIGGER validate_pix_key_unique_trigger
  BEFORE INSERT OR UPDATE ON public.contas_bancarias
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_pix_key_unique();