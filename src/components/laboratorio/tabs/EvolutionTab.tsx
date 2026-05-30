import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, ComposedChart, Bar, Line, ReferenceLine, Cell,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface EvolutionTabProps {
  evolution: Array<{ date: string; profit: number; volume: number; bets: number }>;
  evolutionByEntry?: Array<{ index: number; profit: number; cumulative: number; date: string; label: string }>;
}

const fmtBRL = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtBRLShort = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1000) return `R$${(n / 1000).toFixed(1).replace(".", ",")}k`;
  return `R$${n.toFixed(0)}`;
};
const fmtPctSigned = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

/* --- Premium tooltip shells matching MarketDrillDownModal --- */
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

function CumulativeTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = Number(payload[0].value);
  const color = v >= 0 ? "#22c55e" : "#ef4444";
  return (
    <TooltipShell title={label}>
      <div className="font-bold tabular-nums leading-none" style={{ color, fontSize: 15 }}>{fmtBRL(v)}</div>
      <div className="text-[10px] mt-1.5" style={{ color: "rgba(255,255,255,0.4)" }}>Lucro acumulado</div>
    </TooltipShell>
  );
}

function RoiDailyTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const roi = Number(row.roi);
  const color = roi >= 0 ? "#22c55e" : "#ef4444";
  return (
    <TooltipShell title={label}>
      <div className="font-bold tabular-nums leading-none" style={{ color, fontSize: 15 }}>{fmtPctSigned(roi)}</div>
      <div className="text-[10px] mt-1.5 space-y-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
        <div className="flex items-center justify-between gap-4">
          <span>Lucro</span>
          <span className="tabular-nums" style={{ color: row.profit >= 0 ? "#22c55e" : "#ef4444" }}>{fmtBRL(row.profit)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Volume</span>
          <span className="tabular-nums">{fmtBRL(row.volume)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Apostas</span>
          <span className="tabular-nums">{row.bets}</span>
        </div>
      </div>
    </TooltipShell>
  );
}

function VolumeComposedTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const profit = Number(row.profit);
  const roi = Number(row.roi);
  const profitColor = profit >= 0 ? "#22c55e" : "#ef4444";
  const roiColor = roi >= 0 ? "#22c55e" : "#ef4444";
  return (
    <TooltipShell title={label}>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-6">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(96,165,250,0.9)" }}>Volume</span>
          <span className="font-bold tabular-nums" style={{ color: "#60a5fa", fontSize: 14 }}>{fmtBRL(row.volume)}</span>
        </div>
        <div className="flex items-center justify-between gap-6">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>Lucro</span>
          <span className="font-bold tabular-nums" style={{ color: profitColor, fontSize: 14 }}>{fmtBRL(profit)}</span>
        </div>
        <div className="flex items-center justify-between gap-6 pt-1.5 mt-1.5 border-t" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <span className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.55)" }}>ROI</span>
          <span className="font-bold tabular-nums" style={{ color: roiColor, fontSize: 14 }}>{fmtPctSigned(roi)}</span>
        </div>
        <div className="text-[10px] pt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
          {row.bets} aposta{row.bets === 1 ? "" : "s"}
        </div>
      </div>
    </TooltipShell>
  );
}

export function EvolutionTab({ evolution, evolutionByEntry }: EvolutionTabProps) {
  let cumulativeProfit = 0;
  const chartData = evolution.map((item) => {
    cumulativeProfit += item.profit;
    return {
      ...item,
      cumulativeProfit,
      roi: item.volume > 0 ? (item.profit / item.volume) * 100 : 0,
      formattedDate: format(parseISO(item.date), "dd/MM", { locale: ptBR }),
    };
  });

  const entryData = evolutionByEntry || [];
  const cumulativeData = entryData.length > 0 ? entryData : chartData;
  const cumulativeKey = entryData.length > 0 ? "cumulative" : "cumulativeProfit";
  const cumulativeXKey = entryData.length > 0 ? "label" : "formattedDate";

  const lastRow = cumulativeData.length > 0 ? cumulativeData[cumulativeData.length - 1] : null;
  const lastCumulative = Number((lastRow as any)?.[cumulativeKey] ?? 0);
  const cumulativeColor = lastCumulative >= 0 ? "#22c55e" : "#ef4444";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Lucro Acumulado */}
      <Card className="bg-card/40 border-border/40">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
            {entryData.length > 0 ? "Evolução Entrada por Entrada" : "Lucro Acumulado Diário"}
          </CardTitle>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground/70">Acumulado</div>
            <div className="text-base font-bold tabular-nums" style={{ color: cumulativeColor }}>
              {fmtBRL(lastCumulative)}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cumulativeData} margin={{ top: 12, right: 16, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="evoCumPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="evoCumNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey={cumulativeXKey} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#888" }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#888" }} tickFormatter={fmtBRLShort} width={60} />
                <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                <Tooltip cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }} content={<CumulativeTooltip />} />
                <Area
                  type="monotone"
                  dataKey={cumulativeKey}
                  stroke={cumulativeColor}
                  strokeWidth={2.5}
                  fill={`url(#${lastCumulative >= 0 ? "evoCumPos" : "evoCumNeg"})`}
                  animationDuration={400}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: "#0b0f17", fill: cumulativeColor }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* ROI Diário */}
        <Card className="bg-card/40 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              ROI Diário
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 12, right: 8, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="roiAreaPos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#888" }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#888" }} tickFormatter={(v) => `${v}%`} width={42} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                  <Tooltip cursor={{ stroke: "rgba(255,255,255,0.15)", strokeWidth: 1 }} content={<RoiDailyTooltip />} />
                  <Area type="monotone" dataKey="roi" stroke="none" fill="url(#roiAreaPos)" animationDuration={400} />
                  <Line
                    type="monotone"
                    dataKey="roi"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: "#0b0f17", fill: "#8b5cf6" }}
                    animationDuration={400}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Volume Diário com Lucro e ROI sobrepostos */}
        <Card className="bg-card/40 border-border/40">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Volume × Lucro × ROI Diário
            </CardTitle>
            <div className="flex items-center gap-3 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#60a5fa", opacity: 0.55 }} />
                Volume
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "#22c55e" }} />
                Lucro
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block w-3 h-0.5" style={{ background: "#f59e0b" }} />
                ROI
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={chartData}
                  margin={{ top: 12, right: 8, left: 0, bottom: 8 }}
                  barGap={-9999}
                  barCategoryGap="25%"
                >
                  <defs>
                    <linearGradient id="volBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.55} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.25} />
                    </linearGradient>
                    <linearGradient id="profitPos" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#4ade80" stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="profitNeg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#dc2626" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="formattedDate" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#888" }} />
                  <YAxis
                    yAxisId="left"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#888" }}
                    tickFormatter={fmtBRLShort}
                    width={56}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 10, fill: "#f59e0b" }}
                    tickFormatter={(v) => `${v}%`}
                    width={42}
                  />
                  <ReferenceLine yAxisId="left" y={0} stroke="rgba(255,255,255,0.15)" strokeDasharray="2 2" />
                  <Tooltip
                    cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    content={<VolumeComposedTooltip />}
                  />
                  {/* Volume bar (background, wider) */}
                  <Bar
                    yAxisId="left"
                    dataKey="volume"
                    fill="url(#volBar)"
                    radius={[4, 4, 0, 0]}
                    animationDuration={400}
                    barSize={28}
                  />
                  {/* Profit bar (overlay, narrower, centered) */}
                  <Bar
                    yAxisId="left"
                    dataKey="profit"
                    radius={[3, 3, 0, 0]}
                    animationDuration={400}
                    barSize={12}
                  >
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={d.profit >= 0 ? "url(#profitPos)" : "url(#profitNeg)"} />
                    ))}
                  </Bar>
                  {/* ROI line on right axis */}
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="roi"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: "#0b0f17", fill: "#f59e0b" }}
                    animationDuration={400}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}