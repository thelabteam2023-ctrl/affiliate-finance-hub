
CREATE TABLE public.supplier_titular_bancos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titular_id UUID NOT NULL REFERENCES public.supplier_titulares(id) ON DELETE CASCADE,
  supplier_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  banco_nome TEXT NOT NULL,
  agencia TEXT,
  conta TEXT,
  tipo_conta TEXT NOT NULL DEFAULT 'corrente',
  pix_key TEXT,
  pix_tipo TEXT,
  titular_conta TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supplier_titular_bancos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supplier_titular_bancos_select" ON public.supplier_titular_bancos
  FOR SELECT USING (true);

CREATE POLICY "supplier_titular_bancos_insert" ON public.supplier_titular_bancos
  FOR INSERT WITH CHECK (true);

CREATE POLICY "supplier_titular_bancos_update" ON public.supplier_titular_bancos
  FOR UPDATE USING (true);
