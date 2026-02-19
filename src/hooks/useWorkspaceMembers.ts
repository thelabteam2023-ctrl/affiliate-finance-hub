import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface WorkspaceMemberProfile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
}

/**
 * Busca membros ativos do workspace com seus perfis via RPC segura (SECURITY DEFINER).
 *
 * Por que RPC e não query direta?
 * A RLS de workspace_members usa get_user_workspace() que retorna apenas o workspace
 * *default* do usuário — não o workspace ativo na sessão. Isso faz o JOIN com profiles
 * retornar vazio quando o usuário está em um workspace diferente do seu default.
 * A RPC get_workspace_members_with_profiles contorna isso de forma segura, validando
 * que o chamador é membro ativo do workspace solicitado.
 */
async function fetchMembersWithProfiles(workspaceId: string): Promise<WorkspaceMemberProfile[]> {
  const { data, error } = await supabase.rpc(
    'get_workspace_members_with_profiles' as any,
    { _workspace_id: workspaceId }
  );

  if (error) {
    console.error('[useWorkspaceMembers] RPC error:', error);
    throw error;
  }

  return (data ?? []) as WorkspaceMemberProfile[];
}

export function useWorkspaceMembers() {
  const { workspaceId } = useAuth();

  return useQuery({
    queryKey: ['workspace-members-profiles', workspaceId],
    queryFn: () => fetchMembersWithProfiles(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 10 * 60 * 1000,
  });
}
