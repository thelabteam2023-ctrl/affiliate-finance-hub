-- 1. Vincular supplier_profiles à tabela mestre fornecedores
ALTER TABLE public.supplier_profiles
  ADD COLUMN fornecedor_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL;

-- Índice para buscas rápidas por fornecedor
CREATE INDEX idx_supplier_profiles_fornecedor_id ON public.supplier_profiles(fornecedor_id);

-- Garantir que cada fornecedor tenha no máximo um perfil de portal
CREATE UNIQUE INDEX uq_supplier_profiles_fornecedor ON public.supplier_profiles(fornecedor_id) WHERE fornecedor_id IS NOT NULL;

-- 2. Evitar CPFs duplicados dentro do mesmo workspace de fornecedor
CREATE UNIQUE INDEX uq_supplier_titulares_doc_per_workspace 
  ON public.supplier_titulares(supplier_workspace_id, documento) 
  WHERE documento IS NOT NULL;

-- 3. Adicionar referência opcional a supplier_titulares na tabela parceiros
-- Permite que o financeiro rastreie qual titular do portal corresponde a este parceiro
ALTER TABLE public.parceiros
  ADD COLUMN supplier_titular_id uuid REFERENCES public.supplier_titulares(id) ON DELETE SET NULL;

CREATE INDEX idx_parceiros_supplier_titular_id ON public.parceiros(supplier_titular_id);

-- 4. Adicionar referência opcional ao fornecedor mestre na tabela parceiros
-- Para rastreabilidade direta: parceiro → fornecedor que o originou
ALTER TABLE public.parceiros
  ADD COLUMN fornecedor_origem_id uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL;

CREATE INDEX idx_parceiros_fornecedor_origem_id ON public.parceiros(fornecedor_origem_id);