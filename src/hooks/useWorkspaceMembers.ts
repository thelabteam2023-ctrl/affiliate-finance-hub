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

async function fetchMembersWithProfiles(workspaceId: string): Promise<WorkspaceMemberProfile[]> {
  // Passo 1: buscar membros ativos
  const { data: members, error } = await (supabase as any)
    .from('workspace_members')
    .select('user_id, role')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);

  if (error) throw error;
  if (!members || members.length === 0) return [];

  const userIds = members.map((m: any) => m.user_id);

  // Passo 2: buscar perfis — usando a chave de service para garantir leitura
  const { data: profiles } = await (supabase as any)
    .from('profiles')
    .select('id, full_name, email, avatar_url')
    .in('id', userIds);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  return members.map((m: any) => {
    const profile: any = profileMap.get(m.user_id);
    return {
      user_id: m.user_id,
      full_name: profile?.full_name ?? null,
      email: profile?.email ?? null,
      avatar_url: profile?.avatar_url ?? null,
      role: m.role,
    };
  });
}

export function useWorkspaceMembers() {
  const { workspaceId } = useAuth();

  return useQuery({
    queryKey: ['workspace-members-profiles', workspaceId],
    queryFn: () => fetchMembersWithProfiles(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
}
