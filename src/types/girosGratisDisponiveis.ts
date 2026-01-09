// Types for Giros Grátis Disponíveis (promoções pendentes)

export type GiroDisponivelStatus = 'DISPONIVEL' | 'UTILIZADO' | 'EXPIRADO' | 'CANCELADO';

export interface GiroGratisDisponivel {
  id: string;
  projeto_id: string;
  bookmaker_id: string;
  workspace_id: string;
  user_id: string;
  quantidade_giros: number;
  valor_por_giro: number;
  valor_total: number;
  motivo: string;
  data_recebido: string;
  data_validade: string | null;
  status: GiroDisponivelStatus;
  giro_gratis_resultado_id: string | null;
  data_utilizacao: string | null;
  observacoes: string | null;
  created_at: string;
  updated_at: string;
}

export interface GiroDisponivelComBookmaker extends GiroGratisDisponivel {
  bookmaker_nome: string;
  bookmaker_logo_url: string | null;
  parceiro_nome: string | null;
  dias_restantes: number | null;
  prestes_a_expirar: boolean;
}

export interface GiroDisponivelFormData {
  bookmaker_id: string;
  quantidade_giros: number;
  valor_por_giro: number;
  motivo: string;
  data_recebido: Date;
  data_validade?: Date | null;
  observacoes?: string;
}

export interface GirosDisponiveisMetrics {
  totalDisponiveis: number;
  valorTotalDisponivel: number;
  girosProximosExpirar: number;
  casasComGiros: number;
}
