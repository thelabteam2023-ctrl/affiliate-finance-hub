import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface CommunityAccess {
  hasFullAccess: boolean; // PRO+ ou OWNER
  loading: boolean;
  plan: string | null;
  role: string | null;
  isOwner: boolean;
  isAdmin: boolean; // OWNER, MASTER ou ADMIN
  canEvaluate: boolean;
  canCreateTopics: boolean;
  canComment: boolean;
  canViewContent: boolean;
  canEditAny: boolean; // Pode editar qualquer mensagem (admin)
}

export function useCommunityAccess(): CommunityAccess {
  const { user } = useAuth();
  const [hasFullAccess, setHasFullAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const checkAccess = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // Get user's workspace membership (includes role)
      const { data: memberData, error: memberError } = await supabase
        .from('workspace_members')
        .select('workspace_id, role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (memberError || !memberData) {
        setHasFullAccess(false);
        setLoading(false);
        return;
      }

      const userRole = memberData.role;
      setRole(userRole);

      // Check if user is admin (can edit any message)
      const isAdminRole = userRole === 'owner' || userRole === 'master' || userRole === 'admin';
      setIsAdmin(isAdminRole);

      // REGRA FUNDAMENTAL: OWNER tem acesso total, independente do plano
      if (userRole === 'owner' || userRole === 'master') {
        setIsOwner(true);
        setHasFullAccess(true);
        
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

      // Para não-owners, verificar o plano
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .select('plan')
        .eq('id', memberData.workspace_id)
        .single();

      if (workspaceError || !workspaceData) {
        setHasFullAccess(false);
        setLoading(false);
        return;
      }

      const userPlan = workspaceData.plan;
      setPlan(userPlan);
      
      // PRO e Advanced têm acesso completo
      const hasPlanAccess = userPlan === 'pro' || userPlan === 'advanced';
      setHasFullAccess(hasPlanAccess);
      
    } catch (error) {
      console.error('Error checking community access:', error);
      setHasFullAccess(false);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  return {
    hasFullAccess,
    loading,
    plan,
    role,
    isOwner,
    isAdmin,
    canEvaluate: hasFullAccess,
    canCreateTopics: hasFullAccess,
    canComment: hasFullAccess,
    canViewContent: true, // Todos podem ver estrutura
    canEditAny: isAdmin, // Owner/Master/Admin podem editar qualquer mensagem
  };
}
