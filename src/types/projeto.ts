// Tipos centralizados de projeto

export interface Projeto {
  id: string;
  projeto_id?: string;
  nome: string;
  descricao?: string | null;
  status: ProjetoStatus;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  data_fim_real?: string | null;
  orcamento_inicial: number;
  operadores_ativos?: number;
  total_gasto_operadores?: number;
  saldo_bookmakers?: number;
  saldo_irrecuperavel?: number;
  total_depositado?: number;
  total_sacado?: number;
  total_bookmakers?: number;
  perdas_confirmadas?: number;
  lucro_operacional_total?: number;
  conciliado?: boolean;
  tem_investimento_crypto?: boolean;
}

export type ProjetoStatus = 'PLANEJADO' | 'EM_ANDAMENTO' | 'PAUSADO' | 'FINALIZADO';

export const STATUS_CONFIG: Record<ProjetoStatus, { label: string; color: string }> = {
  PLANEJADO: { 
    label: 'Planejado', 
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30' 
  },
  EM_ANDAMENTO: { 
    label: 'Em Andamento', 
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
  },
  PAUSADO: { 
    label: 'Pausado', 
    color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' 
  },
  FINALIZADO: { 
    label: 'Finalizado', 
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30' 
  },
};

export function getStatusColor(status: string): string {
  return STATUS_CONFIG[status as ProjetoStatus]?.color || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
}

export function getStatusLabel(status: string): string {
  return STATUS_CONFIG[status as ProjetoStatus]?.label || status;
}
