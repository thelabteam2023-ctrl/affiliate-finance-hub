import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowUpDown, Zap, ExternalLink, TrendingUp, TrendingDown, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDateTime } from "@/utils/dateUtils";

interface Aposta {
  id: string;
  data_aposta: string;
  esporte: string;
  evento: string;
  mercado: string | null;
  selecao: string;
  odd: number;
  stake: number;
  stake_total?: number | null;
  resultado: string | null;
  lucro_prejuizo: number | null;
  fonte_entrada?: string | null;
  bookmaker_nome?: string;
  moeda_operacao?: string | null;
  stake_consolidado?: number | null;
  pl_consolidado?: number | null;
  odd_final?: number | null;
}

interface FonteAgregada {
  fonte: string;
  apostas: number;
  vencedoras: number;
  perdedoras: number;
  volume: number;
  lucro: number;
  roi: number;
  winRate: number;
  esportes: Map<string, { count: number; lucro: number }>;
  topEsportes: { nome: string; count: number; lucro: number }[];
  apostasLista: Aposta[];
}

type SortField = "volume" | "lucro" | "apostas" | "roi";

function getSourceColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

interface ValueBetFonteSectionProps {
  apostas: Aposta[];
  formatCurrency: (value: number) => string;
  projetoId: string;
}

export function ValueBetFonteSection({ apostas, formatCurrency, projetoId }: ValueBetFonteSectionProps) {
  const [sortField, setSortField] = useState<SortField>("lucro");
  const [selectedFonte, setSelectedFonte] = useState<FonteAgregada | null>(null);

  const formatPercent = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

  const fontesData = useMemo(() => {
    const map = new Map<string, FonteAgregada>();

    for (const a of apostas) {
      const fonte = a.fonte_entrada || "Manual";
      if (!map.has(fonte)) {
        map.set(fonte, {
          fonte,
          apostas: 0,
          vencedoras: 0,
          perdedoras: 0,
          volume: 0,
          lucro: 0,
          roi: 0,
          winRate: 0,
          esportes: new Map(),
          topEsportes: [],
          apostasLista: [],
        });
      }
      const f = map.get(fonte)!;
      f.apostas++;

      const stake = a.stake_consolidado ?? a.stake_total ?? a.stake ?? 0;
      const pl = a.pl_consolidado ?? a.lucro_prejuizo ?? 0;

      if (a.resultado === "GREEN" || a.resultado === "MEIO_GREEN") f.vencedoras++;
      if (a.resultado === "RED" || a.resultado === "MEIO_RED") f.perdedoras++;

      // Only count volume/lucro for settled bets
      const isSettled = a.resultado && a.resultado !== "PENDENTE";
      if (isSettled) {
        f.volume += stake;
        f.lucro += pl;
      }

      // Esportes
      const esporte = a.esporte || "Indefinido";
      if (!f.esportes.has(esporte)) f.esportes.set(esporte, { count: 0, lucro: 0 });
      const e = f.esportes.get(esporte)!;
      e.count++;
      if (isSettled) e.lucro += pl;

      f.apostasLista.push(a);
    }

    const result: FonteAgregada[] = [];
    for (const f of map.values()) {
      f.roi = f.volume > 0 ? (f.lucro / f.volume) * 100 : 0;
      const settled = f.vencedoras + f.perdedoras;
      f.winRate = settled > 0 ? (f.vencedoras / settled) * 100 : 0;
      f.topEsportes = Array.from(f.esportes.entries())
        .map(([nome, data]) => ({ nome, ...data }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
      result.push(f);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortField) {
        case "volume": return b.volume - a.volume;
        case "lucro": return b.lucro - a.lucro;
        case "apostas": return b.apostas - a.apostas;
        case "roi": return b.roi - a.roi;
        default: return 0;
      }
    });

    return result;
  }, [apostas, sortField]);

  const openHistoryModal = (fonte: FonteAgregada) => {
    setSelectedFonte(fonte);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-purple-400" />
          <h3 className="text-lg font-semibold">Análise por Fonte</h3>
          <Badge variant="secondary">{fontesData.length} fontes</Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={sortField} onValueChange={(v) => setSortField(v as SortField)}>
            <SelectTrigger className="h-7 w-[110px] text-xs border-muted/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lucro" className="text-xs">Lucro</SelectItem>
              <SelectItem value="volume" className="text-xs">Volume</SelectItem>
              <SelectItem value="apostas" className="text-xs">Qtd Apostas</SelectItem>
              <SelectItem value="roi" className="text-xs">ROI</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {fontesData.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Zap className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold">Nenhuma fonte registrada</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Registre apostas com fonte de entrada para ver a análise por fonte.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {fontesData.map((fonte) => {
            const color = getSourceColor(fonte.fonte);
            return (
              <Card
                key={fonte.fonte}
                className={cn(
                  "cursor-pointer transition-all hover:border-purple-500/30 hover:shadow-md",
                  fonte.lucro >= 0 ? "border-emerald-500/20" : "border-red-500/20"
                )}
                onClick={() => openHistoryModal(fonte)}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center shrink-0 text-white text-xs font-bold"
                      style={{ backgroundColor: color }}
                    >
                      {fonte.fonte.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="truncate">{fonte.fonte}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Apostas</span>
                      <span className="font-medium tabular-nums">{fonte.apostas}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Win Rate</span>
                      <span className="font-medium tabular-nums">{fonte.winRate.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Volume</span>
                      <span className="font-medium tabular-nums">{formatCurrency(fonte.volume)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ROI</span>
                      <span className={cn("font-semibold tabular-nums", fonte.roi >= 0 ? "text-emerald-400" : "text-red-400")}>
                        {formatPercent(fonte.roi)}
                      </span>
                    </div>
                  </div>
                  {/* Lucro destaque */}
                  <div className={cn(
                    "flex items-center justify-between rounded-md px-3 py-2 text-sm",
                    fonte.lucro >= 0 ? "bg-emerald-500/10" : "bg-red-500/10"
                  )}>
                    <span className="text-muted-foreground font-medium">Lucro</span>
                    <span className={cn("font-bold tabular-nums", fonte.lucro >= 0 ? "text-emerald-400" : "text-red-400")}>
                      {fonte.lucro >= 0 ? "+" : ""}{formatCurrency(fonte.lucro)}
                    </span>
                  </div>
                  {/* Top esportes */}
                  {fonte.topEsportes.length > 0 && (
                    <div className="pt-1 border-t border-border/50">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Top Esportes</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {fonte.topEsportes.slice(0, 3).map((e) => (
                          <Badge key={e.nome} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {e.nome} ({e.count})
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de histórico */}
      <Dialog open={!!selectedFonte} onOpenChange={(open) => !open && setSelectedFonte(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          {selectedFonte && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded flex items-center justify-center shrink-0 text-white text-xs font-bold"
                    style={{ backgroundColor: getSourceColor(selectedFonte.fonte) }}
                  >
                    {selectedFonte.fonte.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span>{selectedFonte.fonte}</span>
                    <p className="text-xs text-muted-foreground font-normal mt-0.5">
                      {selectedFonte.apostas} apostas · Win Rate {selectedFonte.winRate.toFixed(1)}% · ROI {formatPercent(selectedFonte.roi)}
                    </p>
                  </div>
                </DialogTitle>
              </DialogHeader>

              {/* KPI row */}
              <div className="grid grid-cols-4 gap-3 py-3 border-b border-border/50">
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Apostas</div>
                  <div className="text-lg font-bold tabular-nums">{selectedFonte.apostas}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Volume</div>
                  <div className="text-lg font-bold tabular-nums">{formatCurrency(selectedFonte.volume)}</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">Lucro</div>
                  <div className={cn("text-lg font-bold tabular-nums", selectedFonte.lucro >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {selectedFonte.lucro >= 0 ? "+" : ""}{formatCurrency(selectedFonte.lucro)}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-muted-foreground">ROI</div>
                  <div className={cn("text-lg font-bold tabular-nums", selectedFonte.roi >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {formatPercent(selectedFonte.roi)}
                  </div>
                </div>
              </div>

              {/* Esportes breakdown */}
              {selectedFonte.topEsportes.length > 0 && (
                <div className="py-3 border-b border-border/50">
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2 flex items-center gap-1.5">
                    <Trophy className="h-3 w-3" />
                    Esportes
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedFonte.topEsportes.map((e) => (
                      <div key={e.nome} className="flex items-center justify-between text-sm bg-muted/30 rounded px-2.5 py-1.5">
                        <span className="truncate">{e.nome}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-muted-foreground tabular-nums text-xs">{e.count} ops</span>
                          <span className={cn("font-medium tabular-nums text-xs", e.lucro >= 0 ? "text-emerald-400" : "text-red-400")}>
                            {e.lucro >= 0 ? "+" : ""}{formatCurrency(e.lucro)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bet history list */}
              <div className="flex-1 overflow-y-auto min-h-0 space-y-1.5 py-2">
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Histórico de Apostas
                </h4>
                {[...selectedFonte.apostasLista]
                  .sort((a, b) => parseLocalDateTime(b.data_aposta).getTime() - parseLocalDateTime(a.data_aposta).getTime())
                  .map((a) => {
                    const isGreen = a.resultado === "GREEN" || a.resultado === "MEIO_GREEN";
                    const isRed = a.resultado === "RED" || a.resultado === "MEIO_RED";
                    const isPending = !a.resultado || a.resultado === "PENDENTE";
                    const pl = a.pl_consolidado ?? a.lucro_prejuizo ?? 0;
                    const stake = a.stake_consolidado ?? a.stake_total ?? a.stake ?? 0;
                    const odd = a.odd_final ?? a.odd ?? 0;

                    return (
                      <div
                        key={a.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                          "bg-muted/20 hover:bg-muted/40"
                        )}
                      >
                        {/* Result indicator */}
                        <div className={cn(
                          "w-1.5 h-8 rounded-full shrink-0",
                          isGreen && "bg-emerald-400",
                          isRed && "bg-red-400",
                          isPending && "bg-blue-400",
                          !isGreen && !isRed && !isPending && "bg-muted-foreground"
                        )} />

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{a.evento || a.selecao || "—"}</span>
                            {a.esporte && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 shrink-0">
                                {a.esporte}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                            <span>{format(parseLocalDateTime(a.data_aposta), "dd/MM/yy HH:mm", { locale: ptBR })}</span>
                            {a.bookmaker_nome && <span>· {a.bookmaker_nome}</span>}
                            <span>· Odd {odd.toFixed(2)}</span>
                          </div>
                        </div>

                        {/* Stake + P&L */}
                        <div className="text-right shrink-0">
                          <div className="text-xs text-muted-foreground tabular-nums">{formatCurrency(stake)}</div>
                          {!isPending && (
                            <div className={cn("text-xs font-medium tabular-nums", isGreen ? "text-emerald-400" : isRed ? "text-red-400" : "text-muted-foreground")}>
                              {pl >= 0 ? "+" : ""}{formatCurrency(pl)}
                            </div>
                          )}
                          {isPending && (
                            <div className="text-xs text-blue-400 font-medium">Aberta</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
