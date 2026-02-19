import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import type { Solicitacao, SolicitacaoStatus } from '@/types/solicitacoes';

const QUERY_KEY = 'solicitacoes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const solicitacoesTable = () => (supabase as any).from('solicitacoes');

// ---- Fetch ----
export function useSolicitacoes(filtros?: {
  status?: SolicitacaoStatus[];
  tipo?: string[];
  executor_id?: string;
  requerente_id?: string;
}) {
  const { user, workspaceId } = useAuth();

  return useQuery({
    queryKey: [QUERY_KEY, workspaceId, filtros],
    enabled: !!user && !!workspaceId,
    queryFn: async () => {
      let query = solicitacoesTable()
        .select(`
          *,
          requerente:profiles!solicitacoes_requerente_id_fkey(id, full_name),
          executor:profiles!solicitacoes_executor_id_fkey(id, full_name),
          bookmaker:bookmakers(id, nome),
          projeto:projetos(id, nome),
          parceiro:parceiros(id, nome)
        `)
        .eq('workspace_id', workspaceId!)
        .order('created_at', { ascending: false });

      if (filtros?.status?.length) query = query.in('status', filtros.status);
      if (filtros?.tipo?.length) query = query.in('tipo', filtros.tipo);
      if (filtros?.executor_id) query = query.eq('executor_id', filtros.executor_id);
      if (filtros?.requerente_id) query = query.eq('requerente_id', filtros.requerente_id);

      const { data, error } = await query;
      console.log('[useSolicitacoes] resultado:', { data, error, workspaceId, filtros });
      if (error) {
        console.error('[useSolicitacoes] ERRO:', error);
        throw error;
      }
      return (data ?? []) as Solicitacao[];
    },
  });
}

export function useSolicitacoesKpis() {
  const { user, workspaceId } = useAuth();

  return useQuery({
    queryKey: [QUERY_KEY, 'kpis', workspaceId],
    enabled: !!user && !!workspaceId,
    queryFn: async () => {
      const { data, error } = await solicitacoesTable()
        .select('status, prazo')
        .eq('workspace_id', workspaceId!)
        .in('status', ['pendente', 'em_execucao']);

      if (error) throw error;
      const rows = (data ?? []) as { status: string; prazo?: string | null }[];
      const now = new Date();

      return {
        pendentes: rows.filter((r) => r.status === 'pendente').length,
        em_execucao: rows.filter((r) => r.status === 'em_execucao').length,
        urgentes: rows.filter((r) => r.prazo && new Date(r.prazo) < now).length,
        total_abertas: rows.length,
      };
    },
  });
}

// ---- Mutations ----
export function useCriarSolicitacao() {
  const queryClient = useQueryClient();
  const { user, workspaceId } = useAuth();

  return useMutation({
    mutationFn: async (payload: {
      titulo: string;
      descricao: string;
      tipo: string;
      prazo?: string;
      executor_id: string;
      bookmaker_id?: string;
      bookmaker_ids?: string[];
      projeto_id?: string;
      parceiro_id?: string;
      contexto_metadata?: Record<string, unknown>;
    }) => {
      if (!user || !workspaceId) throw new Error('Não autenticado');

      const { data, error } = await solicitacoesTable()
        .insert({
          workspace_id: workspaceId,
          requerente_id: user.id,
          titulo: payload.titulo,
          descricao: payload.descricao,
          tipo: payload.tipo,
          prazo: payload.prazo ?? null,
          executor_id: payload.executor_id,
          bookmaker_id: payload.bookmaker_id ?? null,
          bookmaker_ids: payload.bookmaker_ids?.length ? payload.bookmaker_ids : null,
          projeto_id: payload.projeto_id ?? null,
          parceiro_id: payload.parceiro_id ?? null,
          contexto_metadata: payload.contexto_metadata ?? null,
          status: 'pendente',
        })
        .select()
        .single();

      if (error) throw error;
      return data as Solicitacao;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Solicitação criada com sucesso!');
    },
    onError: (err) => {
      console.error(err);
      toast.error('Erro ao criar solicitação');
    },
  });
}

export function useAtualizarStatusSolicitacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      recusa_motivo,
    }: {
      id: string;
      status: SolicitacaoStatus;
      recusa_motivo?: string;
    }) => {
      const updates: Record<string, unknown> = { status };
      if (status === 'concluida') updates.concluida_at = new Date().toISOString();
      if (status === 'recusada') {
        updates.recusada_at = new Date().toISOString();
        if (recusa_motivo) updates.recusa_motivo = recusa_motivo;
      }

      const { error } = await solicitacoesTable()
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Status atualizado!');
    },
    onError: () => toast.error('Erro ao atualizar status'),
  });
}

// ---- Editar descrição (apenas requerente) ----
export function useEditarDescricaoSolicitacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, descricao }: { id: string; descricao: string }) => {
      const { error } = await solicitacoesTable()
        .update({ descricao, descricao_editada_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Descrição atualizada!');
    },
    onError: () => toast.error('Erro ao editar descrição'),
  });
}

// ---- Editar solicitação completa (apenas requerente) ----
export function useEditarSolicitacao() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      descricao,
      tipo,
      prazo,
      executor_id,
      bookmaker_ids,
      bookmaker_nomes,
      bookmaker_ids_originais,
      contexto_metadata,
    }: {
      id: string;
      descricao: string;
      tipo: string;
      prazo?: string | null;
      executor_id: string;
      bookmaker_ids?: string[];
      bookmaker_nomes?: string;
      bookmaker_ids_originais?: string[];
      contexto_metadata?: Record<string, unknown> | null;
    }) => {
      // Calcula as casas novas (adicionadas nesta edição)
      const novas = bookmaker_ids?.filter(
        (id) => !(bookmaker_ids_originais ?? []).includes(id),
      ) ?? [];

      const meta: Record<string, unknown> = {
        ...(contexto_metadata ?? {}),
      };
      if (bookmaker_ids?.length) {
        meta['bookmaker_ids'] = bookmaker_ids;
        meta['bookmaker_nomes'] = bookmaker_nomes ?? '';
      }
      if (novas.length) {
        meta['bookmaker_ids_novos'] = novas;
      } else {
        delete meta['bookmaker_ids_novos'];
      }

      const { error } = await solicitacoesTable()
        .update({
          descricao,
          tipo,
          prazo: prazo ?? null,
          executor_id,
          contexto_metadata: meta,
          descricao_editada_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Solicitação atualizada!');
    },
    onError: () => toast.error('Erro ao editar solicitação'),
  });
}

// ---- Excluir (apenas admin/owner) ----
export function useExcluirSolicitacao() {
  const queryClient = useQueryClient();
  const { workspaceId } = useAuth();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await solicitacoesTable()
        .delete()
        .eq('id', id)
        .eq('workspace_id', workspaceId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
      toast.success('Solicitação excluída');
    },
    onError: () => toast.error('Erro ao excluir solicitação'),
  });
}
