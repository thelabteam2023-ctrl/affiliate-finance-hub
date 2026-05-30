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
  ComposedChart,
  Sector,
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

  // Cumulative profit, entry by entry
  const cumulativeRows = useMemo(() => {
    const sorted = [...marketBets]
      .filter((b) => !!b.data_aposta)
      .sort((a, b) => (a.data_aposta ?? "").localeCompare(b.data_aposta ?? ""));
    let acc = 0;
    return sorted.map((b, i) => {
      const p = profitOf(b);
      acc += p;
      return {
        idx: i + 1,
        total: sorted.length,
        date: b.data_aposta!,
        dateLabel: format(parseISO(b.data_aposta!), "dd/MM"),
        bet: p,
        cumulative: acc,
      };
    });
  }, [marketBets]);

  // Weekday breakdown (Mon..Sun)
  const weekdayRows = useMemo(() => {
    const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
    const SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const FULL = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    const buckets = new Map<number, { volume: number; profit: number; n: number }>();
    ORDER.forEach((d) => buckets.set(d, { volume: 0, profit: 0, n: 0 }));
    marketBets.forEach((b) => {
      if (!b.data_aposta) return;
      const d = parseISO(b.data_aposta).getDay();
      const entry = buckets.get(d)!;
      entry.volume += stakeOf(b);
      entry.profit += profitOf(b);
      entry.n += 1;
    });
    const rows = ORDER.map((d) => {
      const e = buckets.get(d)!;
      return {
        day: d,
        short: SHORT[d],
        full: FULL[d],
        volume: e.volume,
        profit: e.profit,
        n: e.n,
        roi: e.volume > 0 ? (e.profit / e.volume) * 100 : 0,
      };
    });
    const eligible = rows.filter((r) => r.n > 0);
    const bestProfit = eligible.length > 0 ? Math.max(...eligible.map((r) => r.profit)) : null;
    return rows.map((r) => ({ ...r, isBest: bestProfit !== null && r.profit === bestProfit && r.profit > 0 }));
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
      <DialogContent className="max-w-[92vw] w-[92vw] h-[90vh] p-0 flex flex-col gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
          <DialogTitle className="flex items-baseline gap-3">
            <span className="text-2xl font-black tracking-tight">{marketName ?? ""}</span>
            <span className="text-xs uppercase tracking-widest text-muted-foreground font-bold">
              {sportLabel} · ValueBet
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="analise" className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="px-6 pt-3 shrink-0">
            <TabsList accentColor="bg-foreground">
              <TabsTrigger value="analise">Análise</TabsTrigger>
              <TabsTrigger value="apostas">Apostas ({marketBets.length})</TabsTrigger>
            </TabsList>
          </div>

          {/* === ABA ANÁLISE === */}
          <TabsContent
            value="analise"
            className="flex-1 min-h-0 overflow-y-auto mt-0 px-6 py-5 space-y-6 data-[state=inactive]:hidden"
            forceMount
          >
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
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border border-border/40 rounded-lg overflow-hidden max-h-[320px] overflow-y-auto">
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
                <div className="flex flex-col h-full min-h-[280px]">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                    Evolução acumulada
                  </p>
                  <div className="flex-1 w-full relative min-h-[260px]">
                    {cumulativeRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem dados.</p>
                    ) : (
                      <CumulativeProfitChart data={cumulativeRows} />
                    )}
                  </div>
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
                    <div className="w-full h-[220px] relative">
                      <ProfitAreaChart data={monthlyRows} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ROI &amp; Volume por mês</p>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(148,163,184,0.55)" }} />
                          Volume
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: "#3b82f6" }} />
                          ROI
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-[220px] relative">
                      <RoiLineChart data={monthlyRows} />
                    </div>
                  </div>
                </div>
              )}
            </Section>

            {/* Evolução Detalhada */}
            <Section title="Evolução detalhada">
              {cumulativeRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem dados.</p>
              ) : (
                <div className="flex flex-col gap-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Lucro acumulado (entrada por entrada)
                    </p>
                    <div className="w-full h-[200px] relative">
                      <CumulativeProfitChart data={cumulativeRows} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        Volume &amp; lucro por dia da semana
                      </p>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(59,130,246,0.5)" }} />
                          Volume
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(34,197,94,0.7)" }} />
                          Lucro
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-[220px] relative">
                      <WeekdayChart data={weekdayRows} />
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
                <ResultDistribution bets={marketBets} />
              )}
            </Section>
          </TabsContent>

          {/* === ABA APOSTAS === */}
          <TabsContent
            value="apostas"
            className="flex-1 min-h-0 overflow-hidden mt-0 px-6 py-5 flex flex-col gap-3 data-[state=inactive]:hidden"
            forceMount
          >
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

/* --- ROI + Volume combo chart (mensal) --- */
function RoiVolumeTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as { name: string; roi: number; stake: number };
  const roi = row.roi ?? 0;
  const stake = row.stake ?? 0;
  const roiColor = roi >= 0 ? "#22c55e" : "#ef4444";
  return (
    <div
      className="pointer-events-none animate-in fade-in-0 duration-[120ms]"
      style={{
        background: "#1a1e2a",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        minWidth: 160,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
        {label}
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>ROI</span>
        <span className="font-bold tabular-nums" style={{ color: roiColor, fontSize: 14 }}>{fmtPctSigned(roi)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 mt-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Volume</span>
        <span className="font-semibold tabular-nums" style={{ color: "#e5e7eb", fontSize: 13 }}>{fmtMoney(stake)}</span>
      </div>
    </div>
  );
}

function RoiLineChart({ data }: { data: Array<{ label: string; roi: number; profit: number; stake: number }> }) {
  const chartData = data.map((d) => ({ name: d.label, roi: d.roi, stake: d.stake }));

  return (
    <ResponsiveContainer>
      <ComposedChart data={chartData} margin={{ top: 16, right: 8, left: 0, bottom: 8 }}>
        <defs>
          <linearGradient id="volumeBarGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(148,163,184,0.55)" />
            <stop offset="100%" stopColor="rgba(148,163,184,0.15)" />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} horizontal />
        <XAxis dataKey="name" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }} axisLine={false} tickLine={false} />
        <YAxis
          yAxisId="roi"
          orientation="left"
          tick={{ fontSize: 10, fill: "rgba(59,130,246,0.75)" }}
          axisLine={false}
          tickLine={false}
          width={45}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          yAxisId="vol"
          orientation="right"
          tick={{ fontSize: 10, fill: "rgba(148,163,184,0.7)" }}
          axisLine={false}
          tickLine={false}
          width={52}
          tickFormatter={(v) => {
            const n = Number(v);
            if (Math.abs(n) >= 1000) return `${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
            return n.toLocaleString("pt-BR");
          }}
        />
        <ReferenceLine yAxisId="roi" y={0} stroke="rgba(255,255,255,0.15)" />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          wrapperStyle={{ outline: "none", zIndex: 60 }}
          content={<RoiVolumeTooltip />}
          animationDuration={120}
        />
        <Bar
          yAxisId="vol"
          dataKey="stake"
          fill="url(#volumeBarGradient)"
          radius={[4, 4, 0, 0]}
          maxBarSize={36}
          isAnimationActive
          animationDuration={500}
        />
        <Line
          yAxisId="roi"
          type="monotone"
          dataKey="roi"
          stroke="#3b82f6"
          strokeWidth={2.5}
          activeDot={(props: any) => {
            const v = props.payload?.roi ?? 0;
            const c = v >= 0 ? "#22c55e" : "#ef4444";
            return <circle cx={props.cx} cy={props.cy} r={6} fill={c} stroke="#fff" strokeWidth={2} />;
          }}
          dot={(props: any) => {
            const v = props.payload?.roi ?? 0;
            const c = v >= 0 ? "#22c55e" : "#ef4444";
            return <circle key={props.index} cx={props.cx} cy={props.cy} r={4} fill={c} stroke="#fff" strokeWidth={2} />;
          }}
          isAnimationActive
          animationDuration={500}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* --- Cumulative profit chart (entry by entry) --- */
function CumulativeTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as { dateLabel: string; cumulative: number; bet: number; idx: number; total: number };
  const accColor = row.cumulative >= 0 ? "#22c55e" : "#ef4444";
  const betColor = row.bet >= 0 ? "#22c55e" : "#ef4444";
  return (
    <div
      className="pointer-events-none animate-in fade-in-0 duration-[120ms]"
      style={{
        background: "#1a1e2a",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        minWidth: 180,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
        {row.dateLabel}
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Acumulado</span>
        <span className="font-bold tabular-nums" style={{ color: accColor, fontSize: 14 }}>{fmtMoney(row.cumulative)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 mt-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Aposta</span>
        <span className="font-semibold tabular-nums" style={{ color: betColor, fontSize: 13 }}>{fmtMoney(row.bet)}</span>
      </div>
      <div className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>
        #{row.idx} de {row.total}
      </div>
    </div>
  );
}

function CumulativeProfitChart({
  data,
}: {
  data: Array<{ idx: number; total: number; date: string; dateLabel: string; bet: number; cumulative: number }>;
}) {
  const values = data.map((d) => d.cumulative);
  const maxV = Math.max(0, ...values);
  const minV = Math.min(0, ...values);
  // gradient offset where the line crosses zero (0..1 from top to bottom)
  const range = maxV - minV;
  const zeroOffset = range > 0 ? maxV / range : 0.5;
  const off = Math.max(0, Math.min(1, zeroOffset));

  // Limit x-axis labels to ~12
  const step = Math.max(1, Math.ceil(data.length / 12));
  const interval = step - 1;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 16, left: 0, bottom: 6 }}>
        <defs>
          <linearGradient id="cumStroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={1} />
            <stop offset={`${off * 100}%`} stopColor="#22c55e" stopOpacity={1} />
            <stop offset={`${off * 100}%`} stopColor="#ef4444" stopOpacity={1} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={1} />
          </linearGradient>
          <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.12} />
            <stop offset={`${off * 100}%`} stopColor="#22c55e" stopOpacity={0.02} />
            <stop offset={`${off * 100}%`} stopColor="#ef4444" stopOpacity={0.02} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.12} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
          axisLine={false}
          tickLine={false}
          interval={interval}
          minTickGap={20}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
          axisLine={false}
          tickLine={false}
          width={55}
          tickFormatter={(v) => {
            const n = Number(v);
            if (Math.abs(n) >= 1000) return `R$${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
            return `R$${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
          }}
        />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
        <Tooltip
          cursor={{ stroke: "rgba(255,255,255,0.2)", strokeWidth: 1 }}
          wrapperStyle={{ outline: "none", zIndex: 60 }}
          content={<CumulativeTooltip />}
          animationDuration={120}
        />
        <Area
          type="monotone"
          dataKey="cumulative"
          stroke="url(#cumStroke)"
          strokeWidth={2}
          fill="url(#cumFill)"
          dot={false}
          activeDot={(props: any) => {
            const v = props.payload?.cumulative ?? 0;
            const c = v >= 0 ? "#22c55e" : "#ef4444";
            return <circle cx={props.cx} cy={props.cy} r={5} fill={c} stroke="#fff" strokeWidth={2} />;
          }}
          isAnimationActive
          animationDuration={500}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* --- Weekday volume + profit chart --- */
function WeekdayTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as { full: string; volume: number; profit: number; roi: number; n: number };
  const profitColor = row.profit >= 0 ? "#22c55e" : "#ef4444";
  const roiColor = row.roi >= 0 ? "#22c55e" : "#ef4444";
  return (
    <div
      className="pointer-events-none animate-in fade-in-0 duration-[120ms]"
      style={{
        background: "#1a1e2a",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        minWidth: 180,
      }}
    >
      <div className="text-[11px] font-bold mb-1.5" style={{ color: "rgba(255,255,255,0.85)" }}>
        {row.full}
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Volume</span>
        <span className="font-semibold tabular-nums" style={{ color: "#e5e7eb", fontSize: 13 }}>{fmtMoney(row.volume)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 mt-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Lucro</span>
        <span className="font-bold tabular-nums" style={{ color: profitColor, fontSize: 13 }}>{fmtMoney(row.profit)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 mt-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>ROI</span>
        <span className="font-bold tabular-nums" style={{ color: roiColor, fontSize: 13 }}>{fmtPctSigned(row.roi)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 mt-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Apostas</span>
        <span className="font-semibold tabular-nums" style={{ color: "#e5e7eb", fontSize: 13 }}>{row.n}</span>
      </div>
    </div>
  );
}

function WeekdayChart({
  data,
}: {
  data: Array<{ day: number; short: string; full: string; volume: number; profit: number; n: number; roi: number; isBest: boolean }>;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 18, right: 16, left: 0, bottom: 6 }} barGap={4} barCategoryGap="22%">
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="short"
          tick={{ fontSize: 11, fill: "rgba(255,255,255,0.6)" }}
          axisLine={false}
          tickLine={false}
          dy={4}
        />
        <YAxis
          yAxisId="vol"
          orientation="left"
          tick={{ fontSize: 10, fill: "rgba(148,163,184,0.7)" }}
          axisLine={false}
          tickLine={false}
          width={50}
          tickFormatter={(v) => {
            const n = Number(v);
            if (Math.abs(n) >= 1000) return `R$${(n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}k`;
            return `R$${n.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
          }}
        />
        <YAxis
          yAxisId="profit"
          orientation="right"
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.55)" }}
          axisLine={false}
          tickLine={false}
          width={55}
          tickFormatter={(v) => {
            const n = Number(v);
            const sign = n > 0 ? "+" : n < 0 ? "-" : "";
            const abs = Math.abs(n);
            if (abs >= 1000) return `${sign}${(abs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
            return `${sign}${abs.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
          }}
        />
        <ReferenceLine yAxisId="profit" y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          wrapperStyle={{ outline: "none", zIndex: 60 }}
          content={<WeekdayTooltip />}
          animationDuration={120}
        />
        <Bar
          yAxisId="vol"
          dataKey="volume"
          radius={[4, 4, 0, 0]}
          maxBarSize={26}
          isAnimationActive
          animationDuration={400}
        >
          {data.map((d, i) => (
            <Cell
              key={`v-${i}`}
              fill="rgba(59, 130, 246, 0.5)"
              style={{ filter: d.isBest ? "brightness(1.15)" : "none", transition: "filter 150ms" }}
            />
          ))}
        </Bar>
        <Bar
          yAxisId="profit"
          dataKey="profit"
          radius={[4, 4, 0, 0]}
          maxBarSize={26}
          isAnimationActive
          animationDuration={400}
        >
          {data.map((d, i) => (
            <Cell
              key={`p-${i}`}
              fill={d.profit >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)"}
              style={{ filter: d.isBest ? "brightness(1.15)" : "none", transition: "filter 150ms" }}
            />
          ))}
        </Bar>
      </ComposedChart>
    </ResponsiveContainer>
  );
}