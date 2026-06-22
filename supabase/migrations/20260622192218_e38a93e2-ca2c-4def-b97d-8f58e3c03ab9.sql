-- ============================================================================
-- Camada C: Constraint no banco — perna LAY nunca pode ter >1 entry
-- ============================================================================
-- Decisão de produto: LAY não admite composição multi-casa. Ramo único de
-- agregação (soma de stake, odd média ponderada) é matematicamente válido só
-- para BACK. LAY opera por liability e qualquer multi-entry quebraria o
-- cálculo, a guard de saldo e a re-liquidação.
--
-- Pré-condição validada: 0 registros LAY hoje em apostas_pernas/entries.
-- Não há migração de dados necessária.

-- Trigger 1: bloqueia INSERT/UPDATE em apostas_perna_entradas quando isso
-- faria uma perna LAY exceder 1 entry.
CREATE OR REPLACE FUNCTION public.enforce_lay_leg_single_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_perna_tipo TEXT;
  v_count INT;
BEGIN
  SELECT tipo INTO v_perna_tipo
  FROM public.apostas_pernas
  WHERE id = NEW.perna_id;

  IF v_perna_tipo IS DISTINCT FROM 'lay' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.apostas_perna_entradas
  WHERE perna_id = NEW.perna_id
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  -- Após esta operação, contagem total = v_count + 1 (a linha NEW).
  IF v_count + 1 > 1 THEN
    RAISE EXCEPTION 'LAY_LEG_MULTI_ENTRY_NOT_SUPPORTED: perna LAY % não pode ter mais de 1 sub-entrada (tentativa de gravar %).', NEW.perna_id, v_count + 1
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_lay_leg_single_entry ON public.apostas_perna_entradas;
CREATE TRIGGER trg_enforce_lay_leg_single_entry
  BEFORE INSERT OR UPDATE OF perna_id ON public.apostas_perna_entradas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lay_leg_single_entry();

-- Trigger 2: bloqueia UPDATE de apostas_pernas.tipo para 'lay' quando a
-- perna já tem 2+ entries (caminho inverso: perna composta BACK que tenta
-- virar LAY).
CREATE OR REPLACE FUNCTION public.enforce_lay_leg_tipo_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  IF NEW.tipo IS DISTINCT FROM 'lay' THEN
    RETURN NEW;
  END IF;

  IF OLD.tipo IS NOT DISTINCT FROM 'lay' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.apostas_perna_entradas
  WHERE perna_id = NEW.id;

  IF v_count > 1 THEN
    RAISE EXCEPTION 'LAY_LEG_MULTI_ENTRY_NOT_SUPPORTED: perna % não pode ser marcada como LAY enquanto tiver % sub-entradas. Remova as entradas extras antes.', NEW.id, v_count
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_lay_leg_tipo_change ON public.apostas_pernas;
CREATE TRIGGER trg_enforce_lay_leg_tipo_change
  BEFORE UPDATE OF tipo ON public.apostas_pernas
  FOR EACH ROW EXECUTE FUNCTION public.enforce_lay_leg_tipo_change();

COMMENT ON FUNCTION public.enforce_lay_leg_single_entry IS
  'Bloqueia INSERT/UPDATE em apostas_perna_entradas que faria uma perna LAY ter >1 entry. Regra de produto: LAY não suporta composição multi-casa (lógica de liability incompatível com soma de stake / odd média ponderada).';

COMMENT ON FUNCTION public.enforce_lay_leg_tipo_change IS
  'Bloqueia transição de apostas_pernas.tipo para LAY quando a perna já tem >1 entry. Espelha enforce_lay_leg_single_entry pelo caminho inverso (BACK composto -> LAY).';