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
  valor_risco?: number;
  moeda?: string;
  data_ocorrencia?: string;
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
          valor_risco: payload.valor_risco || 0,
          moeda: payload.moeda || 'BRL',
          data_ocorrencia: payload.data_ocorrencia || new Date().toISOString().split('T')[0],
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
// MUTATION: editar ocorrência
// ============================================================
interface EditarOcorrenciaPayload {
  id: string;
  titulo?: string;
  descricao?: string;
  tipo?: OcorrenciaTipo;
  sub_motivo?: string | null;
  prioridade?: OcorrenciaPrioridade;
  valor_risco?: number;
  data_ocorrencia?: string;
}

export function useEditarOcorrencia() {
  const { workspaceId, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (payload: EditarOcorrenciaPayload) => {
      const { id, ...fields } = payload;
      const updateData: Record<string, unknown> = {};
      if (fields.titulo !== undefined) updateData.titulo = fields.titulo;
      if (fields.descricao !== undefined) updateData.descricao = fields.descricao;
      if (fields.tipo !== undefined) updateData.tipo = fields.tipo;
      if (fields.sub_motivo !== undefined) updateData.sub_motivo = fields.sub_motivo;
      if (fields.prioridade !== undefined) updateData.prioridade = fields.prioridade;
      if (fields.valor_risco !== undefined) updateData.valor_risco = fields.valor_risco;
      if (fields.data_ocorrencia !== undefined) updateData.data_ocorrencia = fields.data_ocorrencia;

      const { error } = await ocorrenciasTable()
        .update(updateData)
        .eq('id', id)
        .eq('workspace_id', workspaceId!);
      if (error) throw error;

      // Registrar evento de edição
      await eventosTable().insert({
        ocorrencia_id: id,
        workspace_id: workspaceId!,
        tipo: 'comentario',
        conteudo: 'Ocorrência editada',
        autor_id: user!.id,
      });
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.all(workspaceId!) });
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.eventos(vars.id) });
      toast.success('Ocorrência atualizada com sucesso');
    },
    onError: () => toast.error('Erro ao editar ocorrência'),
  });
}

// ============================================================
// MUTATION: resolver ocorrência com desfecho financeiro
// ============================================================
export function useResolverOcorrenciaComFinanceiro() {
  const { workspaceId, user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      statusAnterior,
      resultadoFinanceiro,
      valorPerda,
      resolvedAt,
    }: {
      id: string;
      statusAnterior: OcorrenciaStatus;
      resultadoFinanceiro: 'sem_impacto' | 'perda_confirmada' | 'perda_parcial';
      valorPerda: number;
      resolvedAt?: string;
    }) => {
      // 1. Atualizar ocorrência com status + resultado financeiro
      const { error } = await ocorrenciasTable()
        .update({
          status: 'resolvido',
          resolved_at: resolvedAt || new Date().toISOString(),
          resultado_financeiro: resultadoFinanceiro,
          valor_perda: valorPerda,
          perda_registrada_ledger: valorPerda > 0,
        })
        .eq('id', id)
        .eq('workspace_id', workspaceId!);
      if (error) throw error;

      // 2. Evento de status
      await eventosTable().insert({
        ocorrencia_id: id,
        workspace_id: workspaceId!,
        tipo: 'status_alterado',
        autor_id: user!.id,
        valor_anterior: statusAnterior,
        valor_novo: 'resolvido',
      });

      // 3. Se houve perda, registrar no ledger
      if (valorPerda > 0) {
        // Buscar dados da ocorrência para o ledger
        const { data: ocorrencia } = await ocorrenciasTable()
          .select('bookmaker_id, moeda, titulo, tipo')
          .eq('id', id)
          .single();

        if (ocorrencia?.bookmaker_id) {
          const { registrarPerdaOperacionalViaLedger } = await import('@/lib/ledgerService');
          
          // Buscar moeda do bookmaker
          const { data: bkInfo } = await (supabase as any)
            .from('bookmakers')
            .select('moeda, workspace_id, saldo_irrecuperavel')
            .eq('id', ocorrencia.bookmaker_id)
            .single();

          await registrarPerdaOperacionalViaLedger({
            bookmakerId: ocorrencia.bookmaker_id,
            valor: valorPerda,
            moeda: bkInfo?.moeda || ocorrencia.moeda || 'BRL',
            workspaceId: bkInfo?.workspace_id || workspaceId!,
            userId: user!.id,
            descricao: `Perda via ocorrência: ${ocorrencia.titulo}`,
            perdaId: id,
            categoria: ocorrencia.tipo,
          });

          // Se o sub-motivo for saldo_irrecuperavel, acumular no campo da bookmaker
          const { data: ocorrenciaFull } = await ocorrenciasTable()
            .select('sub_motivo')
            .eq('id', id)
            .single();

          if (ocorrenciaFull?.sub_motivo === 'saldo_irrecuperavel') {
            const currentIrrec = Number(bkInfo?.saldo_irrecuperavel || 0);
            await (supabase as any)
              .from('bookmakers')
              .update({ saldo_irrecuperavel: currentIrrec + valorPerda })
              .eq('id', ocorrencia.bookmaker_id);
          }
        }
      }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.all(workspaceId!) });
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.detail(vars.id) });
      qc.invalidateQueries({ queryKey: OCORRENCIAS_KEYS.eventos(vars.id) });
      if (vars.valorPerda > 0) {
        toast.success(`Ocorrência resolvida com perda de ${vars.valorPerda.toFixed(2)} registrada`);
      } else {
        toast.success('Ocorrência resolvida sem impacto financeiro');
      }
    },
    onError: () => toast.error('Erro ao resolver ocorrência'),
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
