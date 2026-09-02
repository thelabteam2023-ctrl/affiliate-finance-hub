ALTER TABLE public.bookmakers ADD COLUMN IF NOT EXISTS portability_ext_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_bookmakers_portability_identity
  ON public.bookmakers (workspace_id, parceiro_id, portability_ext_id)
  WHERE portability_ext_id IS NOT NULL;

COMMENT ON COLUMN public.bookmakers.portability_ext_id IS
  'Identidade estavel da relacao parceiro<->casa gravada pelo importador de portabilidade. Garante idempotencia de importacoes repetidas. NULL para casas criadas manualmente.';