import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ArrowUpDown, Trophy, Info } from "lucide-react";
import { format, parseISO } from "date-fns";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Area,
  AreaChart,
  ReferenceLine,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { ODD_RANGES, RawBet, Resultado } from "@/hooks/useValueBetLabData";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  marketName: string | null;
  sportLabel: string;
  /** All bets already scoped to sport+projects+period (filteredBetsForTab). */
  bets: RawBet[];
}

const RESULT_COLORS: Record<string, string> = {
  GREEN: "#22c55e",
  MEIO_GREEN: "#14b8a6",
  MEIO_RED: "#f97316",
  RED: "#ef4444",
  VOID: "#6b7280",
};

const RESULT_LABEL: Record<string, string> = {
  GREEN: "Green",
  MEIO_GREEN: "Meio Green",
  MEIO_RED: "Meio Red",
  RED: "Red",
  VOID: "Void",
};

function getOddRange(odd: number | null): string {
  if (odd === null || odd === undefined) return "N/A";
  const r = ODD_RANGES.find((x) => odd >= x.min && odd <= x.max);
  return r ? r.label : "Outras";
}

function stakeOf(b: RawBet) {
  return Number(b.stake_consolidado ?? b.valor_brl_referencia ?? b.stake_total ?? 0);
}
function profitOf(b: RawBet) {
  return Number(b.pl_consolidado ?? b.lucro_prejuizo ?? 0);
}
function fmtMoney(n: number) {
  return `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtPct(n: number) {
  return `${n.toFixed(2)}%`;
}
function fmtPctSigned(n: number) {
  const s = n >= 0 ? "+" : "";
  return `${s}${n.toFixed(2)}%`;
}

function calcMetrics(bets: RawBet[]) {
  const total = bets.length;
  const voids = bets.filter((b) => b.resultado === "VOID").length;
  const validas = total - voids;
  const stake = bets.reduce((a, b) => a + stakeOf(b), 0);
  const profit = bets.reduce((a, b) => a + profitOf(b), 0);
  const greens = bets.filter((b) => b.resultado === "GREEN").length;
  const meioGreens = bets.filter((b) => b.resultado === "MEIO_GREEN").length;
  const meioReds = bets.filter((b) => b.resultado === "MEIO_RED").length;
  const reds = bets.filter((b) => b.resultado === "RED").length;
  const roi = stake > 0 ? (profit / stake) * 100 : 0;
  const winRate = validas > 0 ? ((greens + meioGreens * 0.5) / validas) * 100 : 0;
  return { total, validas, stake, profit, roi, winRate, greens, meioGreens, meioReds, reds, voids };
}

type SortKey =
  | "data"
  | "evento"
  | "selecao"
  | "odd"
  | "faixa"
  | "stake"
  | "lucro"
  | "resultado"
  | "casa";

const PAGE_SIZE = 50;

export function MarketDrillDownModal({
  open,
  onOpenChange,
  marketName,
  sportLabel,
  bets,
}: Props) {
  const [search, setSearch] = useState("");
  const [filterRange, setFilterRange] = useState<string>("ALL");
  const [filterResult, setFilterResult] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("data");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const marketBets = useMemo(() => {
    if (!marketName) return [];
    return bets.filter((b) => {
      const m = b.mercado && b.mercado.trim() !== "" ? b.mercado : "Geral";
      return m === marketName;
    });
  }, [bets, marketName]);

  const kpis = useMemo(() => calcMetrics(marketBets), [marketBets]);

  const oddRangeRows = useMemo(() => {
    const rows = ODD_RANGES.map((r) => {
      const sub = marketBets.filter((b) => b.odd !== null && b.odd >= r.min && b.odd <= r.max);
      return { range: r.label, ...calcMetrics(sub) };
    });
    // include N/A bucket
    const naBets = marketBets.filter((b) => b.odd === null || b.odd === undefined);
    if (naBets.length > 0) {
      rows.push({ range: "N/A", ...calcMetrics(naBets) });
    }
    return rows.filter((r) => r.total > 0);
  }, [marketBets]);

  const bestOddRange = useMemo(() => {
    const eligible = oddRangeRows.filter((r) => r.total >= 3);
    if (eligible.length === 0) return null;
    return eligible.reduce((best, r) => (r.roi > best.roi ? r : best), eligible[0]);
  }, [oddRangeRows]);

  const monthlyRows = useMemo(() => {
    const map = new Map<string, { month: string; profit: number; stake: number }>();
    marketBets.forEach((b) => {
      if (!b.data_aposta) return;
      const key = b.data_aposta.slice(0, 7); // YYYY-MM
      const entry = map.get(key) ?? { month: key, profit: 0, stake: 0 };
      entry.profit += profitOf(b);
      entry.stake += stakeOf(b);
      map.set(key, entry);
    });
    return Array.from(map.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => ({
        ...r,
        label: format(parseISO(`${r.month}-01`), "MM/yy"),
        roi: r.stake > 0 ? (r.profit / r.stake) * 100 : 0,
      }));
  }, [marketBets]);

  const pieData = useMemo(() => {
    const order: Resultado[] = ["GREEN", "MEIO_GREEN", "MEIO_RED", "RED", "VOID"];
    return order
      .map((r) => ({
        name: RESULT_LABEL[r],
        key: r,
        value: marketBets.filter((b) => b.resultado === r).length,
      }))
      .filter((d) => d.value > 0);
  }, [marketBets]);

  const filteredTableBets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return marketBets.filter((b) => {
      if (filterRange !== "ALL" && getOddRange(b.odd) !== filterRange) return false;
      if (filterResult !== "ALL" && b.resultado !== filterResult) return false;
      if (!q) return true;
      return (
        (b.evento ?? "").toLowerCase().includes(q) ||
        (b.selecao ?? "").toLowerCase().includes(q) ||
        (b.bookmaker_id ?? "").toLowerCase().includes(q)
      );
    });
  }, [marketBets, search, filterRange, filterResult]);

  const sortedTableBets = useMemo(() => {
    const arr = [...filteredTableBets];
    arr.sort((a, b) => {
      let av: any, bv: any;
      switch (sortKey) {
        case "data":
          av = a.data_aposta ?? "";
          bv = b.data_aposta ?? "";
          break;
        case "evento":
          av = a.evento ?? "";
          bv = b.evento ?? "";
          break;
        case "selecao":
          av = a.selecao ?? "";
          bv = b.selecao ?? "";
          break;
        case "odd":
          av = a.odd ?? 0;
          bv = b.odd ?? 0;
          break;
        case "faixa":
          av = getOddRange(a.odd);
          bv = getOddRange(b.odd);
          break;
        case "stake":
          av = stakeOf(a);
          bv = stakeOf(b);
          break;
        case "lucro":
          av = profitOf(a);
          bv = profitOf(b);
          break;
        case "resultado":
          av = a.resultado ?? "";
          bv = b.resultado ?? "";
          break;
        case "casa":
          av = a.bookmaker_id ?? "";
          bv = b.bookmaker_id ?? "";
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredTableBets, sortKey, sortDir]);

  const totals = useMemo(() => calcMetrics(filteredTableBets), [filteredTableBets]);

  const totalPages = Math.max(1, Math.ceil(sortedTableBets.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageBets = sortedTableBets.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function toggleSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(k === "data" || k === "stake" || k === "lucro" ? "desc" : "asc");
    }
    setPage(1);
  }

  function handleOpenChange(v: boolean) {
    if (!v) {
      setSearch("");
      setFilterRange("ALL");
      setFilterResult("ALL");
      setSortKey("data");
      setSortDir("desc");
      setPage(1);
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[90vw] w-[90vw] h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-baseline gap-3">
            <span className="text-2xl font-black tracking-tight">{marketName ?? ""}</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
              {sportLabel} · ValueBet
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="analise" className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 pt-3 shrink-0">
            <TabsList accentColor="bg-foreground">
              <TabsTrigger value="analise">Análise</TabsTrigger>
              <TabsTrigger value="apostas">Apostas ({marketBets.length})</TabsTrigger>
            </TabsList>
          </div>

          {/* === ABA ANÁLISE === */}
          <TabsContent value="analise" className="flex-1 overflow-y-auto mt-0 px-6 py-5 space-y-8">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <Kpi label="Apostas" value={kpis.total.toString()} />
              <Kpi label="Stake" value={fmtMoney(kpis.stake)} />
              <Kpi label="Lucro" value={fmtMoney(kpis.profit)} tone={kpis.profit >= 0 ? "pos" : "neg"} />
              <Kpi label="ROI" value={fmtPctSigned(kpis.roi)} tone={kpis.roi >= 0 ? "pos" : "neg"} />
              <Kpi label="Win Rate" value={fmtPct(kpis.winRate)} />
              <Kpi label="Greens" value={kpis.greens.toString()} tone="pos" />
              <Kpi label="Reds" value={kpis.reds.toString()} tone="neg" />
              <Kpi label="Voids" value={kpis.voids.toString()} tone="muted" />
            </div>

            <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/20 border border-border/30 rounded px-3 py-2">
              <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                Sub-tipos de {marketName?.toLowerCase()} não disponíveis para apostas deste período. Consulte a coluna
                <span className="font-semibold text-foreground"> Seleção </span>
                na tabela de apostas para interpretar manualmente.
              </span>
            </div>

            {/* Faixas de Odd */}
            <Section title="ROI por faixa de odd">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <div className="lg:col-span-2 border border-border/40 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30">
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Th>Faixa</Th>
                        <Th align="right">N</Th>
                        <Th align="right">Stake</Th>
                        <Th align="right">Lucro</Th>
                        <Th align="right">ROI</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {oddRangeRows.length === 0 && (
                        <tr>
                          <td colSpan={5} className="text-center py-6 text-muted-foreground">Sem dados.</td>
                        </tr>
                      )}
                      {oddRangeRows.map((r) => {
                        const isBest = bestOddRange?.range === r.range;
                        return (
                          <tr key={r.range} className={cn("border-t border-border/30", isBest && "bg-emerald-500/10")}>
                            <td className="px-3 py-2 font-bold">
                              <span className="inline-flex items-center gap-1.5">
                                {isBest && <Trophy className="w-3 h-3 text-emerald-500" />}
                                {r.range}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.total}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.stake)}</td>
                            <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", r.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {fmtMoney(r.profit)}
                            </td>
                            <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", r.roi >= 0 ? "text-emerald-400" : "text-red-400")}>
                              {fmtPctSigned(r.roi)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="lg:col-span-3 h-72">
                  <RoiBarChart data={oddRangeRows} />
                </div>
              </div>
            </Section>

            {/* Evolução temporal */}
            <Section title="Evolução temporal (mensal)">
              {monthlyRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem dados.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Lucro por mês</p>
                    <div className="h-64">
                      <ProfitAreaChart data={monthlyRows} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">ROI por mês</p>
                    <div className="h-64">
                      <RoiLineChart data={monthlyRows} />
                    </div>
                  </div>
                </div>
              )}
            </Section>

            {/* Distribuição */}
            <Section title="Distribuição de resultados">
              {pieData.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem dados.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                  <div className="h-64">
                    <ResponsiveContainer>
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={55}
                          outerRadius={95}
                          paddingAngle={3}
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                        >
                          {pieData.map((d, i) => (
                            <Cell key={i} fill={RESULT_COLORS[d.key]} />
                          ))}
                        </Pie>
                        <Tooltip
                          cursor={false}
                          wrapperStyle={{ outline: "none" }}
                          content={<PremiumTooltip kind="count" />}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {pieData.map((d) => {
                      const pct = kpis.total > 0 ? (d.value / kpis.total) * 100 : 0;
                      return (
                        <div key={d.key} className="flex items-center justify-between border border-border/30 rounded px-3 py-2 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-sm" style={{ background: RESULT_COLORS[d.key] }} />
                            <span className="font-semibold">{d.name}</span>
                          </div>
                          <div className="tabular-nums">
                            <span className="font-bold">{d.value}</span>
                            <span className="text-muted-foreground ml-2">({fmtPct(pct)})</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Section>
          </TabsContent>

          {/* === ABA APOSTAS === */}
          <TabsContent value="apostas" className="flex-1 overflow-hidden mt-0 px-6 py-5 flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 shrink-0">
              <Input
                placeholder="Buscar evento, seleção, casa..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="h-8 text-xs max-w-xs"
              />
              <Select value={filterRange} onValueChange={(v) => { setFilterRange(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-[180px]"><SelectValue placeholder="Faixa de odd" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todas as faixas</SelectItem>
                  {ODD_RANGES.map((r) => (<SelectItem key={r.label} value={r.label}>{r.label}</SelectItem>))}
                  <SelectItem value="N/A">N/A</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterResult} onValueChange={(v) => { setFilterResult(v); setPage(1); }}>
                <SelectTrigger className="h-8 text-xs w-[160px]"><SelectValue placeholder="Resultado" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Todos resultados</SelectItem>
                  {(["GREEN", "MEIO_GREEN", "MEIO_RED", "RED", "VOID"] as const).map((r) => (
                    <SelectItem key={r} value={r}>{RESULT_LABEL[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="ml-auto flex items-center gap-4 text-[11px]">
                <TotalChip label="Stake" value={fmtMoney(totals.stake)} />
                <TotalChip label="Lucro" value={fmtMoney(totals.profit)} tone={totals.profit >= 0 ? "pos" : "neg"} />
                <TotalChip label="ROI" value={fmtPctSigned(totals.roi)} tone={totals.roi >= 0 ? "pos" : "neg"} />
              </div>
            </div>

            <div className="flex-1 border border-border/40 rounded-lg overflow-hidden flex flex-col">
              <div className="flex-1 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 sticky top-0 z-10">
                    <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      <SortableTh sortKey="data" current={sortKey} dir={sortDir} onClick={toggleSort}>Data</SortableTh>
                      <SortableTh sortKey="evento" current={sortKey} dir={sortDir} onClick={toggleSort}>Evento</SortableTh>
                      <SortableTh sortKey="selecao" current={sortKey} dir={sortDir} onClick={toggleSort}>Seleção</SortableTh>
                      <SortableTh align="right" sortKey="odd" current={sortKey} dir={sortDir} onClick={toggleSort}>Odd</SortableTh>
                      <SortableTh sortKey="faixa" current={sortKey} dir={sortDir} onClick={toggleSort}>Faixa</SortableTh>
                      <SortableTh align="right" sortKey="stake" current={sortKey} dir={sortDir} onClick={toggleSort}>Stake</SortableTh>
                      <SortableTh align="right" sortKey="lucro" current={sortKey} dir={sortDir} onClick={toggleSort}>Lucro</SortableTh>
                      <SortableTh sortKey="resultado" current={sortKey} dir={sortDir} onClick={toggleSort}>Resultado</SortableTh>
                      <SortableTh sortKey="casa" current={sortKey} dir={sortDir} onClick={toggleSort}>Casa</SortableTh>
                    </tr>
                  </thead>
                  <tbody>
                    {pageBets.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Nenhuma aposta corresponde aos filtros.</td></tr>
                    )}
                    {pageBets.map((b) => {
                      const lucro = profitOf(b);
                      return (
                        <tr key={b.id} className="border-t border-border/30 hover:bg-muted/20">
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{b.data_aposta ? format(parseISO(b.data_aposta), "dd/MM/yy HH:mm") : "—"}</td>
                          <td className="px-3 py-2 max-w-[260px] truncate" title={b.evento ?? ""}>{b.evento ?? "—"}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate" title={b.selecao ?? ""}>{b.selecao ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{b.odd != null ? b.odd.toFixed(2) : "—"}</td>
                          <td className="px-3 py-2 text-muted-foreground">{getOddRange(b.odd)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(stakeOf(b))}</td>
                          <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", lucro >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtMoney(lucro)}</td>
                          <td className="px-3 py-2">
                            {b.resultado ? (
                              <Badge variant="outline" className="text-[10px] font-bold border-none" style={{ background: `${RESULT_COLORS[b.resultado]}22`, color: RESULT_COLORS[b.resultado] }}>
                                {RESULT_LABEL[b.resultado]}
                              </Badge>
                            ) : (<span className="text-muted-foreground">—</span>)}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{b.bookmaker_id ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-xs shrink-0">
                <span className="text-muted-foreground">Página {safePage} de {totalPages} · {PAGE_SIZE} por página</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={safePage === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Anterior</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={safePage === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Próxima</Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border/30 pb-2">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "muted";
}) {
  return (
    <div className="border border-border/40 rounded-lg px-3 py-2 bg-card/40">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{label}</p>
      <p
        className={cn(
          "text-sm font-black tabular-nums mt-0.5",
          tone === "pos" && "text-green-500",
          tone === "neg" && "text-red-500",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn("px-3 py-2 font-bold", align === "right" ? "text-right" : "text-left")}
    >
      {children}
    </th>
  );
}

function SortableTh({
  children,
  sortKey,
  current,
  dir,
  onClick,
  align = "left",
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  current: SortKey;
  dir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === current;
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={cn(
        "px-3 py-2 font-bold cursor-pointer select-none hover:text-foreground transition-colors",
        align === "right" ? "text-right" : "text-left",
        active && "text-foreground",
      )}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown className={cn("w-3 h-3", active ? "opacity-100" : "opacity-30")} />
        {active && <span className="text-[9px]">{dir === "asc" ? "↑" : "↓"}</span>}
      </span>
    </th>
  );
}

/* ============================================================
 *  PREMIUM CHART PRIMITIVES
 * ========================================================== */

function TotalChip({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{label}</span>
      <span
        className={cn(
          "tabular-nums font-bold text-xs",
          tone === "pos" && "text-emerald-400",
          tone === "neg" && "text-red-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Custom tooltip — used by every chart. Replaces recharts default.
 * `kind` switches between money (R$), percent (%, signed) and raw count.
 */
function PremiumTooltip({
  active,
  payload,
  label,
  kind = "money",
}: any) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0];
  const raw = Number(p.value);
  const positive = raw >= 0;
  const color =
    kind === "percent" || kind === "money"
      ? positive
        ? "#22c55e"
        : "#ef4444"
      : (p.payload?.fill as string) || "#e5e7eb";

  let primary: string;
  if (kind === "money") primary = fmtMoney(raw);
  else if (kind === "percent") primary = fmtPctSigned(raw);
  else primary = raw.toLocaleString("pt-BR");

  const secondaryLabel = p.payload?.name ?? label ?? p.name;

  return (
    <div
      className="pointer-events-none animate-in fade-in-0 duration-[120ms]"
      style={{
        background: "#1a1e2a",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        minWidth: 120,
      }}
    >
      <div
        className="text-[10px] uppercase tracking-widest font-semibold mb-1"
        style={{ color: "rgba(255,255,255,0.5)" }}
      >
        {secondaryLabel}
      </div>
      <div
        className="font-bold tabular-nums leading-none"
        style={{ color, fontSize: 15 }}
      >
        {primary}
      </div>
      {p.payload?.total !== undefined && kind !== "count" && (
        <div className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          {p.payload.total} aposta{p.payload.total === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

/* --- Bar chart: ROI por faixa de odd --- */
function RoiBarChart({ data }: { data: Array<{ range: string; roi: number; total: number; profit: number; stake: number }> }) {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const chartData = data.map((d) => ({ name: d.range, value: d.roi, total: d.total }));

  return (
    <ResponsiveContainer>
      <BarChart
        data={chartData}
        margin={{ top: 16, right: 16, left: 0, bottom: 8 }}
        barCategoryGap="40%"
        onMouseLeave={() => setActiveIdx(null)}
      >
        <defs>
          <linearGradient id="barPos" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.85} />
            <stop offset="100%" stopColor="#4ade80" stopOpacity={1} />
          </linearGradient>
          <linearGradient id="barNeg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.85} />
            <stop offset="100%" stopColor="#dc2626" stopOpacity={1} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }}
          axisLine={false}
          tickLine={false}
          dy={4}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          width={40}
        />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
        <Tooltip
          cursor={false}
          wrapperStyle={{ outline: "none", zIndex: 60 }}
          content={<PremiumTooltip kind="percent" />}
          animationDuration={120}
        />
        <Bar
          dataKey="value"
          radius={[6, 6, 0, 0]}
          isAnimationActive
          animationDuration={400}
          animationEasing="ease-out"
          onMouseLeave={() => setActiveIdx(null)}
        >
          {chartData.map((d, i) => {
            const positive = d.value >= 0;
            const fill = positive ? "url(#barPos)" : "url(#barNeg)";
            const isActive = activeIdx === null || activeIdx === i;
            return (
              <Cell
                key={i}
                fill={fill}
                cursor="pointer"
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  transition: "opacity 150ms, filter 150ms",
                  opacity: isActive ? 1 : 0.4,
                  filter: activeIdx === i ? "brightness(1.15)" : "none",
                }}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* --- Profit area chart (mensal) --- */
function ProfitAreaChart({ data }: { data: Array<{ label: string; profit: number; roi: number; stake: number }> }) {
  const chartData = data.map((d) => ({ name: d.label, value: d.profit }));
  const allNeg = chartData.every((d) => d.value < 0);
  const lineColor = allNeg ? "#ef4444" : "#22c55e";
  const fillId = allNeg ? "areaNeg" : "areaPos";

  return (
    <ResponsiveContainer>
      <AreaChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
        <defs>
          <linearGradient id="areaPos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="areaNeg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.15} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} horizontal />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }} axisLine={false} tickLine={false} width={50} tickFormatter={(v) => `R$${Math.round(v).toLocaleString("pt-BR")}`} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
        <Tooltip cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} wrapperStyle={{ outline: "none", zIndex: 60 }} content={<PremiumTooltip kind="money" />} animationDuration={120} />
        <Area
          type="monotone"
          dataKey="value"
          stroke={lineColor}
          strokeWidth={2.5}
          fill={`url(#${fillId})`}
          activeDot={{ r: 6, stroke: "#fff", strokeWidth: 2, fill: lineColor }}
          dot={{ r: 4, stroke: "#fff", strokeWidth: 2, fill: lineColor }}
          isAnimationActive
          animationDuration={500}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* --- ROI line chart (mensal) --- */
function RoiLineChart({ data }: { data: Array<{ label: string; roi: number; profit: number; stake: number }> }) {
  const chartData = data.map((d) => ({ name: d.label, value: d.roi }));

  return (
    <ResponsiveContainer>
      <LineChart data={chartData} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} horizontal />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }} axisLine={false} tickLine={false} width={45} tickFormatter={(v) => `${v}%`} />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" />
        <Tooltip cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} wrapperStyle={{ outline: "none", zIndex: 60 }} content={<PremiumTooltip kind="percent" />} animationDuration={120} />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#3b82f6"
          strokeWidth={2.5}
          activeDot={(props: any) => {
            const v = props.payload?.value ?? 0;
            const c = v >= 0 ? "#22c55e" : "#ef4444";
            return <circle cx={props.cx} cy={props.cy} r={6} fill={c} stroke="#fff" strokeWidth={2} />;
          }}
          dot={(props: any) => {
            const v = props.payload?.value ?? 0;
            const c = v >= 0 ? "#22c55e" : "#ef4444";
            return <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill={c} stroke="#fff" strokeWidth={2} />;
          }}
          isAnimationActive
          animationDuration={500}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}