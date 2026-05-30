import { MarketStats } from "@/hooks/useValueBetLabData";
import { EvolutionTab } from "./EvolutionTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";

interface StatisticsTabProps {
  markets: Record<string, MarketStats>;
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
        minWidth: 180,
      }}
    >
      <div className="text-[10px] uppercase tracking-widest font-semibold mb-1.5" style={{ color: "rgba(255,255,255,0.5)" }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function MarketRoiTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const roi = Number(row.roi);
  const color = roi >= 0 ? "#22c55e" : "#ef4444";
  return (
    <TooltipShell title={row.name}>
      <div className="font-bold tabular-nums leading-none" style={{ color, fontSize: 15 }}>{fmtPctSigned(roi)}</div>
      <div className="text-[10px] mt-2 space-y-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
        <div className="flex items-center justify-between gap-4">
          <span>Lucro</span>
          <span className="tabular-nums" style={{ color: row.profit >= 0 ? "#22c55e" : "#ef4444" }}>{fmtBRL(row.profit)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>Volume</span>
          <span className="tabular-nums">{fmtBRL(row.volume)}</span>
        </div>
      </div>
    </TooltipShell>
  );
}

function MarketVolumeTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <TooltipShell title={row.name}>
      <div className="font-bold tabular-nums leading-none" style={{ color: "#60a5fa", fontSize: 15 }}>{fmtBRL(row.volume)}</div>
      <div className="text-[10px] mt-2 space-y-0.5" style={{ color: "rgba(255,255,255,0.55)" }}>
        <div className="flex items-center justify-between gap-4">
          <span>Lucro</span>
          <span className="tabular-nums" style={{ color: row.profit >= 0 ? "#22c55e" : "#ef4444" }}>{fmtBRL(row.profit)}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span>ROI</span>
          <span className="tabular-nums" style={{ color: row.roi >= 0 ? "#22c55e" : "#ef4444" }}>{fmtPctSigned(row.roi)}</span>
        </div>
      </div>
    </TooltipShell>
  );
}

export function StatisticsTab({ markets, evolution, evolutionByEntry }: StatisticsTabProps) {
  const marketList = Object.values(markets).sort((a, b) => b.total - a.total);

  const chartData = marketList.slice(0, 10).map((m) => ({
    name: m.name,
    roi: m.roi,
    volume: m.stake,
    profit: m.profit,
  }));

  const sortedByVolume = [...chartData].sort((a, b) => b.volume - a.volume);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <EvolutionTab evolution={evolution} evolutionByEntry={evolutionByEntry} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ROI por Mercado */}
        <Card className="bg-card/40 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              ROI por Mercado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 8, right: 56, left: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="mktRoiPos" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#16a34a" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="#4ade80" stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="mktRoiNeg" x1="1" y1="0" x2="0" y2="0">
                      <stop offset="0%" stopColor="#dc2626" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#f87171" stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    width={120}
                    tick={{ fontSize: 11, fill: "#cbd5e1" }}
                  />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<MarketRoiTooltip />} />
                  <Bar dataKey="roi" radius={[0, 6, 6, 0]} barSize={18} animationDuration={400}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.roi >= 0 ? "url(#mktRoiPos)" : "url(#mktRoiNeg)"} />
                    ))}
                    <LabelList
                      dataKey="roi"
                      position="right"
                      formatter={(v: number) => fmtPctSigned(v)}
                      style={{ fontSize: 10, fontWeight: 700, fill: "#e5e7eb" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Volume por Mercado */}
        <Card className="bg-card/40 border-border/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Volume Apostado por Mercado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[320px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sortedByVolume} layout="vertical" margin={{ top: 8, right: 64, left: 8, bottom: 8 }}>
                  <defs>
                    <linearGradient id="mktVolBar" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.85} />
                      <stop offset="100%" stopColor="#60a5fa" stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} vertical stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" hide />
                  <YAxis
                    dataKey="name"
                    type="category"
                    axisLine={false}
                    tickLine={false}
                    width={120}
                    tick={{ fontSize: 11, fill: "#cbd5e1" }}
                  />
                  <Tooltip cursor={{ fill: "rgba(255,255,255,0.04)" }} content={<MarketVolumeTooltip />} />
                  <Bar dataKey="volume" fill="url(#mktVolBar)" radius={[0, 6, 6, 0]} barSize={18} animationDuration={400}>
                    <LabelList
                      dataKey="volume"
                      position="right"
                      formatter={(v: number) => fmtBRLShort(v)}
                      style={{ fontSize: 10, fontWeight: 700, fill: "#e5e7eb" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
