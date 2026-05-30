import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  VOID: "#64748b",
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

        <div className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-8">
            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <Kpi label="Apostas" value={kpis.total.toString()} />
              <Kpi label="Stake" value={fmtMoney(kpis.stake)} />
              <Kpi
                label="Lucro"
                value={fmtMoney(kpis.profit)}
                tone={kpis.profit >= 0 ? "pos" : "neg"}
              />
              <Kpi
                label="ROI"
                value={fmtPct(kpis.roi)}
                tone={kpis.roi >= 0 ? "pos" : "neg"}
              />
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
                na tabela para interpretar manualmente.
              </span>
            </div>

            {/* SEÇÃO 1 — Faixas de Odd */}
            <Section title="Faixas de Odd">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="border border-border/40 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30">
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        <Th>Faixa</Th>
                        <Th align="right">Apostas</Th>
                        <Th align="right">Stake</Th>
                        <Th align="right">Lucro</Th>
                        <Th align="right">ROI</Th>
                        <Th align="right">Win Rate</Th>
                        <Th align="right">G</Th>
                        <Th align="right">R</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {oddRangeRows.length === 0 && (
                        <tr>
                          <td colSpan={8} className="text-center py-6 text-muted-foreground">
                            Sem dados.
                          </td>
                        </tr>
                      )}
                      {oddRangeRows.map((r) => {
                        const isBest = bestOddRange?.range === r.range;
                        return (
                          <tr
                            key={r.range}
                            className={cn(
                              "border-t border-border/30",
                              isBest && "bg-emerald-500/10",
                            )}
                          >
                            <td className="px-3 py-2 font-bold flex items-center gap-1.5">
                              {isBest && <Trophy className="w-3 h-3 text-emerald-500" />}
                              {r.range}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.total}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.stake)}</td>
                            <td
                              className={cn(
                                "px-3 py-2 text-right tabular-nums font-semibold",
                                r.profit >= 0 ? "text-green-500" : "text-red-500",
                              )}
                            >
                              {fmtMoney(r.profit)}
                            </td>
                            <td
                              className={cn(
                                "px-3 py-2 text-right tabular-nums font-semibold",
                                r.roi >= 0 ? "text-green-500" : "text-red-500",
                              )}
                            >
                              {fmtPct(r.roi)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtPct(r.winRate)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-green-500">{r.greens}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-red-500">{r.reds}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="h-64">
                  <ResponsiveContainer>
                    <BarChart data={oddRangeRows}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="range" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} unit="%" />
                      <Tooltip
                        formatter={(v: any) => fmtPct(Number(v))}
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontSize: 11,
                        }}
                      />
                      <Bar dataKey="roi" radius={[4, 4, 0, 0]}>
                        {oddRangeRows.map((r, i) => (
                          <Cell
                            key={i}
                            fill={r.roi >= 0 ? "hsl(var(--primary))" : "hsl(0 84% 60%)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Section>

            {/* SEÇÃO 2 — Evolução temporal */}
            <Section title="Evolução temporal (mensal)">
              {monthlyRows.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem dados.</p>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="h-64">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      Lucro por mês
                    </p>
                    <ResponsiveContainer>
                      <BarChart data={monthlyRows}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <Tooltip
                          formatter={(v: any) => fmtMoney(Number(v))}
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            fontSize: 11,
                          }}
                        />
                        <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                          {monthlyRows.map((r, i) => (
                            <Cell key={i} fill={r.profit >= 0 ? "#22c55e" : "#ef4444"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="h-64">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                      ROI por mês
                    </p>
                    <ResponsiveContainer>
                      <LineChart data={monthlyRows}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} unit="%" />
                        <Tooltip
                          formatter={(v: any) => fmtPct(Number(v))}
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            fontSize: 11,
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="roi"
                          stroke="hsl(var(--primary))"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </Section>

            {/* SEÇÃO 3 — Distribuição de resultados */}
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
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={2}
                        >
                          {pieData.map((d, i) => (
                            <Cell key={i} fill={RESULT_COLORS[d.key]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "hsl(var(--card))",
                            border: "1px solid hsl(var(--border))",
                            fontSize: 11,
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2">
                    {pieData.map((d) => {
                      const pct = kpis.total > 0 ? (d.value / kpis.total) * 100 : 0;
                      return (
                        <div
                          key={d.key}
                          className="flex items-center justify-between border border-border/30 rounded px-3 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="w-3 h-3 rounded-sm"
                              style={{ background: RESULT_COLORS[d.key] }}
                            />
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

            {/* SEÇÃO 4 — Tabela de apostas */}
            <Section title={`Apostas (${filteredTableBets.length})`}>
              <div className="flex flex-wrap gap-2 mb-3">
                <Input
                  placeholder="Buscar evento, seleção, casa..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="h-8 text-xs max-w-xs"
                />
                <Select
                  value={filterRange}
                  onValueChange={(v) => {
                    setFilterRange(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs w-[180px]">
                    <SelectValue placeholder="Faixa de odd" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todas as faixas</SelectItem>
                    {ODD_RANGES.map((r) => (
                      <SelectItem key={r.label} value={r.label}>
                        {r.label}
                      </SelectItem>
                    ))}
                    <SelectItem value="N/A">N/A</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={filterResult}
                  onValueChange={(v) => {
                    setFilterResult(v);
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs w-[160px]">
                    <SelectValue placeholder="Resultado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Todos resultados</SelectItem>
                    {(["GREEN", "MEIO_GREEN", "MEIO_RED", "RED", "VOID"] as const).map((r) => (
                      <SelectItem key={r} value={r}>
                        {RESULT_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="border border-border/40 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        <SortableTh sortKey="data" current={sortKey} dir={sortDir} onClick={toggleSort}>
                          Data
                        </SortableTh>
                        <SortableTh sortKey="evento" current={sortKey} dir={sortDir} onClick={toggleSort}>
                          Evento
                        </SortableTh>
                        <SortableTh sortKey="selecao" current={sortKey} dir={sortDir} onClick={toggleSort}>
                          Seleção
                        </SortableTh>
                        <SortableTh align="right" sortKey="odd" current={sortKey} dir={sortDir} onClick={toggleSort}>
                          Odd
                        </SortableTh>
                        <SortableTh sortKey="faixa" current={sortKey} dir={sortDir} onClick={toggleSort}>
                          Faixa
                        </SortableTh>
                        <SortableTh align="right" sortKey="stake" current={sortKey} dir={sortDir} onClick={toggleSort}>
                          Stake
                        </SortableTh>
                        <SortableTh align="right" sortKey="lucro" current={sortKey} dir={sortDir} onClick={toggleSort}>
                          Lucro
                        </SortableTh>
                        <SortableTh sortKey="resultado" current={sortKey} dir={sortDir} onClick={toggleSort}>
                          Resultado
                        </SortableTh>
                        <SortableTh sortKey="casa" current={sortKey} dir={sortDir} onClick={toggleSort}>
                          Casa
                        </SortableTh>
                      </tr>
                    </thead>
                    <tbody>
                      {pageBets.length === 0 && (
                        <tr>
                          <td colSpan={9} className="text-center py-8 text-muted-foreground">
                            Nenhuma aposta corresponde aos filtros.
                          </td>
                        </tr>
                      )}
                      {pageBets.map((b) => {
                        const lucro = profitOf(b);
                        return (
                          <tr key={b.id} className="border-t border-border/30 hover:bg-muted/20">
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                              {b.data_aposta ? format(parseISO(b.data_aposta), "dd/MM/yy HH:mm") : "—"}
                            </td>
                            <td className="px-3 py-2 max-w-[260px] truncate" title={b.evento ?? ""}>
                              {b.evento ?? "—"}
                            </td>
                            <td className="px-3 py-2 max-w-[200px] truncate" title={b.selecao ?? ""}>
                              {b.selecao ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {b.odd != null ? b.odd.toFixed(2) : "—"}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">{getOddRange(b.odd)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(stakeOf(b))}</td>
                            <td
                              className={cn(
                                "px-3 py-2 text-right tabular-nums font-semibold",
                                lucro >= 0 ? "text-green-500" : "text-red-500",
                              )}
                            >
                              {fmtMoney(lucro)}
                            </td>
                            <td className="px-3 py-2">
                              {b.resultado ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-bold border-none"
                                  style={{
                                    background: `${RESULT_COLORS[b.resultado]}22`,
                                    color: RESULT_COLORS[b.resultado],
                                  }}
                                >
                                  {RESULT_LABEL[b.resultado]}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">
                              {b.bookmaker_id ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border/60 bg-muted/40 font-bold">
                        <td colSpan={5} className="px-3 py-2 text-[10px] uppercase tracking-wider">
                          Totais filtrados ({filteredTableBets.length})
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(totals.stake)}</td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums",
                            totals.profit >= 0 ? "text-green-500" : "text-red-500",
                          )}
                        >
                          {fmtMoney(totals.profit)}
                        </td>
                        <td
                          colSpan={2}
                          className={cn(
                            "px-3 py-2 text-right tabular-nums",
                            totals.roi >= 0 ? "text-green-500" : "text-red-500",
                          )}
                        >
                          ROI {fmtPct(totals.roi)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="text-muted-foreground">
                    Página {safePage} de {totalPages} · {PAGE_SIZE} por página
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={safePage === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={safePage === totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    >
                      Próxima
                    </Button>
                  </div>
                </div>
              )}
            </Section>
          </div>
        </div>
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