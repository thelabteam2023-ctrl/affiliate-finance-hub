/* eslint-disable @typescript-eslint/no-explicit-any */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import type {
  Ocorrencia,
  OcorrenciaEvento,
  OcorrenciaObservador,
  OcorrenciaStatus,
  OcorrenciaPrioridade,
  OcorrenciaTipo,
  OcorrenciaAnexo,
} from '@/types/ocorrencias';

// Helper typed clients para as novas tabelas não geradas pelo auto-gen
const ocorrenciasTable = () => (supabase as any).from('ocorrencias');
const eventosTable = () => (supabase as any).from('ocorrencias_eventos');
const observadoresTable = () => (supabase as any).from('ocorrencias_observadores');

// ============================================================
// QUERY KEYS
// ============================================================
export const OCORRENCIAS_KEYS = {
  all: (workspaceId: string) => ['ocorrencias', workspaceId] as const,
  list: (workspaceId: string, filters?: Record<string, unknown>) =>
    ['ocorrencias', workspaceId, 'list', filters] as const,
  detail: (id: string) => ['ocorrencias', 'detail', id] as const,
  eventos: (ocorrenciaId: string) => ['ocorrencias', 'eventos', ocorrenciaId] as const,
  observadores: (ocorrenciaId: string) => ['ocorrencias', 'observadores', ocorrenciaId] as const,
  kpis: (workspaceId: string) => ['ocorrencias', workspaceId, 'kpis'] as const,
};

// ============================================================
// FETCH OCORRÊNCIAS
// ============================================================
async function fetchOcorrencias(
  workspaceId: string,
  filters?: {
    status?: OcorrenciaStatus[];
    tipo?: OcorrenciaTipo[];
    prioridade?: OcorrenciaPrioridade[];
    executorId?: string;
    requerenteId?: string;
    projetoId?: string;
  }
): Promise<Ocorrencia[]> {
  let query = ocorrenciasTable()
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (filters?.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }
  if (filters?.tipo && filters.tipo.length > 0) {
    query = query.in('tipo', filters.tipo);
  }
  if (filters?.prioridade && filters.prioridade.length > 0) {
    query = query.in('prioridade', filters.prioridade);
  }
  if (filters?.executorId) {
    query = query.eq('executor_id', filters.executorId);
  }
  if (filters?.requerenteId) {
    query = query.eq('requerente_id', filters.requerenteId);
  }
  if (filters?.projetoId) {
    query = query.eq('projeto_id', filters.projetoId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as Ocorrencia[];
}

// ============================================================
// HOOK: lista de ocorrências
// ============================================================
export function useOcorrencias(
  filters?: Parameters<typeof fetchOcorrencias>[1]
) {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: OCORRENCIAS_KEYS.list(workspaceId || '', filters as Record<string, unknown>),
    queryFn: () => fetchOcorrencias(workspaceId!, filters),
    enabled: !!workspaceId,
  });
}

// ============================================================
// HOOK: KPIs da visão geral
// ============================================================
export function useOcorrenciasKpis() {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: OCORRENCIAS_KEYS.kpis(workspaceId || ''),
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const { data, error } = await ocorrenciasTable()
        .select('id, status, prioridade, sla_violado, created_at')
        .eq('workspace_id', workspaceId!)
        .not('status', 'in', '(resolvido,cancelado)');

      if (error) throw error;
      const abertas: any[] = data || [];

      return {
        abertas_total: abertas.length,
        abertas_hoje: abertas.filter(
          (o) => new Date(o.created_at) >= today
        ).length,
        urgentes: abertas.filter((o) => o.prioridade === 'urgente').length,
        aguardando_terceiro: abertas.filter(
          (o) => o.status === 'aguardando_terceiro'
        ).length,
        atrasadas_sla: abertas.filter((o) => o.sla_violado).length,
      };
    },
    enabled: !!workspaceId,
  });
}

// ============================================================
// HOOK: detalhe de uma ocorrência
// ============================================================
export function useOcorrencia(id: string) {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: OCORRENCIAS_KEYS.detail(id),
    queryFn: async () => {
      const { data, error } = await ocorrenciasTable()
        .select('*')
        .eq('id', id)
        .eq('workspace_id', workspaceId!)
        .single();
      if (error) throw error;
      return data as Ocorrencia;
    },
    enabled: !!id && !!workspaceId,
  });
}

// ============================================================
// HOOK: eventos (timeline) de uma ocorrência
// ============================================================
export function useOcorrenciaEventos(ocorrenciaId: string) {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: OCORRENCIAS_KEYS.eventos(ocorrenciaId),
    queryFn: async () => {
      const { data, error } = await eventosTable()
        .select('*')
        .eq('ocorrencia_id', ocorrenciaId)
        .eq('workspace_id', workspaceId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as OcorrenciaEvento[];
    },
    enabled: !!ocorrenciaId && !!workspaceId,
  });
}

// ============================================================
// HOOK: observadores de uma ocorrência
// ============================================================
export function useOcorrenciaObservadores(ocorrenciaId: string) {
  const { workspaceId } = useAuth();
  return useQuery({
    queryKey: OCORRENCIAS_KEYS.observadores(ocorrenciaId),
    queryFn: async () => {
      const { data, error } = await observadoresTable()
        .select('*')
        .eq('ocorrencia_id', ocorrenciaId)
        .eq('workspace_id', workspaceId!);
      if (error) throw error;
      return (data || []) as OcorrenciaObservador[];
    },
    enabled: !!ocorrenciaId && !!workspaceId,
  });
}

// ============================================================
// MUTATION: criar ocorrência
// ============================================================
interface CriarOcorrenciaPayload {
  titulo: string;
  descricao: string;
  tipo: OcorrenciaTipo;
  sub_motivo?: string | null;
  prioridade: OcorrenciaPrioridade;
  executor_id: string;
  observadores?: string[];
  bookmaker_id?: string;
  conta_bancaria_id?: string;
  projeto_id?: string;
  parceiro_id?: string;
  aposta_id?: string;
  wallet_id?: string;
  contexto_metadata?: Record<string, unknown>;
}

export function useCriarOcorrencia() {
  const { workspaceId, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CriarOcorrenciaPayload) => {
      // 1. Criar ocorrência
      const { data: ocorrencia, error } = await ocorrenciasTable()
        .insert({
          workspace_id: workspaceId!,
          titulo: payload.titulo,
          descricao: payload.descricao,
          tipo: payload.tipo,
          sub_motivo: payload.sub_motivo || null,
          prioridade: payload.prioridade,
          requerente_id: user!.id,
          executor_id: payload.executor_id,
          bookmaker_id: payload.bookmaker_id || null,
          conta_bancaria_id: payload.conta_bancaria_id || null,
          projeto_id: payload.projeto_id || null,
          parceiro_id: payload.parceiro_id || null,
          aposta_id: payload.aposta_id || null,
          wallet_id: payload.wallet_id || null,
          contexto_metadata: payload.contexto_metadata || null,
        })
        .select()
        .single();

      if (error) throw error;

      // 2. Evento de criação
      await eventosTable().insert({
        ocorrencia_id: ocorrencia.id,
        workspace_id: workspaceId!,
        tipo: 'criacao',
        conteudo: payload.descricao,
        autor_id: user!.id,
      });

      // 3. Observadores
      if (payload.observadores && payload.observadores.length > 0) {
        await observadoresTable().insert(
          payload.observadores.map((uid: string) => ({
            ocorrencia_id: ocorrencia.id,
            workspace_id: workspaceId!,
            user_id: uid,
            added_by: user!.id,
          }))
        );
      }

      return ocorrencia as Ocorrencia;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.all(workspaceId!) });
      toast.success('Ocorrência criada com sucesso');
    },
    onError: (err) => {
      console.error('Erro ao criar ocorrência:', err);
      toast.error('Erro ao criar ocorrência');
    },
  });
}

// ============================================================
// MUTATION: atualizar status
// ============================================================
export function useAtualizarStatusOcorrencia() {
  const { workspaceId, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      novoStatus,
      statusAnterior,
    }: {
      id: string;
      novoStatus: OcorrenciaStatus;
      statusAnterior: OcorrenciaStatus;
    }) => {
      const extra: Record<string, unknown> = {};
      if (novoStatus === 'resolvido') extra.resolved_at = new Date().toISOString();
      if (novoStatus === 'cancelado') extra.cancelled_at = new Date().toISOString();

      const { error } = await ocorrenciasTable()
        .update({ status: novoStatus, ...extra })
        .eq('id', id)
        .eq('workspace_id', workspaceId!);
      if (error) throw error;

      await eventosTable().insert({
        ocorrencia_id: id,
        workspace_id: workspaceId!,
        tipo: 'status_alterado',
        autor_id: user!.id,
        valor_anterior: statusAnterior,
        valor_novo: novoStatus,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.all(workspaceId!) });
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.eventos(vars.id) });
      toast.success('Status atualizado');
    },
    onError: () => toast.error('Erro ao atualizar status'),
  });
}

// ============================================================
// MUTATION: adicionar comentário/anexo
// ============================================================
export function useAdicionarComentario() {
  const { workspaceId, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ocorrenciaId,
      conteudo,
      anexos,
    }: {
      ocorrenciaId: string;
      conteudo: string;
      anexos?: OcorrenciaAnexo[];
    }) => {
      const { error } = await eventosTable().insert({
        ocorrencia_id: ocorrenciaId,
        workspace_id: workspaceId!,
        tipo: anexos && anexos.length > 0 ? 'anexo' : 'comentario',
        conteudo,
        autor_id: user!.id,
        anexos: anexos ? JSON.parse(JSON.stringify(anexos)) : null,
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.eventos(vars.ocorrenciaId) });
      toast.success('Comentário adicionado');
    },
    onError: () => toast.error('Erro ao adicionar comentário'),
  });
}

// ============================================================
// MUTATION: alterar executor
// ============================================================
export function useAtualizarExecutorOcorrencia() {
  const { workspaceId, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      novoExecutorId,
      executorAnteriorNome,
      novoExecutorNome,
    }: {
      id: string;
      novoExecutorId: string;
      executorAnteriorNome: string;
      novoExecutorNome: string;
    }) => {
      const { error } = await ocorrenciasTable()
        .update({ executor_id: novoExecutorId })
        .eq('id', id)
        .eq('workspace_id', workspaceId!);
      if (error) throw error;

      await eventosTable().insert({
        ocorrencia_id: id,
        workspace_id: workspaceId!,
        tipo: 'executor_alterado',
        autor_id: user!.id,
        valor_anterior: executorAnteriorNome,
        valor_novo: novoExecutorNome,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.all(workspaceId!) });
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.eventos(vars.id) });
      toast.success('Executor atualizado');
    },
    onError: () => toast.error('Erro ao atualizar executor'),
  });
}

// ============================================================
// MUTATION: excluir ocorrência (apenas owner/admin)
// ============================================================
export function useExcluirOcorrencia() {
  const { workspaceId } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await ocorrenciasTable()
        .delete()
        .eq('id', id)
        .eq('workspace_id', workspaceId!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.all(workspaceId!) });
      toast.success('Ocorrência excluída');
    },
    onError: () => toast.error('Erro ao excluir ocorrência'),
  });
}
