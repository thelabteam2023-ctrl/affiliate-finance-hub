import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface WorkspaceBookmakerOption {
  id: string;
  nome: string;
  logo_url: string | null;
  status: string | null;
}

/**
 * Busca bookmakers do CATÁLOGO acessíveis ao workspace atual.
 * Fonte: bookmakers_catalogo (via RLS que considera bookmaker_workspace_access).
 * Isso retorna as mesmas casas exibidas na aba "Bookmakers" da gestão.
 */
async function fetchWorkspaceBookmakers(workspaceId: string): Promise<WorkspaceBookmakerOption[]> {
  // A RLS de bookmakers_catalogo já filtra por workspace via bookmaker_workspace_access
  // para as GLOBAL_RESTRICTED, e retorna as globais para todos.
  // O mesmo resultado que aparece na aba "Bookmakers" da gestão.
  const { data, error } = await (supabase as any)
    .from('bookmakers_catalogo')
    .select('id, nome, logo_url, status')
    .order('nome', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((item: any) => ({
    id: item.id,
    nome: item.nome,
    logo_url: item.logo_url ?? null,
    status: item.status ?? null,
  }));
}

export function useWorkspaceBookmakers() {
  const { workspaceId } = useAuth();

  return useQuery({
    queryKey: ['workspace-bookmakers-catalog', workspaceId],
    queryFn: () => fetchWorkspaceBookmakers(workspaceId!),
    enabled: !!workspaceId,
    staleTime: 5 * 60 * 1000,
  });
}
