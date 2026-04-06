// ============================================================
// TIPOS DO MÓDULO DE SOLICITAÇÕES OPERACIONAIS
// ============================================================

export type SolicitacaoTipo =
  | 'abertura_conta'
  | 'verificacao_kyc'
  | 'deposito'
  | 'saque'
  | 'verificacao_sms_email'
  | 'contato_parceria'
  | 'outros';

export type SolicitacaoPrioridade = 'baixa' | 'media' | 'alta';

export type SolicitacaoStatus =
  | 'pendente'
  | 'em_execucao'
  | 'concluida'
  | 'recusada';

export interface Solicitacao {
  id: string;
  workspace_id: string;
  titulo: string;
  descricao: string;
  tipo: SolicitacaoTipo;
  prioridade: SolicitacaoPrioridade;
  status: SolicitacaoStatus;
  requerente_id: string;
  executor_id: string;
  observadores?: string[];
  bookmaker_id?: string | null;
  projeto_id?: string | null;
  parceiro_id?: string | null;
  destinatario_nome?: string | null;
  valor?: number | null;
  lote_id?: string | null;
  contexto_metadata?: Record<string, unknown> | null;
  recusa_motivo?: string | null;
  created_at: string;
  updated_at: string;
  concluida_at?: string | null;
  recusada_at?: string | null;
  descricao_editada_at?: string | null;
  // Joins
  requerente?: { id: string; full_name: string; avatar_url?: string };
  executor?: { id: string; full_name: string; avatar_url?: string };
  bookmaker?: { id: string; nome: string };
  projeto?: { id: string; nome: string };
  parceiro?: { id: string; nome: string };
}

// Labels e cores

export const SOLICITACAO_TIPO_LABELS: Record<SolicitacaoTipo, string> = {
  abertura_conta: 'Abertura de Bookmaker',
  verificacao_kyc: 'Verificação KYC',
  deposito: 'Depósito',
  saque: 'Saques',
  verificacao_sms_email: 'Verificação SMS/Email',
  contato_parceria: 'Contato para Parceria',
  outros: 'Outros',
};

// Fallback map: tipos antigos → novos (para registros históricos)
export const SOLICITACAO_TIPO_FALLBACK: Record<string, SolicitacaoTipo> = {
  transferencia: 'outros',
  verificacao_conta: 'verificacao_kyc',
  verificacao_celular: 'verificacao_sms_email',
  verificacao_facial: 'verificacao_kyc',
};

// ---- Prioridade (3 níveis com SLA) ----

export const SOLICITACAO_PRIORIDADE_LABELS: Record<SolicitacaoPrioridade, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};

export const SOLICITACAO_PRIORIDADE_CONFIG: Record<SolicitacaoPrioridade, {
  label: string;
  icon: string;
  slaHours: number;
  slaLabel: string;
  borderColor: string;
  bgColor: string;
  textColor: string;
  dotColor: string;
}> = {
  baixa: {
    label: 'Baixa',
    icon: '🟢',
    slaHours: 24,
    slaLabel: '24h',
    borderColor: 'border-l-emerald-500',
    bgColor: 'bg-emerald-500/10',
    textColor: 'text-emerald-400',
    dotColor: 'bg-emerald-500',
  },
  media: {
    label: 'Média',
    icon: '🟡',
    slaHours: 12,
    slaLabel: '12h',
    borderColor: 'border-l-yellow-500',
    bgColor: 'bg-yellow-500/10',
    textColor: 'text-yellow-400',
    dotColor: 'bg-yellow-500',
  },
  alta: {
    label: 'Alta',
    icon: '🔴',
    slaHours: 6,
    slaLabel: '6h',
    borderColor: 'border-l-red-500',
    bgColor: 'bg-red-500/10',
    textColor: 'text-red-400',
    dotColor: 'bg-red-500',
  },
};

// Fallback de prioridade: urgente → alta
export const PRIORIDADE_FALLBACK: Record<string, SolicitacaoPrioridade> = {
  urgente: 'alta',
};

export function resolverPrioridade(p: string): SolicitacaoPrioridade {
  if (p in SOLICITACAO_PRIORIDADE_CONFIG) return p as SolicitacaoPrioridade;
  if (p in PRIORIDADE_FALLBACK) return PRIORIDADE_FALLBACK[p];
  return 'baixa';
}

/** Calcula o SLA restante em ms. Negativo = vencido. */
export function calcularSlaRestante(createdAt: string, prioridade: SolicitacaoPrioridade): number {
  const config = SOLICITACAO_PRIORIDADE_CONFIG[prioridade];
  const deadline = new Date(createdAt).getTime() + config.slaHours * 60 * 60 * 1000;
  return deadline - Date.now();
}

/** Formata SLA restante como "Xh Ym" ou "Vencido Xh" */
export function formatarSla(restanteMs: number): string {
  const abs = Math.abs(restanteMs);
  const hours = Math.floor(abs / (60 * 60 * 1000));
  const minutes = Math.floor((abs % (60 * 60 * 1000)) / (60 * 1000));
  const label = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return restanteMs < 0 ? `Vencido ${label}` : label;
}

// ---- Status ----

export const SOLICITACAO_PRIORIDADE_COLORS: Record<SolicitacaoPrioridade, string> = {
  baixa: 'text-emerald-400 border-emerald-400/50',
  media: 'text-yellow-400 border-yellow-400/50',
  alta: 'text-red-400 border-red-400/50',
};

export const SOLICITACAO_STATUS_LABELS: Record<SolicitacaoStatus, string> = {
  pendente: 'Pendente',
  em_execucao: 'Em Execução',
  concluida: 'Concluída',
  recusada: 'Recusada',
};

export const SOLICITACAO_STATUS_COLORS: Record<SolicitacaoStatus, string> = {
  pendente: 'text-yellow-400 border-yellow-400/50',
  em_execucao: 'text-blue-400 border-blue-400/50',
  concluida: 'text-emerald-400 border-emerald-400/50',
  recusada: 'text-muted-foreground border-muted-foreground/50',
};

export const SOLICITACAO_STATUS_FLOW: Record<SolicitacaoStatus, SolicitacaoStatus[]> = {
  pendente: ['em_execucao', 'recusada'],
  em_execucao: ['concluida', 'recusada'],
  concluida: [],
  recusada: [],
};

// Kanban columns config
export const KANBAN_COLUMNS: { status: SolicitacaoStatus; label: string; color: string; icon: string }[] = [
  { status: 'pendente', label: 'Pendente', color: 'text-yellow-400', icon: '🟡' },
  { status: 'em_execucao', label: 'Em Andamento', color: 'text-blue-400', icon: '🔵' },
  { status: 'concluida', label: 'Concluído', color: 'text-emerald-400', icon: '🟢' },
];

/** Resolve um tipo (potencialmente legado) para o tipo atual */
export function resolverTipoSolicitacao(tipo: string): SolicitacaoTipo {
  if (tipo in SOLICITACAO_TIPO_LABELS) return tipo as SolicitacaoTipo;
  if (tipo in SOLICITACAO_TIPO_FALLBACK) return SOLICITACAO_TIPO_FALLBACK[tipo];
  return 'outros';
}
