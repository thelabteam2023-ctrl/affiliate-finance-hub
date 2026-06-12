CREATE OR REPLACE FUNCTION public.validate_wallet_endereco_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ws uuid;
  v_exists boolean;
BEGIN
  SELECT workspace_id INTO v_ws FROM public.parceiros WHERE id = NEW.parceiro_id;
  IF v_ws IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.wallets_crypto w
    INNER JOIN public.parceiros p ON p.id = w.parceiro_id
    WHERE w.endereco = NEW.endereco
      AND p.workspace_id = v_ws
      AND w.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'Este endereço de wallet já está cadastrado para outro parceiro neste workspace'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.validate_pix_key_unique()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ws uuid;
  v_exists boolean;
BEGIN
  IF NEW.pix_key IS NULL OR NEW.pix_key = '' THEN
    RETURN NEW;
  END IF;

  SELECT workspace_id INTO v_ws FROM public.parceiros WHERE id = NEW.parceiro_id;
  IF v_ws IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS(
    SELECT 1
    FROM public.contas_bancarias cb
    INNER JOIN public.parceiros p ON cb.parceiro_id = p.id
    WHERE cb.pix_key = NEW.pix_key
      AND p.workspace_id = v_ws
      AND cb.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) INTO v_exists;

  IF v_exists THEN
    RAISE EXCEPTION 'Esta chave PIX já está cadastrada em outra conta bancária neste workspace'
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$function$;