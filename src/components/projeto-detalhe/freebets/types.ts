// Types for Freebet module

export interface FreebetRecebida {
  id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  valor: number;
  motivo: string;
  data_recebida: string;
  utilizada: boolean;
  data_utilizacao: string | null;
  aposta_id: string | null;
  status: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA";
}

export interface BookmakerComFreebet {
  id: string;
  nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  saldo_freebet: number;
}

export interface ApostaOperacionalFreebet {
  id: string;
  tipo: "simples" | "multipla";
  evento: string;
  mercado: string | null;
  selecao: string;
  odd: number;
  stake: number;
  lucro_prejuizo: number | null;
  valor_retorno: number | null;
  data_aposta: string;
  status: string;
  resultado: string | null;
  tipo_freebet: string | null;
  bookmaker_id: string;
  bookmaker_nome: string;
  logo_url: string | null;
  parceiro_nome: string | null;
  gerou_freebet: boolean;
  valor_freebet_gerada: number | null;
  // Campos adicionais para badges
  estrategia: string | null;
  lado_aposta: string | null;
  contexto_operacional: string | null;
}

export interface BookmakerFreebetStats {
  bookmaker_id: string;
  bookmaker_nome: string;
  logo_url: string | null;
  parceiro_nome: string | null;
  // Métricas de recebimento
  total_freebets_recebidas: number;
  valor_total_recebido: number;
  // Métricas de uso
  apostas_realizadas: number;
  apostas_ganhas: number;
  apostas_perdidas: number;
  apostas_pendentes: number;
  // Métricas de extração
  valor_total_extraido: number;
  taxa_extracao: number; // valor_extraido / valor_recebido
  taxa_conversao: number; // apostas_ganhas / apostas_realizadas
  // Saldo atual
  saldo_atual: number;
}

export interface FreebetMetrics {
  totalRecebido: number;
  totalExtraido: number;
  taxaExtracao: number;
  totalApostas: number;
  apostasGanhas: number;
  apostasPerdidas: number;
  apostasPendentes: number;
  taxaAcerto: number;
}

export interface ChartDataPoint {
  date: string;
  valor: number;
  acumulado?: number;
}

export interface BookmakerChartData {
  nome: string;
  recebido: number;
  extraido: number;
  taxa: number;
}
