import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface WorkspaceBookmakerOption {
  id: string;
  nome: string;
  status: string;
  instance_identifier?: string | null;
}

async function fetchWorkspaceBookmakers(workspaceId: string): Promise<WorkspaceBookmakerOption[]> {
  const { data, error } = await (supabase as any)
    .from('bookmakers')
    .select('id, nome, status, instance_identifier')
    .eq('workspace_id', workspaceId)
    .eq('status', 'ativo')
    .order('nome');

  if (error) throw error;
  return data ?? [];
}

export function useWorkspaceBookmakers() {
  const { workspaceId } = useAuth();

  return useQuery({
    queryKey: ['workspace-bookmakers-list', workspaceId],
    queryFn: () => fetchWorkspaceBookmakers(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
}
