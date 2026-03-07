
-- 1. Add flag column
ALTER TABLE public.parceiros ADD COLUMN is_caixa_operacional boolean NOT NULL DEFAULT false;

-- 2. Unique constraint: one caixa per workspace
CREATE UNIQUE INDEX idx_parceiros_caixa_operacional_unique
ON public.parceiros (workspace_id)
WHERE is_caixa_operacional = true;

-- 3. Seed for existing workspaces
INSERT INTO public.parceiros (user_id, nome, cpf, status, workspace_id, is_caixa_operacional, observacoes)
SELECT 
  wm.user_id,
  'Caixa Operacional',
  'CAIXA-' || LEFT(w.id::text, 8),
  'ativo',
  w.id,
  true,
  'Parceiro virtual representando as finanças próprias da empresa. NÃO EXCLUIR.'
FROM public.workspaces w
JOIN public.workspace_members wm ON wm.workspace_id = w.id AND wm.role = 'owner'
WHERE NOT EXISTS (
  SELECT 1 FROM public.parceiros p 
  WHERE p.workspace_id = w.id AND p.is_caixa_operacional = true
);

-- 4. Auto-create function
CREATE OR REPLACE FUNCTION public.auto_create_caixa_operacional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.parceiros (user_id, nome, cpf, status, workspace_id, is_caixa_operacional, observacoes)
  VALUES (
    NEW.user_id,
    'Caixa Operacional',
    'CAIXA-' || LEFT(NEW.workspace_id::text, 8),
    'ativo',
    NEW.workspace_id,
    true,
    'Parceiro virtual representando as finanças próprias da empresa. NÃO EXCLUIR.'
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- 5. Trigger
DROP TRIGGER IF EXISTS tr_auto_create_caixa_operacional ON public.workspace_members;
CREATE TRIGGER tr_auto_create_caixa_operacional
  AFTER INSERT ON public.workspace_members
  FOR EACH ROW
  WHEN (NEW.role = 'owner')
  EXECUTE FUNCTION public.auto_create_caixa_operacional();

-- 6. Protection
CREATE OR REPLACE FUNCTION public.protect_caixa_operacional()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.is_caixa_operacional = true THEN
    RAISE EXCEPTION 'Não é permitido excluir o parceiro Caixa Operacional';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_protect_caixa_operacional ON public.parceiros;
CREATE TRIGGER tr_protect_caixa_operacional
  BEFORE DELETE ON public.parceiros
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_caixa_operacional();
