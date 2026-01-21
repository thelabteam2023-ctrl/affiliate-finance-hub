/**
 * Sistema de Cashback Manual Operacional
 * 
 * Cashback é tratado como um lançamento financeiro imediato.
 * O valor informado representa dinheiro já creditado na casa.
 */

export interface CashbackManual {
  id: string;
  projeto_id: string;
  bookmaker_id: string;
  workspace_id: string;
  user_id: string;
  
  // Dados do lançamento
  valor: number;
  data_credito: string;
  observacoes: string | null;
  
  // Flag de rollover
  tem_rollover: boolean;
  
  // Integração financeira
  cash_ledger_id: string | null;
  
  // Snapshot de moeda
  moeda_operacao: string;
  cotacao_snapshot: number | null;
  cotacao_snapshot_at: string | null;
  valor_brl_referencia: number | null;
  
  // Metadados
  created_at: string;
  updated_at: string;
}

export interface CashbackManualComBookmaker extends CashbackManual {
  bookmaker?: {
    id: string;
    nome: string;
    moeda: string;
    parceiro_id?: string | null;
    bookmaker_catalogo_id?: string | null;
    parceiro?: {
      id: string;
      nome: string;
    } | null;
    bookmakers_catalogo?: {
      logo_url: string | null;
    } | null;
  };
}

export interface CashbackManualFormData {
  bookmaker_id: string;
  valor: number;
  data_credito?: string;
  observacoes?: string | null;
  tem_rollover?: boolean;
}

export interface CashbackManualMetrics {
  totalRecebido: number;
  totalLancamentos: number;
  mediaPorLancamento: number;
}

// Breakdown individual por parceiro dentro de uma casa
export interface CashbackParceiroBreakdown {
  parceiro_id: string | null;
  parceiro_nome: string | null;
  totalRecebido: number;
  totalLancamentos: number;
}

// Agregado por catálogo da casa (unifica todos os parceiros)
export interface CashbackManualPorBookmaker {
  bookmaker_catalogo_id: string | null;
  bookmaker_nome: string;
  bookmaker_moeda: string;
  logo_url: string | null;
  totalRecebido: number;
  totalLancamentos: number;
  parceiros: CashbackParceiroBreakdown[];
}
