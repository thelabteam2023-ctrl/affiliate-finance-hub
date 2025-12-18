import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface CommunityAccess {
  hasProAccess: boolean;
  loading: boolean;
  plan: string | null;
  canEvaluate: boolean;
  canCreateTopics: boolean;
  canComment: boolean;
  canViewContent: boolean; // Free/Starter can see structure but not full content
}

export function useCommunityAccess(): CommunityAccess {
  const { user } = useAuth();
  const [hasProAccess, setHasProAccess] = useState(false);
  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState<string | null>(null);

  const checkAccess = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      // Get user's workspace
      const { data: memberData, error: memberError } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single();

      if (memberError || !memberData) {
        setHasProAccess(false);
        setLoading(false);
        return;
      }

      // Get workspace plan
      const { data: workspaceData, error: workspaceError } = await supabase
        .from('workspaces')
        .select('plan')
        .eq('id', memberData.workspace_id)
        .single();

      if (workspaceError || !workspaceData) {
        setHasProAccess(false);
        setLoading(false);
        return;
      }

      const userPlan = workspaceData.plan;
      setPlan(userPlan);
      setHasProAccess(userPlan === 'pro' || userPlan === 'advanced');
    } catch (error) {
      console.error('Error checking community access:', error);
      setHasProAccess(false);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    checkAccess();
  }, [checkAccess]);

  return {
    hasProAccess,
    loading,
    plan,
    canEvaluate: hasProAccess,
    canCreateTopics: hasProAccess,
    canComment: hasProAccess,
    canViewContent: true, // All can view, but Free/Starter see limited content
  };
}
