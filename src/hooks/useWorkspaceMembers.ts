/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface WorkspaceMemberProfile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
}

export function useWorkspaceMembers() {
  const { workspaceId } = useAuth();

  return useQuery({
    queryKey: ['workspace-members-profiles', workspaceId],
    queryFn: async (): Promise<WorkspaceMemberProfile[]> => {
      // Buscar membros ativos do workspace
      const { data: members, error } = await supabase
        .from('workspace_members')
        .select('user_id, role')
        .eq('workspace_id', workspaceId!)
        .eq('is_active', true);

      if (error) throw error;
      if (!members || members.length === 0) return [];

      const userIds = members.map((m: any) => m.user_id);

      // Buscar perfis
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(
        (profiles || []).map((p: any) => [p.id, p])
      );

      return members.map((m: any) => {
        const profile = profileMap.get(m.user_id) as any;
        return {
          user_id: m.user_id,
          full_name: profile?.full_name || null,
          email: profile?.email || null,
          avatar_url: profile?.avatar_url || null,
          role: m.role,
        };
      });
    },
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000, // 5 min
  });
}
