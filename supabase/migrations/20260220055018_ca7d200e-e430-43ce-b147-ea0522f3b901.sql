
-- Drop old single-fee columns and add separate deposit/withdrawal fee columns
-- Each can be: tipo ('percentual' | 'fixo' | null), valor (number), moeda (string)

ALTER TABLE public.bancos
  -- Remove old columns
  DROP COLUMN IF EXISTS taxa_percentual,
  DROP COLUMN IF EXISTS taxa_incidencia,
  -- Add deposit fee columns
  ADD COLUMN IF NOT EXISTS taxa_deposito_tipo TEXT NULL,
  ADD COLUMN IF NOT EXISTS taxa_deposito_valor NUMERIC(14,4) NULL,
  -- Add withdrawal fee columns
  ADD COLUMN IF NOT EXISTS taxa_saque_tipo TEXT NULL,
  ADD COLUMN IF NOT EXISTS taxa_saque_valor NUMERIC(14,4) NULL,
  -- Currency for fixed fees (uses bank's currency)
  ADD COLUMN IF NOT EXISTS taxa_moeda TEXT NULL DEFAULT 'BRL';

-- Validation triggers (better than CHECK constraints)
CREATE OR REPLACE FUNCTION public.validate_banco_taxas()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate deposito tipo
  IF NEW.taxa_deposito_tipo IS NOT NULL AND NEW.taxa_deposito_tipo NOT IN ('percentual', 'fixo') THEN
    RAISE EXCEPTION 'taxa_deposito_tipo deve ser percentual, fixo ou NULL';
  END IF;
  -- Validate saque tipo
  IF NEW.taxa_saque_tipo IS NOT NULL AND NEW.taxa_saque_tipo NOT IN ('percentual', 'fixo') THEN
    RAISE EXCEPTION 'taxa_saque_tipo deve ser percentual, fixo ou NULL';
  END IF;
  -- If tipo is set, valor must be set too
  IF NEW.taxa_deposito_tipo IS NOT NULL AND NEW.taxa_deposito_valor IS NULL THEN
    RAISE EXCEPTION 'taxa_deposito_valor deve ser definido quando taxa_deposito_tipo está definido';
  END IF;
  IF NEW.taxa_saque_tipo IS NOT NULL AND NEW.taxa_saque_valor IS NULL THEN
    RAISE EXCEPTION 'taxa_saque_valor deve ser definido quando taxa_saque_tipo está definido';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS tr_validate_banco_taxas ON public.bancos;
CREATE TRIGGER tr_validate_banco_taxas
  BEFORE INSERT OR UPDATE ON public.bancos
  FOR EACH ROW EXECUTE FUNCTION public.validate_banco_taxas();
