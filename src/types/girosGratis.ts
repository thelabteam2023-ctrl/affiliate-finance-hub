// Types for Giros Grátis module

export type GiroGratisModo = 'simples' | 'detalhado';
export type GiroGratisStatus = 'pendente' | 'confirmado' | 'cancelado';

export interface GiroGratis {
  id: string;
  projeto_id: string;
  bookmaker_id: string;
  workspace_id: string;
  user_id: string;
  modo: GiroGratisModo;
  data_registro: string;
  valor_retorno: number;
  quantidade_giros: number | null;
  valor_por_giro: number | null;
  valor_total_giros: number | null;
  status: GiroGratisStatus;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GiroGratisComBookmaker extends GiroGratis {
  bookmaker_nome: string;
  bookmaker_logo_url: string | null;
  parceiro_nome: string | null;
}

export interface GiroGratisFormData {
  bookmaker_id: string;
  modo: GiroGratisModo;
  data_registro: Date;
  valor_retorno: number;
  quantidade_giros?: number;
  valor_por_giro?: number;
  observacoes?: string;
  giro_disponivel_id?: string;
}

export interface GirosGratisMetrics {
  totalRetorno: number;
  totalGiros: number;
  mediaRetornoPorGiro: number;
  totalRegistros: number;
  registrosSimples: number;
  registrosDetalhados: number;
}

export interface GirosGratisPorBookmaker {
  bookmaker_id: string;
  bookmaker_nome: string;
  logo_url: string | null;
  parceiro_nome: string | null;
  total_retorno: number;
  total_giros: number;
  total_registros: number;
  media_retorno: number;
}

export interface GirosGratisChartData {
  date: string;
  valor: number;
  acumulado: number;
}
