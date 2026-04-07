export interface FreebetRecebidaCompleta {
  id: string;
  bookmaker_id: string;
  bookmaker_nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  valor: number;
  moeda: string;
  motivo: string;
  data_recebida: string;
  data_validade: string | null;
  utilizada: boolean;
  data_utilizacao: string | null;
  aposta_id: string | null;
  status: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA";
  origem: "MANUAL" | "QUALIFICADORA" | "PROMOCAO";
  qualificadora_id: string | null;
  diasParaExpirar: number | null;
  tem_rollover: boolean;
  /** Valor restante derivado do ledger (valor - consumos ativos) */
  valor_restante?: number;
}

export interface BookmakerEstoque {
  id: string;
  nome: string;
  parceiro_nome: string | null;
  logo_url: string | null;
  saldo_freebet: number;
  /** Soma das freebets recebidas não utilizadas (fonte: freebets_recebidas) */
  saldo_nominal: number;
  moeda: string;
  freebets_count: number;
  freebets_pendentes: number;
  freebets_liberadas: number;
  proxima_expiracao: string | null;
}

export interface EstoqueMetrics {
  saldoDisponivel: number;
  totalRecebido: number;
  totalUtilizado: number;
  proximasExpirar: number;
  casasComFreebet: number;
  moedaConsolidacao: string;
  saldoPorMoeda?: { moeda: string; valor: number }[];
  recebidoPorMoeda?: { moeda: string; valor: number }[];
}

export interface UseFreebetEstoqueProps {
  projetoId: string;
  dataInicio?: Date;
  dataFim?: Date;
}

/** Query key factory for freebet estoque */
export const FREEBET_ESTOQUE_KEYS = {
  all: (projetoId: string) => ["freebet-estoque", projetoId] as const,
  withDates: (projetoId: string, dataInicio?: Date, dataFim?: Date) =>
    ["freebet-estoque", projetoId, dataInicio?.toISOString(), dataFim?.toISOString()] as const,
};
