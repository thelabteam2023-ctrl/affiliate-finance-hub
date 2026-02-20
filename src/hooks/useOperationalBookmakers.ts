import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface OperationalBookmakerOption {
  id: string;
  nome: string;
  logo_url: string | null;
  moeda: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  projeto_id: string | null;
  projeto_nome: string | null;
}

/**
 * Busca INSTÂNCIAS operacionais de bookmakers do workspace (tabela `bookmakers`),
 * enriquecidas com parceiro e projeto.
 * Usado para selecionar "qual conta" está exigindo KYC.
 */
export function useOperationalBookmakers() {
  const { workspaceId } = useAuth();

  return useQuery({
    queryKey: ['operational-bookmakers', workspaceId],
    queryFn: async (): Promise<OperationalBookmakerOption[]> => {
      const { data, error } = await supabase
        .from('bookmakers')
        .select(`
          id,
          nome,
          moeda,
          parceiro_id,
          projeto_id,
          bookmakers_catalogo:bookmaker_catalogo_id (logo_url),
          parceiro:parceiros!bookmakers_parceiro_id_fkey (id, nome),
          projeto:projetos!bookmakers_projeto_id_fkey (id, nome)
        `)
        .eq('workspace_id', workspaceId!)
        .order('nome');

      if (error) throw error;

      return (data ?? []).map((b: any) => ({
        id: b.id,
        nome: b.nome,
        logo_url: b.bookmakers_catalogo?.logo_url ?? null,
        moeda: b.moeda ?? 'BRL',
        parceiro_id: b.parceiro_id ?? null,
        parceiro_nome: b.parceiro?.nome ?? null,
        projeto_id: b.projeto_id ?? null,
        projeto_nome: b.projeto?.nome ?? null,
      }));
    },
    enabled: !!workspaceId,
    staleTime: 2 * 60 * 1000,
  });
}
