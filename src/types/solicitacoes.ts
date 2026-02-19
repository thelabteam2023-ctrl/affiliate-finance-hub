// ============================================================
// TIPOS DO MÓDULO DE SOLICITAÇÕES OPERACIONAIS
// ============================================================

export type SolicitacaoTipo =
  | 'abertura_conta'
  | 'verificacao_kyc'
  | 'transferencia'
  | 'outros';

export type SolicitacaoPrioridade = 'baixa' | 'media' | 'alta' | 'urgente';

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
  transferencia: 'Transferência / Movimentação',
  outros: 'Outros',
};

export const SOLICITACAO_PRIORIDADE_LABELS: Record<SolicitacaoPrioridade, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const SOLICITACAO_STATUS_LABELS: Record<SolicitacaoStatus, string> = {
  pendente: 'Pendente',
  em_execucao: 'Em Execução',
  concluida: 'Concluída',
  recusada: 'Recusada',
};

export const SOLICITACAO_PRIORIDADE_COLORS: Record<SolicitacaoPrioridade, string> = {
  baixa: 'text-muted-foreground border-muted-foreground/50',
  media: 'text-blue-400 border-blue-400/50',
  alta: 'text-orange-400 border-orange-400/50',
  urgente: 'text-red-400 border-red-400/50',
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
