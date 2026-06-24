export type FacetKey = "parceiro" | "casa" | "moeda" | "projeto" | "idade";

export type SortField = "data" | "valor";
export type SortDir = "asc" | "desc";

export interface SortState {
  field: SortField;
  dir: SortDir;
}

export interface FilterState {
  search: string;
  facets: Partial<Record<FacetKey, string[]>>;
  sort: SortState;
}

export const EMPTY_FILTER_STATE: FilterState = {
  search: "",
  facets: {},
  sort: { field: "data", dir: "asc" },
};

export interface ItemAdapter<T> {
  getId: (item: T) => string;
  getParceiro: (item: T) => string | null;
  getCasa: (item: T) => string | null;
  getMoeda: (item: T) => string;
  getProjeto: (item: T) => string | null;
  getValor: (item: T) => number;
  getCreatedAt: (item: T) => string;
  getSearchText: (item: T) => string;
}

export interface SavedView {
  id: string;
  name: string;
  state: FilterState;
  createdAt: string;
}

/** Buckets de idade (em dias a partir do created_at). */
export const AGE_BUCKETS: { key: string; label: string; max: number }[] = [
  { key: "today", label: "Hoje", max: 1 },
  { key: "7d", label: "≤ 7d", max: 7 },
  { key: "30d", label: "≤ 30d", max: 30 },
  { key: "older", label: "> 30d", max: Infinity },
];

export function ageBucketOf(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);
  for (const b of AGE_BUCKETS) {
    if (days <= b.max) return b.key;
  }
  return "older";
}

export const FACET_LABELS: Record<FacetKey, string> = {
  parceiro: "Parceiro",
  casa: "Casa",
  moeda: "Moeda",
  projeto: "Projeto",
  idade: "Idade",
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: "R$", USD: "US$", EUR: "€", GBP: "£", MYR: "RM",
  USDT: "US$", USDC: "US$", MXN: "MX$",
};

export function formatMoney(valor: number, moeda: string): string {
  const sym = CURRENCY_SYMBOLS[moeda] || moeda;
  return `${sym} ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Tipo legado mantido para compatibilidade com SaqueCardGrid. */
export interface SaquePendenteItem {
  id: string;
  valor: number;
  moeda: string;
  data_transacao: string;
  descricao: string | null;
  origem_bookmaker_id: string | null;
  destino_parceiro_id: string | null;
  destino_conta_bancaria_id: string | null;
  destino_wallet_id: string | null;
  bookmaker_nome?: string;
  bookmaker_logo_url?: string | null;
  parceiro_nome?: string;
  banco_nome?: string;
  wallet_nome?: string;
  projeto_nome?: string;
  coin?: string;
  moeda_origem?: string;
  valor_origem?: number;
  wallet_exchange?: string;
  [key: string]: any;
}