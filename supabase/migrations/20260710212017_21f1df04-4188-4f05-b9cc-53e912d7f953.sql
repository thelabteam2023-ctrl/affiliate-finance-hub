
-- Famílias de casas (grupos globais de bookmakers clones/mesmo provedor de odds)
CREATE TABLE public.bookmaker_familias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL UNIQUE,
  descricao text,
  cor text NOT NULL DEFAULT '#6366f1',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.bookmaker_familias TO authenticated;
GRANT ALL ON public.bookmaker_familias TO service_role;

ALTER TABLE public.bookmaker_familias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Familias visiveis para authenticated"
  ON public.bookmaker_familias FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Familias editaveis por system owner"
  ON public.bookmaker_familias FOR ALL
  TO authenticated
  USING (public.is_system_owner(auth.uid()))
  WITH CHECK (public.is_system_owner(auth.uid()));

-- Membros: 1 bookmaker <-> no máximo 1 família (UNIQUE em bookmaker_catalogo_id)
CREATE TABLE public.bookmaker_familia_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id uuid NOT NULL REFERENCES public.bookmaker_familias(id) ON DELETE CASCADE,
  bookmaker_catalogo_id uuid NOT NULL UNIQUE REFERENCES public.bookmakers_catalogo(id) ON DELETE CASCADE,
  is_referencia boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX idx_bookmaker_familia_membros_familia ON public.bookmaker_familia_membros(familia_id);

GRANT SELECT ON public.bookmaker_familia_membros TO authenticated;
GRANT ALL ON public.bookmaker_familia_membros TO service_role;

ALTER TABLE public.bookmaker_familia_membros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros visiveis para authenticated"
  ON public.bookmaker_familia_membros FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Membros editaveis por system owner"
  ON public.bookmaker_familia_membros FOR ALL
  TO authenticated
  USING (public.is_system_owner(auth.uid()))
  WITH CHECK (public.is_system_owner(auth.uid()));

-- Trigger: garantir apenas UMA referência por família
CREATE OR REPLACE FUNCTION public.enforce_single_familia_referencia()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_referencia = true THEN
    UPDATE public.bookmaker_familia_membros
      SET is_referencia = false
      WHERE familia_id = NEW.familia_id
        AND id <> NEW.id
        AND is_referencia = true;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_single_familia_referencia
  AFTER INSERT OR UPDATE OF is_referencia ON public.bookmaker_familia_membros
  FOR EACH ROW
  WHEN (NEW.is_referencia = true)
  EXECUTE FUNCTION public.enforce_single_familia_referencia();

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_familias_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_bookmaker_familias_updated_at
  BEFORE UPDATE ON public.bookmaker_familias
  FOR EACH ROW EXECUTE FUNCTION public.tg_familias_updated_at();
