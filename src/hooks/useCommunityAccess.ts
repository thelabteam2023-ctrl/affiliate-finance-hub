import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface CommunityAccess {
  hasFullAccess: boolean; // PRO+ ou OWNER - pode VER conteúdo completo
  canWrite: boolean; // Pode criar/editar (não é Viewer)
  loading: boolean;
  plan: string | null;
  role: string | null;
  isOwner: boolean;
  isAdmin: boolean; // OWNER ou ADMIN do workspace
  isViewer: boolean; // É role Viewer (read-only)
  canModerate: boolean; // Pode moderar conteúdo (delete, clear)
  canEvaluate: boolean;
  canCreateTopics: boolean;
  canComment: boolean;
  canViewContent: boolean;
  canEditAny: boolean; // Pode editar qualquer mensagem (admin)
  canSendChat: boolean; // Pode enviar mensagens no chat
}

export function useCommunityAccess(): CommunityAccess {
  const { user, isSystemOwner } = useAuth();
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isViewer, setIsViewer] = useState(false);

  const checkAccess = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // System Owner tem acesso total
      if (isSystemOwner) {
        setIsOwner(true);
        setIsAdmin(true);
        setIsViewer(false);
        setHasFullAccess(true);
        setCanWrite(true);
        setLoading(false);
        return;
      }

      // Get user's workspace membership (includes role)
      const { data: memberData, error: memberError } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (memberError || !memberData) {
        setHasFullAccess(false);
        setCanWrite(false);
        setLoading(false);
        return;
      }

      const userRole = memberData.role;
      setRole(userRole);

      // Check if user is viewer (read-only)
      const isViewerRole = userRole === 'viewer';
      setIsViewer(isViewerRole);

      // Check if user is admin (can edit any message)
      const isAdminRole = userRole === 'owner' || userRole === 'admin';
      setIsAdmin(isAdminRole);

      // REGRA FUNDAMENTAL: OWNER do workspace tem acesso total
      if (userRole === 'owner') {
        setIsOwner(true);
        setHasFullAccess(true);
        setCanWrite(true);
        
        // Buscar plano apenas para referência, não para bloqueio
        const { data: workspaceData } = await supabase
          .from('workspaces')
          .select('plan')
          .eq('id', memberData.workspace_id)
          .single();
        
        setPlan(workspaceData?.plan || null);
        setLoading(false);
        return;
      }

      // Buscar plano do workspace
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .select('plan')
        .eq('id', memberData.workspace_id)
        .single();

      if (workspaceError || !workspaceData) {
        setHasFullAccess(false);
        setCanWrite(false);
        setLoading(false);
        return;
      }

      const userPlan = workspaceData.plan;
      setPlan(userPlan);
      
      // PRO e Advanced têm acesso completo para VISUALIZAÇÃO
      const hasPlanAccess = userPlan === 'pro' || userPlan === 'advanced';
      setHasFullAccess(hasPlanAccess);
      
      // REGRA CRÍTICA: Viewer NUNCA pode escrever, independente do plano
      // Apenas non-viewers com plano PRO+ podem escrever
      const canUserWrite = hasPlanAccess && !isViewerRole;
      setCanWrite(canUserWrite);
      
    } catch (error) {
      console.error('Error checking community access:', error);
      setHasFullAccess(false);
      setCanWrite(false);
    } finally {
      setLoading(false);
    }
  }, [user?.id, isSystemOwner]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  return {
    hasFullAccess,
    canWrite,
    loading,
    plan,
    role,
    isOwner,
    isAdmin,
    isViewer,
    canModerate: isOwner || isAdmin, // Pode moderar conteúdo da comunidade
    canEvaluate: canWrite, // Viewer não pode avaliar
    canCreateTopics: canWrite, // Viewer não pode criar tópicos
    canComment: canWrite, // Viewer não pode comentar
    canViewContent: true, // Todos podem ver estrutura
    canEditAny: isAdmin, // Owner/Admin podem editar qualquer mensagem
    canSendChat: canWrite, // Viewer não pode enviar mensagens
  };
}
