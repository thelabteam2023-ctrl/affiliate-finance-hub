-- =====================================================
-- CORREÇÃO CRÍTICA DE SEGURANÇA: Gerenciar Acesso de Bookmakers
-- Apenas System Owner pode alterar visibility e workspace access
-- =====================================================

-- 1. Remover policies antigas que permitem owner/admin gerenciar acesso
DROP POLICY IF EXISTS "System admin manage access" ON bookmaker_workspace_access;
DROP POLICY IF EXISTS "bookmaker_workspace_access_all" ON bookmaker_workspace_access;

-- 2. Criar nova policy: APENAS System Owner pode inserir/atualizar/deletar bookmaker_workspace_access
CREATE POLICY "System owner manage bookmaker access"
ON bookmaker_workspace_access
FOR ALL
USING (is_system_owner(auth.uid()))
WITH CHECK (is_system_owner(auth.uid()));

-- 3. Manter policy de SELECT para workspaces verem seus próprios acessos
-- (já existe: "View bookmaker access" e "bookmaker_workspace_access_select")

-- 4. Criar policy específica para UPDATE de visibility em bookmakers_catalogo
-- Apenas System Owner pode alterar visibility de qualquer bookmaker
-- (A policy existente já permite update para System Owner, mas vamos garantir)

-- Primeiro, criar função que verifica se está tentando mudar apenas o visibility
CREATE OR REPLACE FUNCTION check_visibility_update_allowed()
RETURNS TRIGGER AS $$
BEGIN
  -- Se não é system owner e está tentando mudar visibility
  IF NOT is_system_owner(auth.uid()) AND (
    OLD.visibility IS DISTINCT FROM NEW.visibility
  ) THEN
    RAISE EXCEPTION 'Apenas System Owner pode alterar a visibilidade de bookmakers';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para validar mudanças de visibility
DROP TRIGGER IF EXISTS validate_visibility_update ON bookmakers_catalogo;
CREATE TRIGGER validate_visibility_update
  BEFORE UPDATE ON bookmakers_catalogo
  FOR EACH ROW
  EXECUTE FUNCTION check_visibility_update_allowed();

-- 5. Garantir que workspaces só pode ver seus acessos (corrigir policy de SELECT)
DROP POLICY IF EXISTS "View bookmaker access" ON bookmaker_workspace_access;
DROP POLICY IF EXISTS "bookmaker_workspace_access_select" ON bookmaker_workspace_access;

CREATE POLICY "View own workspace bookmaker access"
ON bookmaker_workspace_access
FOR SELECT
USING (
  is_system_owner(auth.uid()) OR 
  workspace_id = get_user_workspace(auth.uid())
);

-- 6. Log de auditoria para mudanças de visibility
CREATE OR REPLACE FUNCTION log_visibility_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.visibility IS DISTINCT FROM NEW.visibility THEN
    INSERT INTO audit_logs (
      workspace_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      entity_name,
      before_data,
      after_data,
      metadata
    ) VALUES (
      NULL, -- Operação global do sistema
      auth.uid(),
      'UPDATE',
      'bookmaker_visibility',
      NEW.id,
      NEW.nome,
      jsonb_build_object('visibility', OLD.visibility),
      jsonb_build_object('visibility', NEW.visibility),
      jsonb_build_object(
        'action', 'visibility_change',
        'from', OLD.visibility,
        'to', NEW.visibility
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Criar trigger para log de auditoria
DROP TRIGGER IF EXISTS audit_visibility_change ON bookmakers_catalogo;
CREATE TRIGGER audit_visibility_change
  AFTER UPDATE ON bookmakers_catalogo
  FOR EACH ROW
  EXECUTE FUNCTION log_visibility_change();