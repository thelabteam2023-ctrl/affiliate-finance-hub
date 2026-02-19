// ============================================================
// TIPOS DO MÓDULO DE OCORRÊNCIAS OPERACIONAIS
// ============================================================

export type OcorrenciaTipo =
  | 'saques'
  | 'depositos'
  | 'financeiro'
  | 'kyc'
  | 'bloqueio_bancario'
  | 'bloqueio_contas';

export type OcorrenciaPrioridade = 'baixa' | 'media' | 'alta' | 'urgente';

export type OcorrenciaStatus =
  | 'aberto'
  | 'em_andamento'
  | 'aguardando_terceiro'
  | 'resolvido'
  | 'cancelado';

export type OcorrenciaEventoTipo =
  | 'criacao'
  | 'comentario'
  | 'anexo'
  | 'status_alterado'
  | 'executor_alterado'
  | 'observador_adicionado'
  | 'observador_removido'
  | 'prioridade_alterada'
  | 'vinculo_adicionado';

export interface OcorrenciaAnexo {
  nome: string;
  url: string;
  tipo: string; // mime type
  tamanho?: number;
}

export interface Ocorrencia {
  id: string;
  workspace_id: string;
  titulo: string;
  descricao: string;
  tipo: OcorrenciaTipo;
  prioridade: OcorrenciaPrioridade;
  status: OcorrenciaStatus;
  requerente_id: string;
  executor_id: string;
  bookmaker_id?: string | null;
  projeto_id?: string | null;
  parceiro_id?: string | null;
  aposta_id?: string | null;
  wallet_id?: string | null;
  sla_horas?: number | null;
  sla_alerta_em?: string | null;
  sla_violado: boolean;
  contexto_metadata?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  resolved_at?: string | null;
  cancelled_at?: string | null;
  // Joins
  requerente?: { id: string; full_name: string; avatar_url?: string };
  executor?: { id: string; full_name: string; avatar_url?: string };
  bookmaker?: { id: string; nome: string; logo_url?: string };
  projeto?: { id: string; nome: string };
  parceiro?: { id: string; nome: string };
}

export interface OcorrenciaEvento {
  id: string;
  ocorrencia_id: string;
  workspace_id: string;
  tipo: OcorrenciaEventoTipo;
  conteudo?: string | null;
  autor_id: string;
  valor_anterior?: string | null;
  valor_novo?: string | null;
  anexos?: OcorrenciaAnexo[] | null;
  created_at: string;
  // Join
  autor?: { id: string; full_name: string; avatar_url?: string };
}

export interface OcorrenciaObservador {
  id: string;
  ocorrencia_id: string;
  workspace_id: string;
  user_id: string;
  added_at: string;
  added_by: string;
  // Join
  user?: { id: string; full_name: string; avatar_url?: string };
}

// Labels e cores

export const TIPO_LABELS: Record<OcorrenciaTipo, string> = {
  saques: 'Saques',
  depositos: 'Depósitos',
  financeiro: 'Financeiro',
  kyc: 'KYC',
  bloqueio_bancario: 'Bloqueio Bancário',
  bloqueio_contas: 'Bloqueio de Sportbooks',
};

export const PRIORIDADE_LABELS: Record<OcorrenciaPrioridade, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const STATUS_LABELS: Record<OcorrenciaStatus, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em Andamento',
  aguardando_terceiro: 'Aguardando Terceiro',
  resolvido: 'Resolvido',
  cancelado: 'Cancelado',
};

export const PRIORIDADE_COLORS: Record<OcorrenciaPrioridade, string> = {
  baixa: 'text-muted-foreground border-muted-foreground/50',
  media: 'text-blue-400 border-blue-400/50',
  alta: 'text-orange-400 border-orange-400/50',
  urgente: 'text-red-400 border-red-400/50',
};

export const PRIORIDADE_BG: Record<OcorrenciaPrioridade, string> = {
  baixa: 'bg-muted/30',
  media: 'bg-blue-500/10',
  alta: 'bg-orange-500/10',
  urgente: 'bg-red-500/10',
};

export const STATUS_COLORS: Record<OcorrenciaStatus, string> = {
  aberto: 'text-yellow-400 border-yellow-400/50',
  em_andamento: 'text-blue-400 border-blue-400/50',
  aguardando_terceiro: 'text-purple-400 border-purple-400/50',
  resolvido: 'text-emerald-400 border-emerald-400/50',
  cancelado: 'text-muted-foreground border-muted-foreground/50',
};

export const EVENTO_TIPO_LABELS: Record<OcorrenciaEventoTipo, string> = {
  criacao: 'criou esta ocorrência',
  comentario: 'comentou',
  anexo: 'anexou um arquivo',
  status_alterado: 'alterou o status',
  executor_alterado: 'alterou o executor',
  observador_adicionado: 'adicionou um observador',
  observador_removido: 'removeu um observador',
  prioridade_alterada: 'alterou a prioridade',
  vinculo_adicionado: 'adicionou um vínculo',
};
