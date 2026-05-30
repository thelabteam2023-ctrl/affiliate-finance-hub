import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
  LineChart,
  Line,
} from "recharts";
import { cn } from "@/lib/utils";
import { Info, Sparkles, TrendingUp, AlertTriangle, Target } from "lucide-react";
import {
  agregarEdgeStats,
  distribuirEdgeComPL,
  edgeMedioPorMes,
  calcularEdge,
  classificarQuadrante,
  type QuadranteEdge,
} from "@/utils/edgeCalculator";
import { format, parseISO } from "date-fns";

interface EdgeRow {
  odd?: number | null;
  fair_odd?: number | null;
  resultado?: string | null;
  stake?: number | null;
  pl?: number | null;
  data_aposta?: string | null;
}

interface Props {
  /** Bets do mercado já filtrados. Esperam-se os campos brutos. */
  bets: Array<any>;
}

const fmtPct = (n: number) => `${n.toFixed(2)}%`;
const fmtPctSigned = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const fmtMoney = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function stakeOf(b: any) {
  return Number(b.stake_consolidado ?? b.valor_brl_referencia ?? b.stake_total ?? 0);
}
function profitOf(b: any) {
  return Number(b.pl_consolidado ?? b.lucro_prejuizo ?? 0);
}

const QUADRANT_META: Record<
  QuadranteEdge,
  { title: string; subtitle: string; color: string; bg: string; border: string; icon: React.ComponentType<any> }
> = {
  Q1: {
    title: "Correto e Lucrativo",
    subtitle: "Edge > 0 · Ganhou",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: Sparkles,
  },
  Q2: {
    title: "Correto com Variância",
    subtitle: "Edge > 0 · Perdeu",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: TrendingUp,
  },
  Q3: {
    title: "Sorte (sem Edge)",
    subtitle: "Edge ≤ 0 · Ganhou",
    color: "text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    icon: Target,
  },
  Q4: {
    title: "Sem Edge, Perdendo",
    subtitle: "Edge ≤ 0 · Perdeu",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: AlertTriangle,
  },
};

function TooltipShell({ title, children }: { title: string; children: React.ReactNode }) {
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
      <div className="text-[10px] uppercase tracking-widest font-semibold mb-2" style={{ color: "rgba(255,255,255,0.5)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function HistogramTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <TooltipShell title={`Edge ${label}`}>
      <div className="space-y-1">
        <div className="flex justify-between gap-6">
          <span className="text-[11px] text-white/55">Apostas</span>
          <span className="font-bold tabular-nums text-white" style={{ fontSize: 13 }}>{row.n}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-[11px] text-white/55">Stake</span>
          <span className="font-bold tabular-nums text-white" style={{ fontSize: 13 }}>{fmtMoney(row.stake)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span className="text-[11px] text-white/55">Lucro</span>
          <span
            className="font-bold tabular-nums"
            style={{ fontSize: 13, color: row.profit >= 0 ? "#22c55e" : "#ef4444" }}
          >
            {fmtMoney(row.profit)}
          </span>
        </div>
        <div className="flex justify-between gap-6 pt-1 mt-1 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <span className="text-[11px] text-white/55">ROI</span>
          <span
            className="font-bold tabular-nums"
            style={{ fontSize: 13, color: row.roi >= 0 ? "#22c55e" : "#ef4444" }}
          >
            {fmtPctSigned(row.roi)}
          </span>
        </div>
      </div>
    </TooltipShell>
  );
}

function MonthlyEdgeTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const color = row.edgeMedio >= 0 ? "#22c55e" : "#ef4444";
  return (
    <TooltipShell title={label}>
      <div className="font-bold tabular-nums leading-none" style={{ color, fontSize: 15 }}>
        {fmtPctSigned(row.edgeMedio)}
      </div>
      <div className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.55)" }}>
        {row.n} aposta{row.n === 1 ? "" : "s"} com fair odd
      </div>
    </TooltipShell>
  );
}

export function EdgeAnalysisTab({ bets }: Props) {
  const rows: EdgeRow[] = useMemo(
    () =>
      bets.map((b) => ({
        odd: b.odd,
        fair_odd: b.fair_odd,
        resultado: b.resultado,
        stake: stakeOf(b),
        pl: profitOf(b),
        data_aposta: b.data_aposta,
      })),
    [bets],
  );

  const stats = useMemo(() => agregarEdgeStats(rows), [rows]);
  const histogram = useMemo(() => distribuirEdgeComPL(rows), [rows]);
  const monthly = useMemo(
    () =>
      edgeMedioPorMes(rows).map((m) => ({
        ...m,
        label: format(parseISO(`${m.month}-01`), "MM/yy"),
      })),
    [rows],
  );

  if (stats.apostasComEdge === 0) {
    return (
      <div className="space-y-4">
        <div className="border border-dashed border-border/40 rounded-lg p-8 text-center bg-card/30">
          <Info className="w-6 h-6 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground mb-1">
            Sem dados de Fair Odd
          </h3>
          <p className="text-xs text-muted-foreground/80 max-w-md mx-auto">
            Nenhuma das {stats.apostasTotal.toLocaleString("pt-BR")} apostas deste mercado possui
            <span className="font-semibold text-foreground"> fair_odd </span>
            registrada — a análise de Edge fica disponível assim que apostas com fair odd forem importadas.
          </p>
        </div>
      </div>
    );
  }

  const totalQuad = stats.quadrantes.Q1 + stats.quadrantes.Q2 + stats.quadrantes.Q3 + stats.quadrantes.Q4;

  return (
    <div className="space-y-6">
      {/* Coverage banner */}
      <div className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/20 border border-border/30 rounded px-3 py-2">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Análise calculada sobre{" "}
          <span className="font-semibold text-foreground">
            {stats.apostasComEdge.toLocaleString("pt-BR")} de {stats.apostasTotal.toLocaleString("pt-BR")} apostas
          </span>{" "}
          ({fmtPct(stats.cobertura)}) — apenas apostas com fair odd registrada participam.
        </span>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <KpiEdge
          label="Edge Médio"
          value={fmtPctSigned(stats.edgeMedio)}
          tone={stats.edgeMedio >= 0 ? "pos" : "neg"}
          sub={`mediana ${fmtPctSigned(stats.edgeMediano)}`}
        />
        <KpiEdge label="% Com Value" value={fmtPct(stats.pctComValue)} tone="pos" sub={`${stats.comValue} apostas`} />
        <KpiEdge label="% Sem Value" value={fmtPct(stats.pctSemValue)} tone="neg" sub={`${stats.semValue} apostas`} />
        <KpiEdge label="Maior Edge" value={fmtPctSigned(stats.maiorEdge)} tone="pos" />
        <KpiEdge label="Menor Edge" value={fmtPctSigned(stats.menorEdge)} tone="neg" />
        <KpiEdge label="Cobertura" value={fmtPct(stats.cobertura)} sub={`${stats.apostasComEdge}/${stats.apostasTotal}`} />
      </div>

      {/* Histogram */}
      <section className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border/30 pb-2">
          Distribuição de Edge
        </h3>
        <div className="border border-border/40 rounded-lg p-4 bg-card/40">
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogram} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#888" }} width={36} />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<HistogramTooltip />} />
                <Bar dataKey="n" radius={[4, 4, 0, 0]} animationDuration={400}>
                  {histogram.map((b, i) => (
                    <Cell
                      key={i}
                      fill={b.color}
                      fillOpacity={b.opacity}
                      style={b.glow ? { filter: "drop-shadow(0 0 6px rgba(34,197,94,0.6))" } : undefined}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Quadrantes */}
      <section className="space-y-3">
        <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border/30 pb-2">
          Qualidade da Decisão · Edge × Resultado
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(["Q1", "Q2", "Q3", "Q4"] as QuadranteEdge[]).map((q) => {
            const meta = QUADRANT_META[q];
            const n = stats.quadrantes[q];
            const pct = totalQuad > 0 ? (n / totalQuad) * 100 : 0;
            const Icon = meta.icon;
            return (
              <div key={q} className={cn("rounded-lg border p-4 transition-colors", meta.bg, meta.border)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Icon className={cn("w-3.5 h-3.5", meta.color)} />
                      <span className={cn("text-[11px] font-black uppercase tracking-wider", meta.color)}>
                        {meta.title}
                      </span>
                    </div>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/80">{meta.subtitle}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("text-2xl font-black tabular-nums leading-none", meta.color)}>{n}</p>
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70 mt-1">
                      {fmtPct(pct)}
                    </p>
                  </div>
                </div>
                {/* mini progress bar */}
                <div className="mt-3 h-1 rounded-full overflow-hidden bg-white/5">
                  <div
                    className={cn(
                      "h-full transition-all",
                      q === "Q1" && "bg-emerald-500",
                      q === "Q2" && "bg-amber-500",
                      q === "Q3" && "bg-sky-500",
                      q === "Q4" && "bg-red-500",
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Tendência mensal */}
      {monthly.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground border-b border-border/30 pb-2">
            Tendência de Edge Médio
          </h3>
          <div className="border border-border/40 rounded-lg p-4 bg-card/40">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#888" }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#888" }}
                    tickFormatter={(v) => `${v.toFixed(1)}%`}
                    width={48}
                  />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                  <Tooltip cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }} content={<MonthlyEdgeTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="edgeMedio"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#8b5cf6", strokeWidth: 0 }}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "#0b0f17", fill: "#8b5cf6" }}
                    animationDuration={400}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function KpiEdge({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "muted";
  sub?: string;
}) {
  return (
    <div className="border border-border/40 rounded-lg px-3 py-2 bg-card/40">
      <p className="text-[9px] uppercase tracking-widest text-muted-foreground font-bold">{label}</p>
      <p
        className={cn(
          "text-sm font-black tabular-nums mt-0.5",
          tone === "pos" && "text-emerald-400",
          tone === "neg" && "text-red-400",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[9px] text-muted-foreground/80 mt-0.5 leading-tight truncate">{sub}</p>}
    </div>
  );
}