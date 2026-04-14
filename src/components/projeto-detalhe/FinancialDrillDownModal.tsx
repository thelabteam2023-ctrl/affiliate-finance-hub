import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Info,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * Indicator configuration: maps each financial metric to its ledger query
 */
export interface IndicatorConfig {
  key: string;
  label: string;
  description: string;
  tipoTransacao: string[];
  statusFilter?: string[];
  /** For bonus, use a different table */
  source?: "ledger" | "bonus";
  /** Direction filter for ajuste_saldo */
  ajusteDirecao?: string;
  /** Special flag for ganhoConfirmacao: only saques with valor_confirmado != valor */
  isConfirmationGain?: boolean;
}

export const INDICATOR_CONFIGS: Record<string, IndicatorConfig> = {
  depositosReais: {
    key: "depositosReais",
    label: "Depósitos Reais",
    description: "Dinheiro efetivamente transferido para as casas neste projeto. Soma de todas as transações do tipo DEPÓSITO com status CONFIRMADO.",
    tipoTransacao: ["DEPOSITO"],
    statusFilter: ["CONFIRMADO"],
  },
  depositosVirtuais: {
    key: "depositosVirtuais",
    label: "Capital Inicial (vinculação)",
    description: "Saldo já existente nas casas no momento da vinculação ao projeto. Representa a baseline contábil — não é dinheiro novo.",
    tipoTransacao: ["DEPOSITO_VIRTUAL"],
    statusFilter: ["CONFIRMADO"],
  },
  depositosTotal: {
    key: "depositosTotal",
    label: "Total Depósitos",
    description: "Soma de depósitos reais + capital inicial das casas vinculadas (DEPÓSITO + DEPÓSITO_VIRTUAL confirmados).",
    tipoTransacao: ["DEPOSITO", "DEPOSITO_VIRTUAL"],
    statusFilter: ["CONFIRMADO"],
  },
  saquesRecebidos: {
    key: "saquesRecebidos",
    label: "Saques Recebidos",
    description: "Valor total de saques confirmados. Usa o valor_confirmado quando disponível (pós-conciliação).",
    tipoTransacao: ["SAQUE", "SAQUE_VIRTUAL"],
    statusFilter: ["CONFIRMADO"],
  },
  saquesPendentes: {
    key: "saquesPendentes",
    label: "Saques Pendentes",
    description: "Saques solicitados que ainda não foram confirmados/conciliados. Representam expectativa de recebimento.",
    tipoTransacao: ["SAQUE", "SAQUE_VIRTUAL"],
    statusFilter: ["PENDENTE"],
  },
  cashbackLiquido: {
    key: "cashbackLiquido",
    label: "Cashback Líquido",
    description: "Cashback recebido menos estornos de cashback. Receita operacional interna das casas.",
    tipoTransacao: ["CASHBACK_MANUAL", "CASHBACK_ESTORNO"],
    statusFilter: ["CONFIRMADO"],
  },
  girosGratis: {
    key: "girosGratis",
    label: "Giros Grátis",
    description: "Valor total de giros grátis creditados nas casas do projeto.",
    tipoTransacao: ["GIRO_GRATIS"],
    statusFilter: ["CONFIRMADO"],
  },
  ajustes: {
    key: "ajustes",
    label: "Ajustes de Saldo",
    description: "Correções feitas quando o saldo da casa diverge do esperado — por exemplo, variações de odds em décimos que geram pequenas diferenças.",
    tipoTransacao: ["AJUSTE_SALDO"],
    statusFilter: ["CONFIRMADO"],
  },
  resultadoCambial: {
    key: "resultadoCambial",
    label: "Resultado Cambial",
    description: "Diferença entre o valor solicitado no saque e o valor efetivamente recebido, causada por variação cambial.",
    tipoTransacao: ["GANHO_CAMBIAL", "PERDA_CAMBIAL"],
    statusFilter: ["CONFIRMADO"],
  },
  perdaOp: {
    key: "perdaOp",
    label: "Perdas Operacionais",
    description: "Capital perdido por incidentes operacionais — como contas bloqueadas, saldos retidos ou fundos irrecuperáveis.",
    tipoTransacao: ["PERDA_OPERACIONAL"],
    statusFilter: ["CONFIRMADO"],
  },
  bonusGanhos: {
    key: "bonusGanhos",
    label: "Bônus Ganhos",
    description: "Valor total de bônus creditados nas casas de apostas. Capital promocional recebido que contribui para o patrimônio do projeto.",
    tipoTransacao: [],
    source: "bonus",
  },
  ganhoConfirmacao: {
    key: "ganhoConfirmacao",
    label: "Ganho de Confirmação",
    description: "Diferença positiva entre valor solicitado e valor confirmado em saques. Ganho apurado automaticamente na conciliação.",
    tipoTransacao: ["SAQUE", "SAQUE_VIRTUAL"],
    statusFilter: ["CONFIRMADO"],
    /** Special: only saques where valor_confirmado differs from valor */
    isConfirmationGain: true,
  },
};

interface DrillDownTransaction {
  id: string;
  tipo_transacao: string;
  status: string;
  valor: number;
  valor_confirmado?: number | null;
  moeda: string;
  data_transacao: string;
  descricao?: string | null;
  origem_parceiro_id?: string | null;
  destino_parceiro_id?: string | null;
  ajuste_direcao?: string | null;
  // joined
  origem_parceiro_nome?: string;
  destino_parceiro_nome?: string;
  origem_bookmaker_nome?: string;
  destino_bookmaker_nome?: string;
}

interface BonusTransaction {
  id: string;
  bonus_amount: number;
  currency: string;
  status: string;
  credited_at: string;
  bonus_type: string;
  bookmaker_nome?: string;
}

function applyDateFilter<T extends { gte: (col: string, val: string) => T; lte: (col: string, val: string) => T }>(
  query: T,
  dateRange?: { from: string; to: string } | null,
  dateColumn = "data_transacao"
): T {
  if (!dateRange) return query;
  return query.gte(dateColumn, `${dateRange.from}T00:00:00.000Z`).lte(dateColumn, `${dateRange.to}T23:59:59.999Z`);
}

async function fetchDrillDownLedger(
  config: IndicatorConfig,
  projetoId: string,
  dateRange?: { from: string; to: string } | null
) {
  let query = supabase
    .from("cash_ledger")
    .select(
      "id, tipo_transacao, status, valor, valor_confirmado, moeda, data_transacao, descricao, ajuste_direcao, origem_bookmaker_id, destino_bookmaker_id, origem_parceiro_id, destino_parceiro_id"
    )
    .eq("projeto_id_snapshot", projetoId)
    .in("tipo_transacao", config.tipoTransacao)
    .order("data_transacao", { ascending: false });

  if (config.statusFilter && config.statusFilter.length > 0) {
    query = query.in("status", config.statusFilter);
  }

  query = applyDateFilter(query, dateRange);

  const { data, error } = await query.limit(5000);
  if (error) throw error;

  // Fetch bookmaker/parceiro names in batch
  const bmIds = new Set<string>();
  const parcIds = new Set<string>();
  (data || []).forEach((r: any) => {
    if (r.origem_bookmaker_id) bmIds.add(r.origem_bookmaker_id);
    if (r.destino_bookmaker_id) bmIds.add(r.destino_bookmaker_id);
    if (r.origem_parceiro_id) parcIds.add(r.origem_parceiro_id);
    if (r.destino_parceiro_id) parcIds.add(r.destino_parceiro_id);
  });

  const [bmRes, parcRes] = await Promise.all([
    bmIds.size > 0 ? supabase.from("bookmakers").select("id, nome").in("id", Array.from(bmIds)) : { data: [] },
    parcIds.size > 0 ? supabase.from("parceiros").select("id, nome").in("id", Array.from(parcIds)) : { data: [] },
  ]);

  const bmMap = new Map((bmRes.data || []).map((b: any) => [b.id, b.nome]));
  const parcMap = new Map((parcRes.data || []).map((p: any) => [p.id, p.nome]));
  
  return (data || []).map((row: any) => ({
    id: row.id,
    tipo_transacao: row.tipo_transacao,
    status: row.status,
    valor: row.valor,
    valor_confirmado: row.valor_confirmado,
    moeda: row.moeda,
    data_transacao: row.data_transacao,
    descricao: row.descricao,
    ajuste_direcao: row.ajuste_direcao,
    origem_bookmaker_nome: bmMap.get(row.origem_bookmaker_id),
    destino_bookmaker_nome: bmMap.get(row.destino_bookmaker_id),
    origem_parceiro_nome: parcMap.get(row.origem_parceiro_id),
    destino_parceiro_nome: parcMap.get(row.destino_parceiro_id),
  })) as DrillDownTransaction[];
}

async function fetchDrillDownBonus(
  projetoId: string,
  dateRange?: { from: string; to: string } | null
) {
  let query = supabase
    .from("project_bookmaker_link_bonuses")
    .select("id, bonus_amount, currency, status, credited_at, bonus_type, project_bookmaker_link_id")
    .eq("project_id", projetoId)
    .in("status", ["credited", "finalized"]);

  if (dateRange) {
    query = query.gte("credited_at", dateRange.from).lte("credited_at", dateRange.to);
  }

  const { data, error } = await query.order("credited_at", { ascending: false }).limit(5000);
  if (error) throw error;

  // Skip bookmaker name resolution for bonus — just show bonus_type
  const bmNameMap = new Map<string, string>();

  return (data || []).map((row: any) => ({
    id: row.id,
    bonus_amount: row.bonus_amount,
    currency: row.currency || "BRL",
    status: row.status,
    credited_at: row.credited_at,
    bonus_type: row.bonus_type || "bonus",
    bookmaker_nome: bmNameMap.get(row.project_bookmaker_link_id) || undefined,
  })) as BonusTransaction[];
}

const STATUS_LABELS: Record<string, string> = {
  CONFIRMADO: "Creditado",
  PENDENTE: "Pendente",
  CANCELADO: "Cancelado",
  ESTORNADO: "Estornado",
  RECUSADO: "Recusado",
  credited: "Creditado",
  finalized: "Finalizado",
};

const TIPO_LABELS: Record<string, string> = {
  DEPOSITO: "Depósito",
  DEPOSITO_VIRTUAL: "Capital Inicial",
  SAQUE: "Saque",
  SAQUE_VIRTUAL: "Saque Virtual",
  CASHBACK_MANUAL: "Cashback",
  CASHBACK_ESTORNO: "Estorno Cashback",
  GIRO_GRATIS: "Giro Grátis",
  AJUSTE_SALDO: "Ajuste de Saldo",
  GANHO_CAMBIAL: "Ganho Cambial",
  PERDA_CAMBIAL: "Perda Cambial",
  PERDA_OPERACIONAL: "Perda Operacional",
};

function StatusBadge({ status }: { status: string }) {
  const upper = status.toUpperCase();
  const label = STATUS_LABELS[status] || STATUS_LABELS[upper] || status;

  if (upper === "CONFIRMADO" || status === "credited" || status === "finalized") {
    return (
      <Badge variant="outline" className="text-[9px] h-4 bg-emerald-500/10 text-emerald-500 border-emerald-500/30 gap-0.5">
        <CheckCircle2 className="h-2.5 w-2.5" />
        {label}
      </Badge>
    );
  }
  if (upper === "PENDENTE") {
    return (
      <Badge variant="outline" className="text-[9px] h-4 bg-amber-500/10 text-amber-500 border-amber-500/30 gap-0.5">
        <Clock className="h-2.5 w-2.5" />
        {label}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[9px] h-4 bg-red-500/10 text-red-500 border-red-500/30 gap-0.5">
      <XCircle className="h-2.5 w-2.5" />
      {label}
    </Badge>
  );
}

interface FinancialDrillDownModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  indicatorKey: string;
  projetoId: string;
  dateRange?: { from: string; to: string } | null;
  totalValue: number;
}

type SortField = "data" | "valor";
type SortDir = "asc" | "desc";

export function FinancialDrillDownModal({
  open,
  onOpenChange,
  indicatorKey,
  projetoId,
  dateRange,
  totalValue,
}: FinancialDrillDownModalProps) {
  const config = INDICATOR_CONFIGS[indicatorKey];
  const isBonus = config?.source === "bonus";
  const { formatCurrency, convertToConsolidationOficial } = useProjetoCurrency(projetoId);

  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("data");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ["drilldown-ledger", indicatorKey, projetoId, dateRange?.from, dateRange?.to],
    queryFn: () => fetchDrillDownLedger(config, projetoId, dateRange),
    enabled: open && !!config && !isBonus,
    staleTime: 30_000,
  });

  const { data: bonusData, isLoading: bonusLoading } = useQuery({
    queryKey: ["drilldown-bonus", projetoId, dateRange?.from, dateRange?.to],
    queryFn: () => fetchDrillDownBonus(projetoId, dateRange),
    enabled: open && isBonus,
    staleTime: 30_000,
  });

  const isLoading = isBonus ? bonusLoading : ledgerLoading;

  // Unified row processing
  const processedRows = useMemo(() => {
    if (isBonus) {
      return (bonusData || []).map((b) => ({
        id: b.id,
        tipo: b.bonus_type,
        status: b.status,
        valor: b.bonus_amount,
        valorEfetivo: b.bonus_amount,
        moeda: b.currency,
        data: b.credited_at,
        origem: b.bookmaker_nome || "—",
        descricao: null as string | null,
      }));
    }

    return (ledgerData || []).map((t) => {
      const valorEfetivo = (indicatorKey === "saquesRecebidos" || indicatorKey === "ganhoConfirmacao")
        ? (t.valor_confirmado ?? t.valor)
        : t.valor;
      const origem = t.origem_bookmaker_nome || t.destino_bookmaker_nome || t.origem_parceiro_nome || t.destino_parceiro_nome || "—";
      return {
        id: t.id,
        tipo: t.tipo_transacao,
        status: t.status,
        valor: t.valor,
        valorEfetivo,
        moeda: t.moeda,
        data: t.data_transacao,
        origem,
        descricao: t.descricao,
        ajuste_direcao: t.ajuste_direcao,
      };
    });
  }, [ledgerData, bonusData, isBonus, indicatorKey]);

  // Apply filters, search, sorting
  const filteredRows = useMemo(() => {
    let rows = [...processedRows];

    // Status filter
    if (statusFilter !== "all") {
      rows = rows.filter((r) => r.status.toUpperCase() === statusFilter.toUpperCase());
    }

    // Search
    if (search.trim()) {
      const term = search.toLowerCase();
      rows = rows.filter((r) =>
        r.id.toLowerCase().includes(term) ||
        r.origem.toLowerCase().includes(term) ||
        (r.descricao || "").toLowerCase().includes(term) ||
        (r.tipo || "").toLowerCase().includes(term)
      );
    }

    // Sort
    rows.sort((a, b) => {
      const mul = sortDir === "asc" ? 1 : -1;
      if (sortField === "data") {
        return mul * (new Date(a.data).getTime() - new Date(b.data).getTime());
      }
      return mul * (Math.abs(a.valorEfetivo) - Math.abs(b.valorEfetivo));
    });

    return rows;
  }, [processedRows, search, sortField, sortDir, statusFilter]);

  // Aggregations
  const aggregations = useMemo(() => {
    const porMoeda: Record<string, { total: number; creditado: number; pendente: number }> = {};

    processedRows.forEach((r) => {
      const moeda = (r.moeda || "BRL").toUpperCase();
      if (!porMoeda[moeda]) porMoeda[moeda] = { total: 0, creditado: 0, pendente: 0 };
      const val = Math.abs(r.valorEfetivo);
      porMoeda[moeda].total += val;
      const statusUp = (r.status || "").toUpperCase();
      if (statusUp === "CONFIRMADO" || r.status === "credited" || r.status === "finalized") {
        porMoeda[moeda].creditado += val;
      } else if (statusUp === "PENDENTE") {
        porMoeda[moeda].pendente += val;
      }
    });

    return { porMoeda, count: processedRows.length };
  }, [processedRows]);

  // Available statuses for filter
  const availableStatuses = useMemo(() => {
    const set = new Set<string>();
    processedRows.forEach((r) => set.add(r.status.toUpperCase()));
    return Array.from(set);
  }, [processedRows]);

  if (!config) return null;

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="p-4 pb-3 border-b border-border/40">
          <DialogTitle className="text-sm font-bold flex items-center gap-2">
            {config.label}
            <Tooltip>
              <TooltipTrigger>
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {config.description}
              </TooltipContent>
            </Tooltip>
          </DialogTitle>

          {/* Period badge */}
          {dateRange && (
            <span className="text-[10px] text-muted-foreground">
              Período: {format(parseISO(dateRange.from), "dd/MM/yyyy")} – {format(parseISO(dateRange.to), "dd/MM/yyyy")}
            </span>
          )}

          {/* Aggregation summary */}
          <div className="flex flex-wrap items-center gap-3 mt-2">
            <div className="flex items-center gap-1.5 bg-muted/50 rounded-md px-2.5 py-1.5">
              <span className="text-[10px] text-muted-foreground">{aggregations.count} transações</span>
            </div>
            {Object.entries(aggregations.porMoeda).map(([moeda, vals]) => (
              <div key={moeda} className="flex items-center gap-2 bg-muted/50 rounded-md px-2.5 py-1.5">
                <span className="text-[10px] font-medium">Total: {formatCurrency(vals.total)}</span>
                {vals.creditado > 0 && (
                  <span className="text-[10px] text-emerald-500">Creditado: {formatCurrency(vals.creditado)}</span>
                )}
                {vals.pendente > 0 && (
                  <span className="text-[10px] text-amber-500">Pendente: {formatCurrency(vals.pendente)}</span>
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/20">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Buscar por ID, origem, descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 text-xs pl-8"
            />
          </div>
          {availableStatuses.length > 1 && (
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px] h-8 text-xs">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos status</SelectItem>
                {availableStatuses.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s] || s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Table */}
        <ScrollArea className="flex-1 min-h-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              Nenhuma transação encontrada
            </div>
          ) : (
            <div className="min-w-0">
              {/* Table header */}
              <div className="grid grid-cols-[minmax(90px,1fr)_80px_80px_minmax(100px,1.5fr)_100px] gap-2 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/20 sticky top-0 bg-background z-10">
                <button className="flex items-center gap-1 text-left" onClick={() => toggleSort("data")}>
                  Data <SortIcon field="data" />
                </button>
                <span>Tipo</span>
                <span>Status</span>
                <span>Origem</span>
                <button className="flex items-center gap-1 justify-end" onClick={() => toggleSort("valor")}>
                  Valor <SortIcon field="valor" />
                </button>
              </div>

              {/* Rows */}
              {filteredRows.map((row) => (
                <div
                  key={row.id}
                  className="grid grid-cols-[minmax(90px,1fr)_80px_80px_minmax(100px,1.5fr)_100px] gap-2 px-4 py-2 text-[11px] border-b border-border/10 hover:bg-muted/30 transition-colors items-center"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {format(parseISO(row.data), "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {format(parseISO(row.data), "HH:mm")}
                    </span>
                  </div>
                  <span className="text-muted-foreground truncate" title={row.tipo}>
                    {TIPO_LABELS[row.tipo] || row.tipo}
                  </span>
                  <StatusBadge status={row.status} />
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="truncate cursor-default">{row.origem}</span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs max-w-xs">
                      <p>{row.origem}</p>
                      {row.descricao && <p className="text-muted-foreground mt-0.5">{row.descricao}</p>}
                      <p className="text-muted-foreground/70 mt-1 font-mono text-[9px]">{row.id.slice(0, 8)}…</p>
                    </TooltipContent>
                  </Tooltip>
                  <span className="font-mono tabular-nums text-right font-medium">
                    {formatCurrency(Math.abs(row.valorEfetivo))}
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer with calculation explanation */}
        <div className="border-t border-border/40 px-4 py-2.5 bg-muted/20">
          <div className="flex items-start gap-1.5">
            <Info className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              <span className="font-medium">Como é calculado:</span>{" "}
              {config.description}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
