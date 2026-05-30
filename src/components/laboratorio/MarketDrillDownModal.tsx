import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BookmakerLogo } from "@/components/ui/bookmaker-logo";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { ArrowUpDown, Trophy, Info, X, Filter } from "lucide-react";
import { HelpCircle } from "lucide-react";
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

/* ---------------- Risk helpers ---------------- */

function sortByDateAsc(bets: RawBet[]): RawBet[] {
  return [...bets]
    .filter((b) => !!b.data_aposta)
    .sort((a, b) => (a.data_aposta ?? "").localeCompare(b.data_aposta ?? ""));
}

function fmtDM(iso: string | null | undefined) {
  if (!iso) return "—";
  try { return format(parseISO(iso), "dd/MM"); } catch { return "—"; }
}

function daysBetween(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const da = parseISO(a).getTime();
  const db = parseISO(b).getTime();
  return Math.max(0, Math.round((db - da) / 86400000));
}

interface DrawdownResult {
  maxDrawdown: number;
  peakDate: string | null;
  valleyDate: string | null;
  series: Array<{ idx: number; date: string; dateLabel: string; cumulative: number; drawdown: number }>;
  maxRunup: number;
  runupValleyDate: string | null;
  runupPeakDate: string | null;
  runupSeries: Array<{ idx: number; date: string; dateLabel: string; cumulative: number; runup: number }>;
}

function computeDrawdown(betsAsc: RawBet[]): DrawdownResult {
  let peak = 0;
  let maxDD = 0;
  let peakDate: string | null = null;
  let valleyDate: string | null = null;
  let currentPeakDate: string | null = null;
  let valley = 0;
  let maxRU = 0;
  let runupValleyDate: string | null = null;
  let runupPeakDate: string | null = null;
  let currentValleyDate: string | null = null;
  let acc = 0;
  const series: DrawdownResult["series"] = [];
  const runupSeries: DrawdownResult["runupSeries"] = [];
  betsAsc.forEach((b, i) => {
    acc += profitOf(b);
    if (acc > peak) {
      peak = acc;
      currentPeakDate = b.data_aposta!;
    }
    const dd = peak - acc;
    if (dd > maxDD) {
      maxDD = dd;
      peakDate = currentPeakDate;
      valleyDate = b.data_aposta!;
    }
    if (acc < valley) {
      valley = acc;
      currentValleyDate = b.data_aposta!;
    }
    const ru = acc - valley;
    if (ru > maxRU) {
      maxRU = ru;
      runupValleyDate = currentValleyDate;
      runupPeakDate = b.data_aposta!;
    }
    series.push({
      idx: i + 1,
      date: b.data_aposta!,
      dateLabel: fmtDM(b.data_aposta!),
      cumulative: acc,
      drawdown: -dd,
    });
    runupSeries.push({
      idx: i + 1,
      date: b.data_aposta!,
      dateLabel: fmtDM(b.data_aposta!),
      cumulative: acc,
      runup: ru,
    });
  });
  return {
    maxDrawdown: maxDD,
    peakDate,
    valleyDate,
    series,
    maxRunup: maxRU,
    runupValleyDate,
    runupPeakDate,
    runupSeries,
  };
}

interface StreakResult {
  length: number;
  startDate: string | null;
  endDate: string | null;
  pl: number;
  stakeAvg: number;
  blocks: Array<{ idx: number; kind: "GREEN" | "RED"; length: number; pl: number; startDate: string; endDate: string }>;
}

function computeStreaks(betsAsc: RawBet[]): { reds: StreakResult; greens: StreakResult } {
  const isRed = (r: string | null) => r === "RED" || r === "MEIO_RED";
  const isGreen = (r: string | null) => r === "GREEN" || r === "MEIO_GREEN";

  const blocks: StreakResult["blocks"] = [];
  let cur: { kind: "GREEN" | "RED"; bets: RawBet[] } | null = null;

  betsAsc.forEach((b) => {
    if (b.resultado === "VOID" || !b.resultado) return; // ignore voids
    const kind: "GREEN" | "RED" = isGreen(b.resultado) ? "GREEN" : isRed(b.resultado) ? "RED" : "GREEN";
    if (!isGreen(b.resultado) && !isRed(b.resultado)) return;
    if (!cur || cur.kind !== kind) {
      if (cur) {
        const startDate = cur.bets[0].data_aposta!;
        const endDate = cur.bets[cur.bets.length - 1].data_aposta!;
        const pl = cur.bets.reduce((a, x) => a + profitOf(x), 0);
        blocks.push({ idx: blocks.length, kind: cur.kind, length: cur.bets.length, pl, startDate, endDate });
      }
      cur = { kind, bets: [b] };
    } else {
      cur.bets.push(b);
    }
  });
  if (cur) {
    const c = cur as { kind: "GREEN" | "RED"; bets: RawBet[] };
    const startDate = c.bets[0].data_aposta!;
    const endDate = c.bets[c.bets.length - 1].data_aposta!;
    const pl = c.bets.reduce((a, x) => a + profitOf(x), 0);
    blocks.push({ idx: blocks.length, kind: c.kind, length: c.bets.length, pl, startDate, endDate });
  }

  function pick(kind: "GREEN" | "RED"): StreakResult {
    const filtered = blocks.filter((b) => b.kind === kind);
    if (filtered.length === 0) {
      return { length: 0, startDate: null, endDate: null, pl: 0, stakeAvg: 0, blocks };
    }
    const best = filtered.reduce((a, b) => (b.length > a.length ? b : a), filtered[0]);
    // Stake average during best streak
    const streakBets = betsAsc.filter(
      (b) => b.data_aposta && b.data_aposta >= best.startDate && b.data_aposta <= best.endDate &&
        ((kind === "GREEN" && (b.resultado === "GREEN" || b.resultado === "MEIO_GREEN")) ||
         (kind === "RED" && (b.resultado === "RED" || b.resultado === "MEIO_RED")))
    );
    const stakeAvg = streakBets.length > 0 ? streakBets.reduce((a, b) => a + stakeOf(b), 0) / streakBets.length : 0;
    return { length: best.length, startDate: best.startDate, endDate: best.endDate, pl: best.pl, stakeAvg, blocks };
  }

  return { reds: pick("RED"), greens: pick("GREEN") };
}

const STAKE_BUCKETS = [
  { label: "0–100", min: 0, max: 100 },
  { label: "100–300", min: 100, max: 300 },
  { label: "300–500", min: 300, max: 500 },
  { label: "500–1.000", min: 500, max: 1000 },
  { label: "1.000–2.000", min: 1000, max: 2000 },
  { label: "2.000+", min: 2000, max: Infinity },
];

function computeStakeDistribution(bets: RawBet[]) {
  const totalBets = bets.length;
  return STAKE_BUCKETS.map((b) => {
    const sub = bets.filter((x) => {
      const s = stakeOf(x);
      return s >= b.min && s < b.max;
    });
    const stake = sub.reduce((a, x) => a + stakeOf(x), 0);
    const profit = sub.reduce((a, x) => a + profitOf(x), 0);
    const roi = stake > 0 ? (profit / stake) * 100 : 0;
    return {
      label: b.label,
      n: sub.length,
      pct: totalBets > 0 ? (sub.length / totalBets) * 100 : 0,
      stake,
      profit,
      roi,
    };
  });
}

function computeWeightedStrike(bets: RawBet[]) {
  const valid = bets.filter((b) => b.resultado && b.resultado !== "VOID");
  const denom = valid.reduce((a, b) => a + stakeOf(b), 0);
  const num = valid.reduce((a, b) => {
    if (b.resultado === "GREEN") return a + stakeOf(b);
    if (b.resultado === "MEIO_GREEN") return a + stakeOf(b) * 0.5;
    return a;
  }, 0);
  return denom > 0 ? (num / denom) * 100 : 0;
}

interface BookmakerInfo {
  displayName: string;
  logoUrl: string | null;
  groupKey: string;
}

function computeBookmakerPerformance(
  bets: RawBet[],
  bookmakerMap: Map<string, BookmakerInfo>,
) {
  const map = new Map<string, { info: BookmakerInfo; bets: RawBet[] }>();
  bets.forEach((b) => {
    const id = b.bookmaker_id ?? "—";
    const info = bookmakerMap.get(id) ?? {
      displayName: id === "—" ? "—" : "Casa desconhecida",
      logoUrl: null,
      groupKey: id,
    };
    const key = info.groupKey;
    if (!map.has(key)) map.set(key, { info, bets: [] });
    map.get(key)!.bets.push(b);
  });
  const rows = Array.from(map.entries()).map(([groupKey, { info, bets: arr }]) => {
    const m = calcMetrics(arr);
    return {
      casa: info.displayName,
      groupKey,
      logoUrl: info.logoUrl,
      n: m.total,
      stake: m.stake,
      profit: m.profit,
      roi: m.roi,
      winRate: m.winRate,
    };
  });
  rows.sort((a, b) => b.roi - a.roi);
  return rows;
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
  const [faixaSelecionada, setFaixaSelecionada] = useState<string | null>(null);

  const marketBets = useMemo(() => {
    if (!marketName) return [];
    return bets.filter((b) => {
      const m = b.mercado && b.mercado.trim() !== "" ? b.mercado : "Geral";
      return m === marketName;
    });
  }, [bets, marketName]);

  const kpis = useMemo(() => calcMetrics(marketBets), [marketBets]);

  // === RISK METRICS (computed once per marketBets) ===
  const marketBetsAsc = useMemo(() => sortByDateAsc(marketBets), [marketBets]);

  const drawdown = useMemo(() => computeDrawdown(marketBetsAsc), [marketBetsAsc]);
  const streaks = useMemo(() => computeStreaks(marketBetsAsc), [marketBetsAsc]);
  const stakeDistribution = useMemo(() => computeStakeDistribution(marketBets), [marketBets]);
  const weightedStrike = useMemo(() => computeWeightedStrike(marketBets), [marketBets]);

  // Fetch bookmaker info (nome + catalog logo) for the IDs present in the scoped bets.
  const bookmakerIds = useMemo(() => {
    const set = new Set<string>();
    marketBets.forEach((b) => { if (b.bookmaker_id) set.add(b.bookmaker_id); });
    return Array.from(set);
  }, [marketBets]);

  const { data: bookmakerMap } = useQuery({
    queryKey: ["market-drilldown-bookmakers", bookmakerIds.sort().join(",")],
    queryFn: async (): Promise<Map<string, BookmakerInfo>> => {
      const map = new Map<string, BookmakerInfo>();
      if (bookmakerIds.length === 0) return map;
      const { data, error } = await supabase
        .from("bookmakers")
        .select(`
          id,
          nome,
          bookmaker_catalogo_id,
          bookmakers_catalogo!bookmakers_bookmaker_catalogo_id_fkey (id, nome, logo_url)
        `)
        .in("id", bookmakerIds);
      if (error) throw error;
      (data || []).forEach((b: any) => {
        const cat = b.bookmakers_catalogo;
        const displayName = cat?.nome || b.nome || "—";
        const groupKey = cat?.id || b.id;
        map.set(b.id, {
          displayName,
          logoUrl: cat?.logo_url || null,
          groupKey,
        });
      });
      return map;
    },
    enabled: bookmakerIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const resolvedBookmakerMap = bookmakerMap ?? new Map<string, BookmakerInfo>();

  const bookmakerPerf = useMemo(
    () => computeBookmakerPerformance(marketBets, resolvedBookmakerMap),
    [marketBets, resolvedBookmakerMap],
  );

  const ddDuration = drawdown.peakDate && drawdown.valleyDate ? daysBetween(drawdown.peakDate, drawdown.valleyDate) : 0;
  const ddPctOfStake = kpis.stake > 0 ? Math.min(100, (drawdown.maxDrawdown / kpis.stake) * 100) : 0;

  const stakeDistBest = useMemo(() => {
    const eligible = stakeDistribution.filter((s) => s.n > 0);
    if (eligible.length === 0) return null;
    const principal = eligible.reduce((a, b) => (b.n > a.n ? b : a), eligible[0]);
    const bestRoi = eligible.reduce((a, b) => (b.roi > a.roi ? b : a), eligible[0]);
    return { principalLabel: principal.label, bestRoiLabel: bestRoi.label };
  }, [stakeDistribution]);

  const bookmakerStats = useMemo(() => {
    const eligible = bookmakerPerf.filter((r) => r.n >= 10);
    const avgRoi = eligible.length > 0 ? eligible.reduce((a, b) => a + b.roi, 0) / eligible.length : 0;
    return {
      bestLabel: eligible.length > 0 ? eligible[0].casa : null,
      worstLabel: eligible.length > 0 ? eligible[eligible.length - 1].casa : null,
      avgRoi,
    };
  }, [bookmakerPerf]);

  // Drawdown per odd range (for the table column)
  const drawdownByRange = useMemo(() => {
    const map = new Map<string, number>();
    ODD_RANGES.forEach((r) => {
      const sub = marketBets.filter((b) => b.odd !== null && b.odd !== undefined && b.odd >= r.min && b.odd <= r.max);
      map.set(r.label, computeDrawdown(sortByDateAsc(sub)).maxDrawdown);
    });
    const naSub = marketBets.filter((b) => b.odd === null || b.odd === undefined);
    if (naSub.length > 0) map.set("N/A", computeDrawdown(sortByDateAsc(naSub)).maxDrawdown);
    return map;
  }, [marketBets]);

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

  // Bets scoped by the currently selected odd range (or all)
  const scopedBets = useMemo(() => {
    if (!faixaSelecionada) return marketBets;
    if (faixaSelecionada === "N/A") {
      return marketBets.filter((b) => b.odd === null || b.odd === undefined);
    }
    const r = ODD_RANGES.find((x) => x.label === faixaSelecionada);
    if (!r) return marketBets;
    return marketBets.filter((b) => b.odd !== null && b.odd !== undefined && b.odd >= r.min && b.odd <= r.max);
  }, [marketBets, faixaSelecionada]);

  const scopedKpis = useMemo(() => calcMetrics(scopedBets), [scopedBets]);

  // Cumulative profit, entry by entry — respects faixaSelecionada
  const cumulativeRows = useMemo(() => {
    const sorted = [...scopedBets]
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
  }, [scopedBets]);

  // Linear regression on cumulative series (only when filtered)
  const trend = useMemo(() => {
    if (!faixaSelecionada || cumulativeRows.length < 2) return null;
    const n = cumulativeRows.length;
    let sx = 0, sy = 0, sxy = 0, sxx = 0;
    cumulativeRows.forEach((r, i) => {
      const x = i + 1;
      const y = r.cumulative;
      sx += x; sy += y; sxy += x * y; sxx += x * x;
    });
    const denom = n * sxx - sx * sx;
    if (denom === 0) return null;
    const slope = (n * sxy - sx * sy) / denom;
    const intercept = (sy - slope * sx) / n;
    const series = cumulativeRows.map((r, i) => ({
      dateLabel: r.dateLabel,
      trendValue: slope * (i + 1) + intercept,
    }));
    return { slope, series };
  }, [cumulativeRows, faixaSelecionada]);

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
      const casaNome = b.bookmaker_id ? (resolvedBookmakerMap.get(b.bookmaker_id)?.displayName ?? "") : "";
      return (
        (b.evento ?? "").toLowerCase().includes(q) ||
        (b.selecao ?? "").toLowerCase().includes(q) ||
        casaNome.toLowerCase().includes(q)
      );
    });
  }, [marketBets, search, filterRange, filterResult, resolvedBookmakerMap]);

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
          av = a.bookmaker_id ? (resolvedBookmakerMap.get(a.bookmaker_id)?.displayName ?? "") : "";
          bv = b.bookmaker_id ? (resolvedBookmakerMap.get(b.bookmaker_id)?.displayName ?? "") : "";
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filteredTableBets, sortKey, sortDir, resolvedBookmakerMap]);

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
      setFaixaSelecionada(null);
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
              <TabsTrigger value="risco">Risco</TabsTrigger>
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
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <Kpi label="Apostas" value={kpis.total.toString()} />
              <Kpi label="Stake" value={fmtMoney(kpis.stake)} />
              <Kpi label="Lucro" value={fmtMoney(kpis.profit)} tone={kpis.profit >= 0 ? "pos" : "neg"} />
              <Kpi label="ROI" value={fmtPctSigned(kpis.roi)} tone={kpis.roi >= 0 ? "pos" : "neg"} />
              <Kpi label="Win Rate" value={fmtPct(kpis.winRate)} />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Kpi label="Greens" value={kpis.greens.toString()} tone="pos" />
              <Kpi label="Reds" value={kpis.reds.toString()} tone="neg" />
              <Kpi label="Voids" value={kpis.voids.toString()} tone="muted" />
              <Kpi
                label="Drawdown Máx."
                value={fmtMoney(drawdown.maxDrawdown)}
                tone="neg"
                sub={drawdown.peakDate && drawdown.valleyDate ? `pico ${fmtDM(drawdown.peakDate)} · vale ${fmtDM(drawdown.valleyDate)}` : "—"}
                title="Maior queda do pico ao vale no período"
              />
              <Kpi
                label="Maior Seq. Reds"
                value={`${streaks.reds.length} reds`}
                tone="neg"
                sub={
                  streaks.reds.length > 0
                    ? `${fmtDM(streaks.reds.startDate)} → ${fmtDM(streaks.reds.endDate)} · ${fmtMoney(streaks.reds.pl)}`
                    : "—"
                }
                title="Maior sequência consecutiva de reds (void não quebra)"
              />
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
                      <Th align="right">Drawdown</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {oddRangeRows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="text-center py-6 text-muted-foreground">Sem dados.</td>
                        </tr>
                      )}
                      {oddRangeRows.map((r) => {
                        const isBest = bestOddRange?.range === r.range;
                        const isActive = faixaSelecionada === r.range;
                        const dim = faixaSelecionada !== null && !isActive;
                      const dd = drawdownByRange.get(r.range) ?? 0;
                        return (
                          <tr
                            key={r.range}
                            onClick={() => setFaixaSelecionada((cur) => (cur === r.range ? null : r.range))}
                            className={cn(
                              "border-t border-border/30 cursor-pointer transition-all group",
                              isBest && !faixaSelecionada && "bg-emerald-500/10",
                              isActive && "bg-white/[0.05]",
                              dim && "opacity-45",
                              !isActive && "hover:bg-white/[0.03]"
                            )}
                            style={isActive ? { boxShadow: "inset 2px 0 0 0 #22c55e" } : undefined}
                          >
                            <td className="px-3 py-2 font-bold">
                              <span className="inline-flex items-center gap-1.5">
                                {isBest && <Trophy className="w-3 h-3 text-emerald-500" />}
                                {r.range}
                                <Filter className={cn("w-3 h-3 ml-0.5 transition-opacity", isActive ? "opacity-80 text-emerald-400" : "opacity-0 group-hover:opacity-40")} />
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
                          <td
                            className={cn("px-3 py-2 text-right tabular-nums", dd > 0 ? "text-red-400 font-semibold" : "text-muted-foreground")}
                            title="Maior queda do pico ao vale para apostas desta faixa"
                          >
                            {dd > 0 ? fmtMoney(dd) : "—"}
                          </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col h-full min-h-[280px]">
                  <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                      Evolução acumulada
                      {faixaSelecionada && (
                        <span className="ml-1.5 text-foreground">· {faixaSelecionada}</span>
                      )}
                    </p>
                    {trend && (
                      <span
                        className="text-[10px] font-semibold"
                        style={{ color: trend.slope >= 0 ? "#22c55e" : "#ef4444" }}
                      >
                        {trend.slope >= 0 ? "↗ tendência positiva" : "↘ tendência negativa"}
                      </span>
                    )}
                  </div>

                  {/* Mini KPIs */}
                  <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[12px] tabular-nums mb-2">
                    <span><span className="text-muted-foreground">Apostas:</span> <span className="font-semibold text-foreground">{scopedKpis.total}</span></span>
                    <span className="text-muted-foreground/40">·</span>
                    <span><span className="text-muted-foreground">Stake:</span> <span className="font-semibold text-foreground">{fmtMoney(scopedKpis.stake)}</span></span>
                    <span className="text-muted-foreground/40">·</span>
                    <span><span className="text-muted-foreground">Lucro:</span> <span className={cn("font-semibold", scopedKpis.profit >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtMoney(scopedKpis.profit)}</span></span>
                    <span className="text-muted-foreground/40">·</span>
                    <span><span className="text-muted-foreground">ROI:</span> <span className={cn("font-semibold", scopedKpis.roi >= 0 ? "text-emerald-400" : "text-red-400")}>{fmtPctSigned(scopedKpis.roi)}</span></span>
                    <span className="text-muted-foreground/40">·</span>
                    <span><span className="text-muted-foreground">Win Rate:</span> <span className="font-semibold text-foreground">{fmtPct(scopedKpis.winRate)}</span></span>
                  </div>

                  {/* Pills */}
                  <div className="flex items-center flex-wrap gap-1.5 mb-2">
                    <FaixaPill label="Todas" active={faixaSelecionada === null} onClick={() => setFaixaSelecionada(null)} />
                    {oddRangeRows.map((r) => (
                      <FaixaPill
                        key={r.range}
                        label={r.range}
                        active={faixaSelecionada === r.range}
                        onClick={() => setFaixaSelecionada((cur) => (cur === r.range ? null : r.range))}
                      />
                    ))}
                  </div>

                  {/* Active filter indicator */}
                  {faixaSelecionada && (
                    <div className="flex items-center gap-2 mb-2 text-[11px]">
                      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded border border-white/15 bg-white/[0.04]">
                        <span className="text-muted-foreground">Faixa:</span>
                        <span className="font-semibold text-foreground">{faixaSelecionada}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="tabular-nums text-muted-foreground">{scopedKpis.total} apostas</span>
                        <button
                          onClick={() => setFaixaSelecionada(null)}
                          className="ml-1 -mr-0.5 rounded hover:bg-white/10 p-0.5"
                          aria-label="Limpar filtro"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    </div>
                  )}

                  <div className="flex-1 w-full relative min-h-[260px]">
                    {cumulativeRows.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Sem dados.</p>
                    ) : (
                      <CumulativeProfitChart data={cumulativeRows} trend={trend?.series} />
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

            {/* Volume & lucro por dia da semana */}
            <Section title="Volume & lucro por dia da semana">
              {weekdayRows.every((r) => r.n === 0) ? (
                <p className="text-xs text-muted-foreground">Sem dados.</p>
              ) : (
                <div>
                  <div className="flex items-center justify-end mb-2 gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(59,130,246,0.5)" }} />
                      Volume
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "rgba(34,197,94,0.7)" }} />
                      Lucro
                    </span>
                  </div>
                  <div className="w-full h-[220px] relative">
                    <WeekdayChart data={weekdayRows} />
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

          {/* === ABA RISCO === */}
          <TabsContent
            value="risco"
            className="flex-1 min-h-0 overflow-y-auto mt-0 px-6 py-5 space-y-6 data-[state=inactive]:hidden"
            forceMount
          >
            {marketBets.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem dados.</p>
            ) : (
              <>
                {/* SEÇÃO 1 — DRAWDOWN DETALHADO */}
                <Section title="Drawdown detalhado">
                  <div className="border border-border/40 rounded-lg p-4 bg-card/40 space-y-3">
                    <div className="flex items-baseline justify-between flex-wrap gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Drawdown máximo do período</p>
                        <p className="text-2xl font-black tabular-nums text-red-500 mt-1">{fmtMoney(drawdown.maxDrawdown)}</p>
                      </div>
                      <div className="flex items-center gap-5 text-[11px]">
                        <div>
                          <p className="uppercase tracking-widest text-muted-foreground text-[9px] font-bold">Pico</p>
                          <p className="tabular-nums font-semibold">{fmtDM(drawdown.peakDate)}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-widest text-muted-foreground text-[9px] font-bold">Vale</p>
                          <p className="tabular-nums font-semibold">{fmtDM(drawdown.valleyDate)}</p>
                        </div>
                        <div>
                          <p className="uppercase tracking-widest text-muted-foreground text-[9px] font-bold">Duração</p>
                          <p className="tabular-nums font-semibold">{ddDuration}d</p>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                        <div className="h-full bg-red-500/70" style={{ width: `${ddPctOfStake}%` }} />
                      </div>
                      <p className="text-[10px] text-muted-foreground">{fmtPct(ddPctOfStake)} do volume total apostado</p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Profundidade do drawdown</p>
                    <div className="w-full h-[180px] relative">
                      <DrawdownChart data={drawdown.series} />
                    </div>
                  </div>
                </Section>

                {/* SEÇÃO 2 — ANÁLISE DE SEQUÊNCIAS */}
                <Section title="Análise de sequências">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StreakCard
                      title="Maior sequência de reds"
                      length={streaks.reds.length}
                      labelKind="reds consecutivos"
                      startDate={streaks.reds.startDate}
                      endDate={streaks.reds.endDate}
                      pl={streaks.reds.pl}
                      stakeAvg={streaks.reds.stakeAvg}
                      tone="neg"
                    />
                    <StreakCard
                      title="Maior sequência de greens"
                      length={streaks.greens.length}
                      labelKind="greens consecutivos"
                      startDate={streaks.greens.startDate}
                      endDate={streaks.greens.endDate}
                      pl={streaks.greens.pl}
                      stakeAvg={streaks.greens.stakeAvg}
                      tone="pos"
                    />
                  </div>

                  {streaks.reds.blocks.length > 0 && (
                    <div className="mt-4">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                        Blocos cronológicos de sequências
                      </p>
                      <div className="w-full h-[160px] relative">
                        <SequenceBarsChart data={streaks.reds.blocks} />
                      </div>
                    </div>
                  )}
                </Section>

                {/* SEÇÃO 3 — DISTRIBUIÇÃO DE STAKE */}
                <Section title="Consistência de stake">
                  <p className="text-[12px] text-muted-foreground italic">
                    Stake média isolada pode ser enganosa em operações com apostas de valores variados. A distribuição abaixo mostra onde está concentrado o volume real da operação.
                  </p>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-3">
                    <div className="border border-border/40 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30">
                          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            <Th>Faixa</Th>
                            <Th align="right">Apostas</Th>
                            <Th align="right">%</Th>
                            <Th align="right">Stake</Th>
                            <Th align="right">Lucro</Th>
                            <Th align="right">ROI</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {stakeDistribution.map((row) => {
                            const isPrincipal = stakeDistBest?.principalLabel === row.label && row.n > 0;
                            const isBestRoi = stakeDistBest?.bestRoiLabel === row.label && row.n > 0;
                            return (
                              <tr key={row.label} className="border-t border-border/30">
                                <td className="px-3 py-2 font-bold">
                                  <span className="inline-flex items-center gap-1.5">
                                    {row.label}
                                    {isPrincipal && (
                                      <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 font-bold">principal</span>
                                    )}
                                    {isBestRoi && (
                                      <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">melhor ROI</span>
                                    )}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{row.n}</td>
                                <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{fmtPct(row.pct)}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(row.stake)}</td>
                                <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", row.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                                  {row.n > 0 ? fmtMoney(row.profit) : "—"}
                                </td>
                                <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", row.roi >= 0 ? "text-emerald-400" : "text-red-400")}>
                                  {row.n > 0 ? fmtPctSigned(row.roi) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="w-full h-[200px] relative">
                      <StakeDistributionChart data={stakeDistribution} />
                    </div>
                  </div>
                </Section>

                {/* SEÇÃO 4 — STRIKE RATE PONDERADO */}
                <Section title="Strike rate ponderado por stake">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="border border-border/40 rounded-lg p-4 bg-card/40">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Win Rate Simples</p>
                      <p className="text-2xl font-black tabular-nums mt-1">{fmtPct(kpis.winRate)}</p>
                      <p className="text-[10px] text-muted-foreground/80 mt-1">(1 aposta = 1 voto)</p>
                    </div>
                    <div className="border border-border/40 rounded-lg p-4 bg-card/40">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Strike Rate Ponderado</p>
                      <p className="text-2xl font-black tabular-nums mt-1">{fmtPct(weightedStrike)}</p>
                      <p className="text-[10px] text-muted-foreground/80 mt-1">(R$ 1 = 1 voto)</p>
                    </div>
                  </div>
                  {(() => {
                    const diff = weightedStrike - kpis.winRate;
                    if (diff > 2) {
                      return (
                        <p className="text-xs text-emerald-400 mt-3">
                          Você acerta proporcionalmente mais nas apostas de maior valor. Sinal positivo de calibração de stake.
                        </p>
                      );
                    }
                    if (diff < -2) {
                      return (
                        <p className="text-xs text-orange-400 mt-3">
                          Você acerta proporcionalmente menos nas apostas de maior valor. Considere revisar os critérios de sizing.
                        </p>
                      );
                    }
                    return (
                      <p className="text-xs text-muted-foreground mt-3">
                        Assertividade consistente independente do valor apostado.
                      </p>
                    );
                  })()}
                </Section>

                {/* SEÇÃO 5 — PERFORMANCE POR BOOKMAKER */}
                <Section title="Performance por bookmaker">
                  {bookmakerPerf.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem dados.</p>
                  ) : (
                    <div className="border border-border/40 rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/30">
                          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            <Th>Casa</Th>
                            <Th align="right">Apostas</Th>
                            <Th align="right">Stake</Th>
                            <Th align="right">Lucro</Th>
                            <Th align="right">ROI</Th>
                            <Th align="right">Win Rate</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {bookmakerPerf.map((row) => {
                            const isBest = bookmakerStats.bestLabel === row.casa && row.n >= 10;
                            const isWorst = bookmakerStats.worstLabel === row.casa && row.n >= 10 && bookmakerStats.bestLabel !== row.casa;
                            const farBelow = row.n >= 10 && bookmakerStats.avgRoi - row.roi > 5;
                            return (
                              <tr
                                key={row.groupKey}
                                className={cn("border-t border-border/30", farBelow && "bg-red-500/[0.06]")}
                              >
                                <td className="px-3 py-2 font-semibold">
                                  <span className="inline-flex items-center gap-2">
                                    <BookmakerLogo
                                      logoUrl={row.logoUrl}
                                      alt={row.casa}
                                      size="h-6 w-6"
                                      iconSize="h-3.5 w-3.5"
                                    />
                                    <span className="truncate max-w-[200px]" title={row.casa}>{row.casa}</span>
                                    {isBest && (
                                      <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">melhor</span>
                                    )}
                                    {isWorst && (
                                      <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 font-bold">atenção</span>
                                    )}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{row.n}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(row.stake)}</td>
                                <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", row.profit >= 0 ? "text-emerald-400" : "text-red-400")}>
                                  {fmtMoney(row.profit)}
                                </td>
                                <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", row.roi >= 0 ? "text-emerald-400" : "text-red-400")}>
                                  {fmtPctSigned(row.roi)}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{fmtPct(row.winRate)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Section>
              </>
            )}
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
                          <td className="px-3 py-2 text-muted-foreground max-w-[180px]">
                            {(() => {
                              const info = b.bookmaker_id ? resolvedBookmakerMap.get(b.bookmaker_id) : null;
                              if (!info) return <span className="truncate">—</span>;
                              return (
                                <span className="inline-flex items-center gap-1.5">
                                  <BookmakerLogo
                                    logoUrl={info.logoUrl}
                                    alt={info.displayName}
                                    size="h-5 w-5"
                                    iconSize="h-3 w-3"
                                  />
                                  <span className="truncate" title={info.displayName}>{info.displayName}</span>
                                </span>
                              );
                            })()}
                          </td>
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
  sub,
  title,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "muted";
  sub?: string;
  title?: string;
}) {
  return (
    <div className="border border-border/40 rounded-lg px-3 py-2 bg-card/40" title={title}>
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
      {sub && (
        <p className="text-[9px] text-muted-foreground/80 mt-0.5 leading-tight truncate" title={sub}>
          {sub}
        </p>
      )}
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

/* ============================================================
 *  RISK-TAB CHART PRIMITIVES
 * ========================================================== */

function StreakCard({
  title,
  length,
  labelKind,
  startDate,
  endDate,
  pl,
  stakeAvg,
  tone,
}: {
  title: string;
  length: number;
  labelKind: string;
  startDate: string | null;
  endDate: string | null;
  pl: number;
  stakeAvg: number;
  tone: "pos" | "neg";
}) {
  const accent = tone === "pos" ? "text-emerald-400" : "text-red-500";
  return (
    <div className="border border-border/40 rounded-lg p-4 bg-card/40">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{title}</p>
      <p className={cn("text-3xl font-black tabular-nums mt-1", accent)}>{length}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{labelKind}</p>
      <div className="mt-3 flex flex-col gap-1 text-[11px]">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Período</span>
          <span className="tabular-nums">
            {length > 0 ? `${fmtDM(startDate)} → ${fmtDM(endDate)}` : "—"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">{tone === "pos" ? "Lucro" : "Prejuízo"}</span>
          <span className={cn("tabular-nums font-bold", accent)}>{length > 0 ? fmtMoney(pl) : "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Stake médio</span>
          <span className="tabular-nums">{length > 0 ? fmtMoney(stakeAvg) : "—"}</span>
        </div>
      </div>
    </div>
  );
}

/* --- Drawdown depth area chart --- */
function DrawdownTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as { dateLabel: string; drawdown: number; cumulative: number };
  return (
    <div
      className="pointer-events-none animate-in fade-in-0 duration-[120ms]"
      style={{
        background: "#1a1e2a",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        minWidth: 200,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
        {row.dateLabel}
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Drawdown</span>
        <span className="font-bold tabular-nums" style={{ color: "#ef4444", fontSize: 14 }}>{fmtMoney(Math.abs(row.drawdown))}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 mt-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Acumulado</span>
        <span className="font-semibold tabular-nums" style={{ color: row.cumulative >= 0 ? "#22c55e" : "#ef4444", fontSize: 13 }}>{fmtMoney(row.cumulative)}</span>
      </div>
    </div>
  );
}

function DrawdownChart({ data }: { data: Array<{ idx: number; date: string; dateLabel: string; cumulative: number; drawdown: number }> }) {
  const step = Math.max(1, Math.ceil(data.length / 12));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 6 }}>
        <defs>
          <linearGradient id="ddFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="dateLabel"
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
          axisLine={false}
          tickLine={false}
          interval={step - 1}
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
          content={<DrawdownTooltip />}
          animationDuration={120}
        />
        <Area
          type="monotone"
          dataKey="drawdown"
          stroke="#ef4444"
          strokeWidth={1.5}
          fill="url(#ddFill)"
          dot={false}
          activeDot={{ r: 4, stroke: "#fff", strokeWidth: 2, fill: "#ef4444" }}
          isAnimationActive
          animationDuration={400}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* --- Sequence blocks bar chart --- */
function SequenceTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as { kind: "GREEN" | "RED"; length: number; pl: number; startDate: string; endDate: string };
  const c = row.kind === "GREEN" ? "#22c55e" : "#ef4444";
  return (
    <div
      className="pointer-events-none animate-in fade-in-0 duration-[120ms]"
      style={{
        background: "#1a1e2a",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        minWidth: 200,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
        Sequência
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[11px]" style={{ color: "#e5e7eb" }}>
          {row.length} {row.kind === "GREEN" ? "greens" : "reds"} consecutivos
        </span>
      </div>
      <div className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
        {fmtDM(row.startDate)} → {fmtDM(row.endDate)}
      </div>
      <div className="flex items-baseline justify-between gap-4 mt-1.5">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>
          {row.kind === "GREEN" ? "Lucro" : "Prejuízo"}
        </span>
        <span className="font-bold tabular-nums" style={{ color: c, fontSize: 13 }}>{fmtMoney(row.pl)}</span>
      </div>
    </div>
  );
}

function SequenceBarsChart({ data }: { data: Array<{ idx: number; kind: "GREEN" | "RED"; length: number; pl: number; startDate: string; endDate: string }> }) {
  const chartData = data.map((d) => ({
    ...d,
    name: String(d.idx + 1),
    value: d.kind === "GREEN" ? d.length : -d.length,
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 6 }} barCategoryGap="20%">
        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          wrapperStyle={{ outline: "none", zIndex: 60 }}
          content={<SequenceTooltip />}
          animationDuration={120}
        />
        <Bar dataKey="value" radius={[3, 3, 3, 3]} isAnimationActive animationDuration={400}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.kind === "GREEN" ? "#22c55e" : "#ef4444"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* --- Stake distribution horizontal bars --- */
function StakeDistTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  const row = payload[0].payload as { label: string; n: number; stake: number; profit: number; roi: number };
  const profitColor = row.profit >= 0 ? "#22c55e" : "#ef4444";
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
        {row.label}
      </div>
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Apostas</span>
        <span className="font-semibold tabular-nums" style={{ color: "#e5e7eb", fontSize: 13 }}>{row.n}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 mt-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>Lucro</span>
        <span className="font-bold tabular-nums" style={{ color: profitColor, fontSize: 13 }}>{fmtMoney(row.profit)}</span>
      </div>
      <div className="flex items-baseline justify-between gap-4 mt-1">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.5)" }}>ROI</span>
        <span className="font-bold tabular-nums" style={{ color: profitColor, fontSize: 13 }}>{fmtPctSigned(row.roi)}</span>
      </div>
    </div>
  );
}

function StakeDistributionChart({ data }: { data: Array<{ label: string; n: number; stake: number; profit: number; roi: number; pct: number }> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 8, right: 56, left: 8, bottom: 6 }}
        barGap={2}
        barCategoryGap="22%"
      >
        <CartesianGrid stroke="rgba(255,255,255,0.06)" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.45)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }}
          axisLine={false}
          tickLine={false}
          width={84}
        />
        <Tooltip
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
          wrapperStyle={{ outline: "none", zIndex: 60 }}
          content={<StakeDistTooltip />}
          animationDuration={120}
        />
        <Bar dataKey="n" fill="rgba(59,130,246,0.6)" radius={[3, 3, 3, 3]} isAnimationActive animationDuration={400} />
      </BarChart>
    </ResponsiveContainer>
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
  trend,
}: {
  data: Array<{ idx: number; total: number; date: string; dateLabel: string; bet: number; cumulative: number }>;
  trend?: Array<{ dateLabel: string; trendValue: number }>;
}) {
  const merged = trend
    ? data.map((d, i) => ({ ...d, trendValue: trend[i]?.trendValue }))
    : data;
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
      <ComposedChart data={merged} margin={{ top: 10, right: 16, left: 0, bottom: 6 }}>
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
          animationDuration={300}
        />
        {trend && (
          <Line
            type="linear"
            dataKey="trendValue"
            stroke="rgba(255,255,255,0.5)"
            strokeWidth={1}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            isAnimationActive={false}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/* --- Pill button for odd-range quick filter --- */
function FaixaPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-[11px] px-2.5 py-1 rounded-full border transition-all tabular-nums",
        active
          ? "border-white/30 bg-white/[0.08] text-foreground"
          : "border-white/[0.12] bg-transparent text-muted-foreground hover:text-foreground hover:border-white/20"
      )}
    >
      {label}
    </button>
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

/* ============================================================
 *  RESULT DISTRIBUTION — premium donut + cards + proportion bar
 * ========================================================== */

const DONUT_COLORS: Record<string, string> = {
  GREEN: "#22c55e",
  MEIO_GREEN: "#14b8a6",
  MEIO_RED: "#f97316",
  RED: "#ef4444",
  VOID: "#4b5563",
};

function ResultDistribution({ bets }: { bets: RawBet[] }) {
  const KEYS: Resultado[] = ["GREEN", "MEIO_GREEN", "MEIO_RED", "RED", "VOID"];
  const LEGEND_ORDER: Resultado[] = ["GREEN", "RED", "VOID", "MEIO_GREEN", "MEIO_RED"];

  const stats = useMemo(() => {
    const map = new Map<Resultado, { count: number; profit: number }>();
    KEYS.forEach((k) => map.set(k, { count: 0, profit: 0 }));
    bets.forEach((b) => {
      if (!b.resultado) return;
      const e = map.get(b.resultado as Resultado);
      if (!e) return;
      e.count += 1;
      e.profit += profitOf(b);
    });
    return map;
  }, [bets]);

  const totalValid = useMemo(
    () => KEYS.reduce((acc, k) => acc + (stats.get(k)?.count ?? 0), 0),
    [stats]
  );

  // Pie data (donut order = visual ordering around the ring)
  const pieData = useMemo(
    () =>
      KEYS.map((k) => ({
        key: k,
        name: RESULT_LABEL[k],
        value: stats.get(k)?.count ?? 0,
      })).filter((d) => d.value > 0),
    [stats]
  );

  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const hovered = activeIdx !== null ? pieData[activeIdx] : null;
  const hoveredPct = hovered && totalValid > 0 ? (hovered.value / totalValid) * 100 : 0;

  // Proportion bar: Green · Meio Green · Meio Red · Red · Void
  const BAR_ORDER: Resultado[] = ["GREEN", "MEIO_GREEN", "MEIO_RED", "RED", "VOID"];
  const barSegments = BAR_ORDER.map((k) => ({
    key: k,
    value: stats.get(k)?.count ?? 0,
    color: DONUT_COLORS[k],
  })).filter((s) => s.value > 0);

  const favoraveisPct =
    totalValid > 0
      ? (((stats.get("GREEN")?.count ?? 0) + (stats.get("MEIO_GREEN")?.count ?? 0)) / totalValid) * 100
      : 0;
  const desfavoraveisPct =
    totalValid > 0
      ? (((stats.get("RED")?.count ?? 0) + (stats.get("MEIO_RED")?.count ?? 0)) / totalValid) * 100
      : 0;

  // Active shape: keep same dimensions but offset outward +6px
  const renderActiveShape = (props: any) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
    return (
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius + 6}
        outerRadius={outerRadius + 6}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    );
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Donut */}
        <div className="relative w-full h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="56%"
                outerRadius="78%"
                paddingAngle={2}
                stroke="none"
                startAngle={90}
                endAngle={-270}
                isAnimationActive
                animationDuration={600}
                animationEasing="ease-out"
                activeIndex={activeIdx ?? undefined}
                activeShape={renderActiveShape}
                onMouseLeave={() => setActiveIdx(null)}
              >
                {pieData.map((d, i) => {
                  const dim = activeIdx !== null && activeIdx !== i;
                  return (
                    <Cell
                      key={i}
                      fill={DONUT_COLORS[d.key]}
                      onMouseEnter={() => setActiveIdx(i)}
                      style={{
                        opacity: dim ? 0.5 : 1,
                        transition: "opacity 150ms ease-out",
                        cursor: "pointer",
                        outline: "none",
                      }}
                    />
                  );
                })}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {hovered ? (
              <>
                <span
                  className="font-bold tabular-nums leading-none"
                  style={{ fontSize: 22, color: DONUT_COLORS[hovered.key] }}
                >
                  {fmtPct(hoveredPct)}
                </span>
                <span
                  className="mt-1 uppercase tracking-widest font-semibold"
                  style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}
                >
                  {hovered.name}
                </span>
              </>
            ) : (
              <>
                <span
                  className="font-bold tabular-nums leading-none"
                  style={{ fontSize: 22, color: "#e5e7eb" }}
                >
                  {totalValid.toLocaleString("pt-BR")}
                </span>
                <span
                  className="mt-1 uppercase tracking-widest font-semibold"
                  style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}
                >
                  apostas
                </span>
              </>
            )}
          </div>
        </div>

        {/* Legend cards */}
        <div className="flex flex-col">
          {LEGEND_ORDER.map((k) => {
            const s = stats.get(k);
            if (!s || s.count === 0) return null;
            const pct = totalValid > 0 ? (s.count / totalValid) * 100 : 0;
            const isVoid = k === "VOID";
            const profitColor = isVoid
              ? "rgba(255,255,255,0.4)"
              : s.profit >= 0
                ? "#22c55e"
                : "#ef4444";
            const profitLabel = isVoid
              ? "—"
              : `${s.profit >= 0 ? "+" : "-"}${fmtMoney(Math.abs(s.profit)).replace("R$ ", "R$ ")}`;
            return (
              <div
                key={k}
                className="flex items-center gap-3 px-3 py-[10px] rounded-md transition-colors hover:bg-white/[0.04]"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: DONUT_COLORS[k] }}
                />
                <span className="text-xs font-semibold text-foreground min-w-[88px]">
                  {RESULT_LABEL[k]}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground min-w-[78px]">
                  {s.count.toLocaleString("pt-BR")} apostas
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground min-w-[58px]">
                  {fmtPct(pct)}
                </span>
                <span
                  className="text-xs tabular-nums font-bold ml-auto"
                  style={{ color: profitColor }}
                >
                  {profitLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Proportion bar */}
      <div>
        <div
          className="flex w-full overflow-hidden"
          style={{ height: 6, borderRadius: 3 }}
        >
          {barSegments.map((s) => (
            <div
              key={s.key}
              style={{
                width: `${(s.value / totalValid) * 100}%`,
                background: s.color,
              }}
            />
          ))}
        </div>
        <div className="flex items-center justify-between mt-2 text-[11px] font-semibold">
          <span style={{ color: "#22c55e" }}>
            ✓ Favoráveis {fmtPct(favoraveisPct)}
          </span>
          <span style={{ color: "#ef4444" }}>
            ✗ Desfavoráveis {fmtPct(desfavoraveisPct)}
          </span>
        </div>
      </div>
    </div>
  );
}