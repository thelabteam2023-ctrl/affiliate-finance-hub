/**
 * Types for Bet Export functionality
 */

// Base structure for exported data (normalized across all tabs)
export interface ExportApostaRecord {
  id: string;
  data_hora: string;
  projeto_nome?: string;
  bookmaker: string;
  estrategia: string;
  aba_origem: string;
  evento: string;
  mercado: string;
  selecao: string;
  odd: number | string;
  stake: number | string;
  retorno: number | string;
  resultado: string;
  status: string;
  lucro_prejuizo: number | string;
  observacoes?: string;
}

// Export format options
export type ExportFormat = 'csv' | 'xml';

// Export context for audit logging
export interface ExportContext {
  abaOrigem: string;
  filtrosAplicados: {
    periodo?: string;
    dataInicio?: string;
    dataFim?: string;
    bookmaker?: string;
    parceiro?: string;
    resultado?: string;
    status?: string;
  };
  totalRegistros: number;
}

// Audit log entry for exports
export interface ExportAuditEntry {
  user_id: string;
  workspace_id: string;
  export_format: ExportFormat;
  aba_origem: string;
  filtros_aplicados: Record<string, unknown>;
  total_registros: number;
  created_at: string;
}

// Hook return type
export interface UseExportApostasReturn {
  exportToCSV: (records: ExportApostaRecord[], filename: string, context: ExportContext) => Promise<void>;
  exportToXML: (records: ExportApostaRecord[], filename: string, context: ExportContext) => Promise<void>;
  exporting: boolean;
  canExport: boolean;
}

// Column mapping for CSV headers
export const CSV_HEADERS: Record<keyof ExportApostaRecord, string> = {
  id: 'ID',
  data_hora: 'Data/Hora',
  projeto_nome: 'Projeto',
  bookmaker: 'Casa',
  estrategia: 'Estratégia',
  aba_origem: 'Aba Origem',
  evento: 'Evento',
  mercado: 'Mercado',
  selecao: 'Seleção',
  odd: 'Odd',
  stake: 'Stake',
  retorno: 'Retorno',
  resultado: 'Resultado',
  status: 'Status',
  lucro_prejuizo: 'Lucro/Prejuízo',
  observacoes: 'Observações',
};
