
-- Supplier operational tasks table
CREATE TABLE public.supplier_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  supplier_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  parent_workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  
  -- Task details
  tipo TEXT NOT NULL DEFAULT 'deposito',
  titulo TEXT NOT NULL,
  descricao TEXT,
  valor NUMERIC,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  prioridade TEXT NOT NULL DEFAULT 'media',
  data_limite TIMESTAMPTZ,
  
  -- Linked entities
  bookmaker_catalogo_id UUID REFERENCES public.bookmakers_catalogo(id),
  bookmaker_account_id UUID,
  titular_id UUID,
  
  -- Status flow
  status TEXT NOT NULL DEFAULT 'pendente',
  
  -- Evidence / completion
  comprovante_url TEXT,
  observacoes_fornecedor TEXT,
  observacoes_admin TEXT,
  
  -- Allocation context
  valor_atual_casa NUMERIC,
  valor_alvo_casa NUMERIC,
  
  -- Metadata
  created_by UUID NOT NULL,
  concluida_at TIMESTAMPTZ,
  recusada_at TIMESTAMPTZ,
  recusa_motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast workspace lookups
CREATE INDEX idx_supplier_tasks_workspace ON public.supplier_tasks(supplier_workspace_id, status);
CREATE INDEX idx_supplier_tasks_parent ON public.supplier_tasks(parent_workspace_id, status);

-- RLS
ALTER TABLE public.supplier_tasks ENABLE ROW LEVEL SECURITY;

-- Admin can manage tasks for their supplier workspaces
CREATE POLICY "admin_manage_supplier_tasks" ON public.supplier_tasks
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = supplier_tasks.parent_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin', 'finance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspace_members wm
      WHERE wm.workspace_id = supplier_tasks.parent_workspace_id
      AND wm.user_id = auth.uid()
      AND wm.role IN ('owner', 'admin', 'finance')
    )
  );

-- Enable storage for task evidence
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-evidence', 'supplier-evidence', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "supplier_evidence_insert" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'supplier-evidence');

CREATE POLICY "supplier_evidence_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'supplier-evidence');
