-- Habilitar RLS na tabela de operadores legados
ALTER TABLE public.operadores_legado_pendente ENABLE ROW LEVEL SECURITY;

-- Políticas para operadores_legado_pendente
CREATE POLICY "Owner/Admin view legacy operators"
ON public.operadores_legado_pendente
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.operadores o
    WHERE o.id = operadores_legado_pendente.operador_id
    AND o.workspace_id = public.get_user_workspace(auth.uid())
  )
);

CREATE POLICY "Owner/Admin manage legacy operators"
ON public.operadores_legado_pendente
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.operadores o
    WHERE o.id = operadores_legado_pendente.operador_id
    AND o.workspace_id = public.get_user_workspace(auth.uid())
    AND public.is_owner_or_admin(auth.uid(), o.workspace_id)
  )
);

-- Atualizar view para usar SECURITY INVOKER (corrigir warning)
DROP VIEW IF EXISTS public.v_operadores_workspace;

CREATE VIEW public.v_operadores_workspace
WITH (security_invoker = true)
AS
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
  -- Buscar operador vinculado se existir
  o.id as operador_id,
  -- Estatísticas via operador legado
  (SELECT COUNT(*) FROM public.operador_projetos op 
   WHERE op.operador_id = o.id AND op.status = 'ATIVO') as projetos_ativos,
  (SELECT COALESCE(SUM(po.valor), 0) FROM public.pagamentos_operador po
   WHERE po.operador_id = o.id AND po.status = 'CONFIRMADO') as total_pago,
  (SELECT COALESCE(SUM(po.valor), 0) FROM public.pagamentos_operador po
   WHERE po.operador_id = o.id AND po.status = 'PENDENTE') as total_pendente
FROM public.workspace_members wm
JOIN public.profiles p ON wm.user_id = p.id
LEFT JOIN public.operadores o ON o.auth_user_id = wm.user_id AND o.workspace_id = wm.workspace_id
WHERE wm.role = 'operator' AND wm.is_active = true;