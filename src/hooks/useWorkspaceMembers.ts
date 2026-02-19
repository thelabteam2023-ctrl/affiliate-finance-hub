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
  // Busca membros ativos com perfis em uma única query (JOIN via select aninhado)
  const { data, error } = await (supabase as any)
    .from('workspace_members')
    .select('user_id, role, profiles:user_id(full_name, email, avatar_url)')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  return data.map((m: any) => ({
    user_id: m.user_id,
    full_name: m.profiles?.full_name ?? null,
    email: m.profiles?.email ?? null,
    avatar_url: m.profiles?.avatar_url ?? null,
    role: m.role,
  }));
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
