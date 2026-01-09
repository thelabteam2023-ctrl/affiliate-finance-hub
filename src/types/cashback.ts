/**
 * Sistema de Cashback
 * 
 * Cashback é uma regra financeira que observa apostas,
 * calcula elegibilidade e gera crédito automaticamente ou manualmente.
 */

export type CashbackTipo = 'sobre_perda' | 'sobre_volume';
export type CashbackCategoria = 'promocional' | 'permanente' | 'estrategia';
export type CashbackPeriodo = 'diario' | 'semanal' | 'mensal' | 'personalizado';
export type CashbackTipoCredito = 'saldo_real' | 'freebet' | 'bonus_rollover';
export type CashbackPrazoCredito = 'imediato' | 'd1' | 'dx';
export type CashbackAplicacao = 'automatica' | 'manual';
export type CashbackStatus = 'ativo' | 'pausado' | 'encerrado';
export type CashbackRegistroStatus = 'pendente' | 'recebido' | 'cancelado' | 'expirado';

export interface CashbackRegra {
  id: string;
  projeto_id: string;
  bookmaker_id: string;
  workspace_id: string;
  user_id: string;
  
  // Informações Básicas
  nome: string;
  categoria: CashbackCategoria;
  
  // Regra de Cálculo
  tipo: CashbackTipo;
  percentual: number;
  limite_maximo: number | null;
  periodo_apuracao: CashbackPeriodo;
  periodo_dias_custom?: number | null;
  
  // Condições (opcionais)
  odds_minimas: number | null;
  valor_minimo_aposta: number | null;
  esportes_validos: string[] | null;
  mercados_validos: string[] | null;
  
  // Forma de Crédito
  tipo_credito: CashbackTipoCredito;
  prazo_credito: CashbackPrazoCredito;
  prazo_dias_custom?: number | null;
  
  // Controle
  aplicacao: CashbackAplicacao;
  status: CashbackStatus;
  
  // Metadados
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashbackRegistro {
  id: string;
  regra_id: string;
  projeto_id: string;
  bookmaker_id: string;
  workspace_id: string;
  user_id: string;
  
  // Período de referência
  periodo_inicio: string;
  periodo_fim: string;
  
  // Cálculo
  volume_elegivel: number;
  percentual_aplicado: number;
  valor_calculado: number;
  valor_recebido: number | null;
  
  // Moeda
  moeda_operacao: string;
  cotacao_snapshot: number | null;
  cotacao_snapshot_at: string | null;
  valor_brl_referencia: number | null;
  
  // Status
  status: CashbackRegistroStatus;
  data_credito: string | null;
  
  // Metadados
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface CashbackRegraComBookmaker extends CashbackRegra {
  bookmaker?: {
    id: string;
    nome: string;
    moeda: string;
  };
}

export interface CashbackRegistroComDetalhes extends CashbackRegistro {
  regra?: CashbackRegra;
  bookmaker?: {
    id: string;
    nome: string;
    moeda: string;
  };
}

export interface CashbackMetrics {
  totalRecebido: number;
  totalPendente: number;
  volumeElegivel: number;
  percentualMedioRetorno: number;
  totalRegistros: number;
  regrasAtivas: number;
}

export interface CashbackPorBookmaker {
  bookmaker_id: string;
  bookmaker_nome: string;
  totalRecebido: number;
  totalPendente: number;
  volumeElegivel: number;
  percentualMedio: number;
  registros: number;
}

export interface CashbackRegraFormData {
  bookmaker_id: string;
  nome: string;
  categoria: CashbackCategoria;
  tipo: CashbackTipo;
  percentual: number;
  limite_maximo: number | null;
  periodo_apuracao: CashbackPeriodo;
  periodo_dias_custom?: number | null;
  odds_minimas: number | null;
  valor_minimo_aposta: number | null;
  esportes_validos: string[] | null;
  mercados_validos: string[] | null;
  tipo_credito: CashbackTipoCredito;
  prazo_credito: CashbackPrazoCredito;
  prazo_dias_custom?: number | null;
  aplicacao: CashbackAplicacao;
  status: CashbackStatus;
  observacoes: string | null;
}

export interface CashbackRegistroFormData {
  regra_id: string;
  bookmaker_id: string;
  periodo_inicio: string;
  periodo_fim: string;
  volume_elegivel: number;
  percentual_aplicado: number;
  valor_calculado: number;
  valor_recebido: number | null;
  status: CashbackRegistroStatus;
  data_credito: string | null;
  observacoes: string | null;
}
