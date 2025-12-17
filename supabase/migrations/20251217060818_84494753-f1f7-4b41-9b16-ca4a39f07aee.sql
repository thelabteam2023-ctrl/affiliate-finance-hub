-- Adicionar campos de operador ao perfil do usuário
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS telefone TEXT,
ADD COLUMN IF NOT EXISTS data_nascimento DATE,
ADD COLUMN IF NOT EXISTS tipo_contrato TEXT DEFAULT 'FREELANCER',
ADD COLUMN IF NOT EXISTS data_admissao DATE,
ADD COLUMN IF NOT EXISTS data_desligamento DATE,
ADD COLUMN IF NOT EXISTS observacoes_operador TEXT;

-- Índice único para CPF por workspace (via workspace_members)
CREATE INDEX IF NOT EXISTS idx_profiles_cpf ON public.profiles(cpf) WHERE cpf IS NOT NULL;

-- View para operadores (membros com role = 'operator')
CREATE OR REPLACE VIEW public.v_operadores_workspace AS
SELECT 
  wm.id as workspace_member_id,
  wm.workspace_id,
  wm.user_id,
  wm.role,
  wm.is_active,
  wm.joined_at,
  p.id as profile_id,
  p.email,
  p.full_name as nome,
  p.cpf,
  p.telefone,
  p.data_nascimento,
  p.tipo_contrato,
  p.data_admissao,
  p.data_desligamento,
  p.observacoes_operador as observacoes,
  -- Estatísticas de projetos
  (SELECT COUNT(*) FROM public.operador_projetos op 
   JOIN public.operadores o ON op.operador_id = o.id 
   WHERE o.auth_user_id = wm.user_id AND op.status = 'ATIVO') as projetos_ativos,
  -- Total pago (pagamentos confirmados)
  (SELECT COALESCE(SUM(po.valor), 0) FROM public.pagamentos_operador po
   JOIN public.operadores o ON po.operador_id = o.id
   WHERE o.auth_user_id = wm.user_id AND po.status = 'CONFIRMADO') as total_pago,
  -- Total pendente
  (SELECT COALESCE(SUM(po.valor), 0) FROM public.pagamentos_operador po
   JOIN public.operadores o ON po.operador_id = o.id
   WHERE o.auth_user_id = wm.user_id AND po.status = 'PENDENTE') as total_pendente
FROM public.workspace_members wm
JOIN public.profiles p ON wm.user_id = p.id
WHERE wm.role = 'operator' AND wm.is_active = true;

-- Tabela para rastrear operadores legados pendentes de migração
CREATE TABLE IF NOT EXISTS public.operadores_legado_pendente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operador_id UUID REFERENCES public.operadores(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'PENDENTE_CONVITE',
  created_at TIMESTAMPTZ DEFAULT now(),
  migrated_at TIMESTAMPTZ,
  migrated_to_user_id UUID REFERENCES auth.users(id)
);

-- Marcar operadores existentes sem auth_user_id como pendentes
INSERT INTO public.operadores_legado_pendente (operador_id, status)
SELECT id, 'PENDENTE_CONVITE'
FROM public.operadores
WHERE auth_user_id IS NULL
ON CONFLICT DO NOTHING;