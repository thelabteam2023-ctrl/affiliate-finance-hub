import { useState, useMemo } from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Building2, Clock, TrendingUp, TrendingDown, HelpCircle, Search, ArrowUpDown, X } from "lucide-react";
import { format } from "date-fns";
import {
  type GlobalLimitationStats,
  STRATEGIC_PROFILE_CONFIG,
  type StrategicProfile,
} from "@/hooks/useLimitationEvents";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BookmakerLimitationDetailModal } from "@/components/bookmakers/BookmakerLimitationDetailModal";

const CURRENCY_SYMBOLS: Record<string, string> = {
  BRL: 'R$', USD: '$', EUR: '€', GBP: '£', MYR: 'RM', USDT: '$', USDC: '$',
};

function formatWithCurrency(value: number, moeda?: string): string {
  const symbol = CURRENCY_SYMBOLS[moeda || 'BRL'] || moeda || 'R$';
  const formatted = Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${value < 0 ? '-' : ''}${symbol} ${formatted}`;
}

interface LimitationGlobalRankingTableProps {
  stats: GlobalLimitationStats[];
}

type SortMode = "events" | "avg_bets" | "volume" | "pl" | "withdrawal";
type ProfileFilter = "all" | StrategicProfile;

const SORT_LABELS: Record<SortMode, string> = {
  events: "Mais eventos",
  avg_bets: "Média apostas",
  volume: "Maior volume",
  pl: "Maior lucro",
  withdrawal: "Tempo saque",
};

const PROFILE_FILTER_OPTIONS: { value: ProfileFilter; label: string }[] = [
  { value: "all", label: "Todos perfis" },
  ...Object.entries(STRATEGIC_PROFILE_CONFIG).map(([key, cfg]) => ({
    value: key as ProfileFilter,
    label: cfg.label,
  })),
];

export function LimitationGlobalRankingTable({ stats }: LimitationGlobalRankingTableProps) {
  const [selectedBookmaker, setSelectedBookmaker] = useState<GlobalLimitationStats | null>(null);
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("events");
  const [profileFilter, setProfileFilter] = useState<ProfileFilter>("all");

  const filtered = useMemo(() => {
    let result = [...stats];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(s => s.bookmaker_nome.toLowerCase().includes(q));
    }

    // Profile filter
    if (profileFilter !== "all") {
      result = result.filter(s => s.strategic_profile === profileFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortMode) {
        case "events": return b.total_events - a.total_events;
        case "avg_bets": return b.avg_bets_before_limitation - a.avg_bets_before_limitation;
        case "volume": return (b.volume_total ?? 0) - (a.volume_total ?? 0);
        case "pl": return (b.lucro_prejuizo_total ?? 0) - (a.lucro_prejuizo_total ?? 0);
        case "withdrawal": return (b.avg_withdrawal_days ?? 999) - (a.avg_withdrawal_days ?? 999);
        default: return 0;
      }
    });

    return result;
  }, [stats, search, sortMode, profileFilter]);

  // Totals grouped by currency
  const totalsByMoeda = useMemo(() => {
    const volMap = new Map<string, number>();
    const plMap = new Map<string, number>();
    filtered.forEach((s) => {
      const moeda = s.moeda_volume || "BRL";
      volMap.set(moeda, (volMap.get(moeda) || 0) + (s.volume_total ?? 0));
      plMap.set(moeda, (plMap.get(moeda) || 0) + (s.lucro_prejuizo_total ?? 0));
    });
    const moedas = Array.from(new Set([...volMap.keys(), ...plMap.keys()])).sort();
    return moedas.map((moeda) => ({
      moeda,
      volume: volMap.get(moeda) || 0,
      pl: plMap.get(moeda) || 0,
    }));
  }, [filtered]);

  if (stats.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        Nenhum dado de limitação global disponível.
      </div>
    );
  }

  return (
    <>
      {/* Totals by currency */}
      {totalsByMoeda.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <span className="text-[10px] text-muted-foreground font-medium">Totais:</span>
          {totalsByMoeda.map(({ moeda, volume, pl }) => (
            <div key={moeda} className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[11px] font-semibold px-2 py-0.5 border-border">
                Vol: {formatWithCurrency(volume, moeda)}
              </Badge>
              <Badge
                variant="outline"
                className={`text-[11px] font-semibold px-2 py-0.5 border-border ${
                  pl > 0 ? "text-emerald-500" : pl < 0 ? "text-red-500" : "text-muted-foreground"
                }`}
              >
                P&L: {formatWithCurrency(pl, moeda)}
              </Badge>
              <span className="text-[9px] text-muted-foreground">{moeda}</span>
            </div>
          ))}
        </div>
      )}

      {/* Smart Filter Bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar casa..."
            className="h-8 pl-8 pr-8 text-xs"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Select value={profileFilter} onValueChange={(v) => setProfileFilter(v as ProfileFilter)}>
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROFILE_FILTER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
          <SelectTrigger className="h-8 w-[150px] text-xs" icon={<ArrowUpDown className="h-3.5 w-3.5" />}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SORT_LABELS).map(([k, label]) => (
              <SelectItem key={k} value={k}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(search || profileFilter !== "all") && (
          <Badge variant="secondary" className="text-[10px] h-6">
            {filtered.length} de {stats.length}
          </Badge>
        )}
      </div>

      <div className="rounded-md border border-border/50 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[180px]">Bookmaker</TableHead>
              <TableHead className="text-center">Eventos</TableHead>
              <TableHead className="text-center">Vínculos</TableHead>
              <TableHead className="text-center">Média Apostas</TableHead>
              <TableHead className="text-center w-[180px]">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center justify-center gap-1">
                        Distribuição
                        <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[260px] p-3 text-xs space-y-1.5">
                      <p className="font-medium">Velocidade de limitação:</p>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        <span><strong>Rápida</strong> — limitou em até 5 apostas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-yellow-500" />
                        <span><strong>Moderada</strong> — limitou entre 6-10 apostas</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-blue-500" />
                        <span><strong>Tardia</strong> — limitou após 10+ apostas</span>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </TableHead>
              <TableHead className="text-center">Perfil Global</TableHead>
              <TableHead className="text-right">Volume Total</TableHead>
              <TableHead className="text-right">Lucro/Prejuízo</TableHead>
              <TableHead className="text-center">Tempo Saque</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground text-sm">
                  Nenhuma casa encontrada com os filtros aplicados.
                </TableCell>
              </TableRow>
            ) : null}
            {filtered.map((s) => {
              const profileConfig = STRATEGIC_PROFILE_CONFIG[s.strategic_profile as StrategicProfile] || STRATEGIC_PROFILE_CONFIG.low_data;

              return (
                <TableRow
                  key={s.bookmaker_catalogo_id}
                  className="cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setSelectedBookmaker(s)}
                >
                  {/* Bookmaker */}
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        {s.logo_url ? <AvatarImage src={s.logo_url} /> : null}
                        <AvatarFallback className="text-[8px]">
                          <Building2 className="h-3 w-3" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-sm truncate max-w-[130px]">
                        {s.bookmaker_nome}
                      </span>
                    </div>
                  </TableCell>

                  {/* Eventos */}
                  <TableCell className="text-center font-semibold">
                    {s.total_events}
                  </TableCell>

                  {/* Vínculos */}
                  <TableCell className="text-center text-sm">
                    {s.total_vinculos}
                  </TableCell>

                  {/* Média */}
                  <TableCell className="text-center text-sm">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          {s.avg_bets_before_limitation}
                        </TooltipTrigger>
                        <TooltipContent className="text-xs">
                          Desvio padrão: {s.stddev_bets ?? "N/A"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>

                  {/* Distribuição */}
                  <TableCell>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex h-4 rounded-full overflow-hidden bg-muted/50">
                            {s.early_pct > 0 && (
                              <div className="bg-red-500/80 h-full" style={{ width: `${s.early_pct}%` }} />
                            )}
                            {s.mid_pct > 0 && (
                              <div className="bg-yellow-500/80 h-full" style={{ width: `${s.mid_pct}%` }} />
                            )}
                            {s.late_pct > 0 && (
                              <div className="bg-blue-500/80 h-full" style={{ width: `${s.late_pct}%` }} />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="p-2 text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            Rápida (1-5): {s.early_count} ({s.early_pct}%)
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-yellow-500" />
                            Moderada (6-10): {s.mid_count} ({s.mid_pct}%)
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-blue-500" />
                            Tardia (10+): {s.late_count} ({s.late_pct}%)
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>

                  {/* Perfil */}
                  <TableCell className="text-center">
                    <Badge
                      variant="outline"
                      className={`text-xs border-transparent ${profileConfig.bgColor} ${profileConfig.color}`}
                    >
                      {profileConfig.label}
                    </Badge>
                  </TableCell>

                  {/* Volume Total */}
                  <TableCell className="text-right text-sm font-medium">
                    {formatWithCurrency(s.volume_total ?? 0, s.moeda_volume)}
                  </TableCell>

                  {/* Lucro/Prejuízo */}
                  <TableCell className="text-right text-sm font-medium">
                    {(() => {
                      const pl = s.lucro_prejuizo_total ?? 0;
                      const isPositive = pl > 0;
                      const isNegative = pl < 0;
                      return (
                        <span className={`flex items-center justify-end gap-1 ${isPositive ? "text-emerald-500" : isNegative ? "text-red-500" : "text-muted-foreground"}`}>
                          {isPositive && <TrendingUp className="h-3 w-3" />}
                          {isNegative && <TrendingDown className="h-3 w-3" />}
                          {formatWithCurrency(pl, s.moeda_volume)}
                        </span>
                      );
                    })()}
                  </TableCell>

                  {/* Tempo Médio de Saque */}
                  <TableCell className="text-center">
                    {s.avg_withdrawal_days != null ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <div className="flex items-center justify-center gap-1 text-xs">
                              <Clock className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">
                                {s.avg_withdrawal_days === 0
                                  ? "< 1d"
                                  : `${s.avg_withdrawal_days}d`}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="text-xs">
                            Média de {s.total_confirmed_withdrawals} saque(s) confirmado(s)
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>

                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {selectedBookmaker && (
        <BookmakerLimitationDetailModal
          open={!!selectedBookmaker}
          onOpenChange={(open) => !open && setSelectedBookmaker(null)}
          bookmakerCatalogoId={selectedBookmaker.bookmaker_catalogo_id}
          bookmakerNome={selectedBookmaker.bookmaker_nome}
          logoUrl={selectedBookmaker.logo_url}
        />
      )}
    </>
  );
}
