import { useEffect, useMemo, useRef, useState } from "react";
import {
  ComposedChart, Bar, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Brush, Cell, ReferenceArea, ReferenceLine,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, Sparkles } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { MesFinanceiro } from "@/hooks/useFinanceiroMensal";
import { exportRelatorioPDF } from "@/lib/financeiro/exportRelatorioPDF";
import { exportRelatorioXLSX } from "@/lib/financeiro/exportRelatorioXLSX";
import { useToast } from "@/hooks/use-toast";
import { MonthlyKpiCard } from "./MonthlyKpiCard";
import {
  ChartRichTooltip,
  type RichTooltipSegment,
} from "@/components/charts/ChartRichTooltip";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meses: MesFinanceiro[];
  workspaceNome: string;
  janelaMeses: number;
  onJanelaChange: (n: number) => void;
  incluirBaseline: boolean;
  onIncluirBaselineChange: (v: boolean) => void;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtBRLfull = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Semantic design tokens (see src/index.css)
const COLORS = {
  cac:           "hsl(var(--status-blue))",
  comissoes:     "hsl(var(--status-emerald))",
  bonus:         "hsl(var(--status-orange))",
  infra:         "hsl(var(--status-purple))",
  operadores:    "hsl(var(--status-cyan))",
  participacoes: "hsl(var(--seg-particip))",
  fluxoPos:      "hsl(var(--status-emerald))",
  fluxoNeg:      "hsl(var(--status-red))",
  resultado:     "hsl(var(--foreground))",
  margem:        "hsl(var(--status-purple))",
  custoTotal:    "hsl(var(--muted-foreground) / 0.45)",
};

const COST_KEYS: Array<{ key: keyof MesFinanceiro; label: string; color: string }> = [
  { key: "cac",           label: "CAC",           color: COLORS.cac },
  { key: "comissoes",     label: "Comissões",     color: COLORS.comissoes },
  { key: "bonus",         label: "Bônus",         color: COLORS.bonus },
  { key: "infra",         label: "Infra",         color: COLORS.infra },
  { key: "operadores",    label: "Operadores",    color: COLORS.operadores },
  { key: "participacoes", label: "Participações", color: COLORS.participacoes },
];

type LayerId =
  | "cac" | "comissoes" | "bonus" | "infra" | "operadores" | "participacoes"
  | "fluxoLiquido" | "resultadoLiquido" | "resultadoAcumulado";

type LayerKind = "barStack" | "barStandalone" | "line" | "areaConditional";
interface LayerDef {
  id: LayerId;
  label: string;
  color: string;
  dataKey: string;
  kind: LayerKind;
  hint?: string;
}

const LAYERS: LayerDef[] = [
  { id: "cac",                label: "CAC",                 color: COLORS.cac,           dataKey: "CAC",                kind: "barStack" },
  { id: "comissoes",          label: "Comissões",           color: COLORS.comissoes,     dataKey: "Comissões",          kind: "barStack" },
  { id: "bonus",              label: "Bônus",               color: COLORS.bonus,         dataKey: "Bônus",              kind: "barStack" },
  { id: "infra",              label: "Infra",               color: COLORS.infra,         dataKey: "Infra",              kind: "barStack" },
  { id: "operadores",         label: "Operadores",          color: COLORS.operadores,    dataKey: "Operadores",         kind: "barStack" },
  { id: "participacoes",      label: "Participações",       color: COLORS.participacoes, dataKey: "Participações",      kind: "barStack" },
  { id: "fluxoLiquido",       label: "Fluxo Líquido",       color: COLORS.fluxoPos,      dataKey: "Fluxo Líquido",      kind: "barStandalone", hint: "Saques − Depósitos · verde se ≥ 0, vermelho se < 0" },
  { id: "resultadoLiquido",   label: "Resultado Líquido",   color: COLORS.resultado,     dataKey: "Resultado Líquido",  kind: "line",          hint: "Fluxo Líquido − Custo Total" },
  { id: "resultadoAcumulado", label: "Resultado Acumulado", color: COLORS.fluxoPos,      dataKey: "Resultado Acumulado",kind: "areaConditional", hint: "Running sum do Resultado Líquido · eixo direito" },
];

const DEFAULT_ACTIVE: LayerId[] = [
  "cac","comissoes","bonus","infra","operadores",
  "fluxoLiquido","resultadoLiquido","resultadoAcumulado",
];
const LS_KEY = "labbet:grafico-mensal:layers:v1";

function loadActiveLayers(): Set<LayerId> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return new Set(arr.filter((x: any): x is LayerId => LAYERS.some(l => l.id === x)));
      }
    }
  } catch { /* ignore */ }
  return new Set(DEFAULT_ACTIVE);
}

// Pill-style segmented switch (padrão visual do módulo Parceiros)
function PillSwitch<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: React.ReactNode }>;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 p-1",
        className,
      )}
    >
      {options.map(opt => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-3 h-7 text-xs font-medium rounded-md transition-colors whitespace-nowrap",
              active
                ? "bg-[hsl(var(--status-emerald))] text-white shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

export function GraficoMensalDialog({
  open, onOpenChange, meses, workspaceNome, janelaMeses, onJanelaChange,
  incluirBaseline, onIncluirBaselineChange,
}: Props) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const [activeLayers, setActiveLayers] = useState<Set<LayerId>>(() => loadActiveLayers());
  // Anima apenas na abertura do diálogo; depois congela para evitar
  // re-construção visual a cada hover.
  const [animateOnce, setAnimateOnce] = useState(false);
  useEffect(() => {
    if (!open) { setAnimateOnce(false); return; }
    setAnimateOnce(true);
    const t = setTimeout(() => setAnimateOnce(false), 900);
    return () => clearTimeout(t);
  }, [open]);
  const isOn = (id: LayerId) => activeLayers.has(id);
  const toggleLayer = (id: LayerId) => {
    setActiveLayers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem(LS_KEY, JSON.stringify(Array.from(next))); } catch { /* ignore */ }
      return next;
    });
  };

  const resumo = useMemo(() => {
    const reais = meses.filter(m => !m.isBaseline);
    if (!reais.length) return null;
    const resultados = reais.map(m => m.resultadoLiquido);
    const margens = reais.map(m => m.margemOperacional).filter((v): v is number => v !== null);
    const totalResultado = resultados.reduce((a, b) => a + b, 0);
    const totalCusto = reais.reduce((a, m) => a + m.custoTotal, 0);
    const totalFluxo = reais.reduce((a, m) => a + m.fluxoLiquido, 0);
    const melhor = reais.reduce((a, b) => (b.resultadoLiquido > a.resultadoLiquido ? b : a));
    const pior = reais.reduce((a, b) => (b.resultadoLiquido < a.resultadoLiquido ? b : a));
    return {
      mediaResultado: totalResultado / reais.length,
      mediaMargem: margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : null,
      totalCusto, totalFluxo, totalResultado,
      melhorMes: melhor, piorMes: pior,
    };
  }, [meses]);

  const chartData = useMemo(() => {
    let accResultado = 0;
    return meses.map(m => {
      accResultado += m.resultadoLiquido || 0;
      return {
        name: m.isBaseline ? `${m.mesLabel} •` : m.mesLabel,
        mesKey: m.mesKey,
        isBaseline: m.isBaseline,
        CAC: m.cac,
        Comissões: m.comissoes,
        Bônus: m.bonus,
        Infra: m.infra,
        Operadores: m.operadores,
        Participações: m.participacoes,
        "Fluxo Líquido": m.fluxoLiquido,
        "Resultado Líquido": m.resultadoLiquido,
        "Custo Total": m.custoTotal,
        "Resultado Acumulado": accResultado,
      };
    });
  }, [meses]);

  const accAxis = useMemo(() => {
    const vals = chartData.map((d: any) => Number(d["Resultado Acumulado"]) || 0);
    if (!vals.length) return { min: -1, max: 1, zeroOffset: 0.5 };
    const rawMin = Math.min(0, ...vals);
    const rawMax = Math.max(0, ...vals);
    const span = (rawMax - rawMin) || 1;
    const pad = span * 0.1;
    const min = rawMin < 0 ? rawMin - pad : 0;
    const max = rawMax > 0 ? rawMax + pad : 0;
    const range = (max - min) || 1;
    // SVG linearGradient: offset 0 = top (max), 1 = bottom (min). Zero sits at max/range.
    const zeroOffset = Math.min(1, Math.max(0, max / range));
    return { min, max, zeroOffset };
  }, [chartData]);

  const mesByName = useMemo(() => {
    const map = new Map<string, MesFinanceiro>();
    meses.forEach((m, i) => map.set(chartData[i].name, m));
    return map;
  }, [meses, chartData]);

  const renderTooltip = (props: any) => {
    if (!props?.active || !props?.label) return null;
    const m = mesByName.get(props.label);
    if (!m) return null;
    const cx = props?.coordinate?.x ?? 0;
    const vbWidth = props?.viewBox?.width ?? 0;
    const vbLeft = props?.viewBox?.x ?? 0;
    const flip = vbWidth > 0 && cx - vbLeft > vbWidth * 0.6;
    const wrap = (node: React.ReactNode) => (
      <div
        style={{
          transform: flip ? "translate(calc(-100% - 16px), 0)" : "translate(8px, 0)",
        }}
      >
        {node}
      </div>
    );
    const idx = chartData.findIndex(d => d.name === props.label);
    const acumulado = idx >= 0 ? Number((chartData[idx] as any)["Resultado Acumulado"]) || 0 : 0;
    const valueByLayer: Record<LayerId, number> = {
      cac: m.cac, comissoes: m.comissoes, bonus: m.bonus,
      infra: m.infra, operadores: m.operadores, participacoes: m.participacoes,
      fluxoLiquido: m.fluxoLiquido,
      resultadoLiquido: m.resultadoLiquido,
      resultadoAcumulado: acumulado,
    };
    const segments: RichTooltipSegment[] = LAYERS
      .filter(l => isOn(l.id))
      .map(l => ({
        key: l.id,
        label: l.label,
        value: valueByLayer[l.id],
        color: l.color,
        formatted: fmtBRLfull(valueByLayer[l.id]),
      }));
    const margemTxt =
      m.margemOperacional === null ? "—" : `${m.margemOperacional.toFixed(1)}%`;
    const tone: "positive" | "negative" | "neutral" =
      m.resultadoLiquido > 0 ? "positive" : m.resultadoLiquido < 0 ? "negative" : "neutral";
    return wrap(
      <ChartRichTooltip
        variant="stackedBar"
        title={m.mesNomeLongo}
        badge={{ label: margemTxt, tone }}
        segments={segments}
        total={m.resultadoLiquido}
        totalLabel="Resultado do mês"
        totalFormatted={fmtBRLfull(m.resultadoLiquido)}
        footerRows={[
          { label: "Custo total", value: fmtBRLfull(m.custoTotal), tone: "neutral" },
          {
            label: "Fluxo Líquido",
            value: fmtBRLfull(m.fluxoLiquido),
            tone: m.fluxoLiquido >= 0 ? "positive" : "negative",
          },
          {
            label: "Resultado Acumulado",
            value: fmtBRLfull(acumulado),
            tone: acumulado >= 0 ? "positive" : "negative",
          },
        ]}
      />
    );
  };

  const handleExportPDF = async () => {
    try {
      setExporting(true);
      await exportRelatorioPDF(meses, workspaceNome, chartRef.current);
      toast({ title: "PDF gerado", description: "Relatório exportado com sucesso." });
    } catch (e: any) {
      toast({ title: "Falha ao gerar PDF", description: e?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };
  const handleExportXLSX = () => {
    try {
      exportRelatorioXLSX(meses, workspaceNome);
      toast({ title: "Planilha gerada", description: "Relatório exportado com sucesso." });
    } catch (e: any) {
      toast({ title: "Falha ao gerar planilha", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Lucro × Custo · Visão Mensal
            </DialogTitle>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-2 border-r pr-3 mr-1">
                <Switch
                  id="baseline-toggle"
                  checked={incluirBaseline}
                  onCheckedChange={onIncluirBaselineChange}
                />
                <Label htmlFor="baseline-toggle" className="text-xs cursor-pointer">
                  Mês de referência
                </Label>
              </div>
              <PillSwitch<string>
                value={String(janelaMeses)}
                onChange={v => onJanelaChange(Number(v))}
                options={[
                  { value: "6",  label: "6m" },
                  { value: "12", label: "12m" },
                  { value: "24", label: "24m" },
                ]}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" disabled={exporting}>
                    <Download className="h-4 w-4 mr-1" />
                    Salvar Relatório
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportPDF}>
                    <FileText className="h-4 w-4 mr-2" /> PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportXLSX}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (.xlsx)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </DialogHeader>

        {/* Cards resumo */}
        {resumo && (
          <div
            key={janelaMeses}
            className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in-0 duration-200"
          >
            <MonthlyKpiCard
              label="Resultado médio/mês"
              value={fmtBRL(resumo.mediaResultado)}
              caption={`últimos ${janelaMeses} meses`}
              valueTone={resumo.mediaResultado >= 0 ? "positive" : "negative"}
            />
            <MonthlyKpiCard
              label="Margem média"
              value={resumo.mediaMargem === null ? "—" : `${resumo.mediaMargem.toFixed(1)}%`}
              caption="sobre fluxo + custos"
            />
            <MonthlyKpiCard
              label="Melhor mês"
              value={fmtBRL(resumo.melhorMes.resultadoLiquido)}
              caption={resumo.melhorMes.mesNomeLongo}
              variant="positive"
              valueTone="positive"
            />
            <MonthlyKpiCard
              label="Pior mês"
              value={fmtBRL(resumo.piorMes.resultadoLiquido)}
              caption={resumo.piorMes.mesNomeLongo}
              variant="alert"
              valueTone="negative"
            />
          </div>
        )}

        {/* Legenda customizada */}
        {/* Legenda interativa — cada chip liga/desliga a camada correspondente */}
        <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
          {LAYERS.map(l => {
            const active = isOn(l.id);
            const swatch =
              l.kind === "areaConditional" ? (
                <span
                  className="h-2.5 w-2.5 rounded-[3px] shrink-0"
                  style={{
                    background: `linear-gradient(180deg, ${COLORS.fluxoPos} 0%, ${COLORS.fluxoPos} 50%, ${COLORS.fluxoNeg} 50%, ${COLORS.fluxoNeg} 100%)`,
                    opacity: active ? 1 : 0.35,
                  }}
                />
              ) : l.kind === "line" ? (
                <span
                  className="inline-block h-[2px] w-4 rounded-full shrink-0"
                  style={{ background: l.color, opacity: active ? 1 : 0.35 }}
                />
              ) : (
                <span
                  className="h-2.5 w-2.5 rounded-[3px] shrink-0"
                  style={{ background: l.color, opacity: active ? 1 : 0.35 }}
                />
              );
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => toggleLayer(l.id)}
                title={l.hint}
                aria-pressed={active}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2 h-6 rounded-md text-[11px] transition-colors border",
                  active
                    ? "bg-muted/60 border-border text-foreground"
                    : "bg-transparent border-border/40 text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground",
                )}
              >
                {swatch}
                <span>{l.label}</span>
              </button>
            );
          })}
        </div>

        {/* Gráfico */}
        <div
          ref={chartRef}
          className="bg-card rounded-xl p-4 border border-border/80 shadow-[0_4px_24px_hsl(0_0%_0%/0.18)]"
        >
          {activeLayers.size === 0 ? (
            <div
              style={{ width: "100%", height: 420 }}
              className="flex items-center justify-center text-xs text-muted-foreground"
            >
              Nenhuma série selecionada — ative uma camada acima.
            </div>
          ) : (
          <div style={{ width: "100%", height: 420 }}>
            <ResponsiveContainer>
              <ComposedChart
                data={chartData}
                margin={{ top: 10, right: 24, left: 0, bottom: 0 }}
                barCategoryGap="22%"
                barGap={4}
                onMouseMove={(e: any) => {
                  if (e?.activeLabel) {
                    const m = mesByName.get(e.activeLabel);
                    setHoveredMonth(m?.mesKey ?? null);
                  }
                }}
                onMouseLeave={() => setHoveredMonth(null)}
              >
                <defs>
                  <linearGradient id="rl-acum-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={accAxis.zeroOffset} stopColor="hsl(var(--status-emerald))" stopOpacity={0.35} />
                    <stop offset={accAxis.zeroOffset} stopColor="hsl(var(--status-red))" stopOpacity={0.35} />
                  </linearGradient>
                  <linearGradient id="rl-acum-stroke" x1="0" y1="0" x2="0" y2="1">
                    <stop offset={accAxis.zeroOffset} stopColor="hsl(var(--status-emerald))" stopOpacity={1} />
                    <stop offset={accAxis.zeroOffset} stopColor="hsl(var(--status-red))" stopOpacity={1} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  vertical={false}
                  stroke="hsl(var(--border) / 0.4)"
                  strokeDasharray="0"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={{ stroke: "hsl(var(--border) / 0.5)" }}
                />
                <YAxis
                  yAxisId="left"
                  tickFormatter={fmtBRL}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[accAxis.min, accAxis.max]}
                  tickFormatter={fmtBRL}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.7)" }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--primary) / 0.05)" }}
                  content={renderTooltip}
                  allowEscapeViewBox={{ x: true, y: true }}
                  wrapperStyle={{ outline: "none", zIndex: 50 }}
                />
                {/* Highlight when hover comes from table */}
                {hoveredMonth &&
                  (() => {
                    const idx = meses.findIndex(m => m.mesKey === hoveredMonth);
                    if (idx < 0) return null;
                    const name = chartData[idx].name;
                    return (
                      <ReferenceArea
                        yAxisId="left"
                        x1={name}
                        x2={name}
                        strokeOpacity={0}
                        fill="hsl(var(--primary) / 0.08)"
                      />
                    );
                  })()}
                <ReferenceLine yAxisId="left" y={0} stroke="hsl(var(--border))" strokeDasharray="2 4" />
                {isOn("cac") &&        <Bar isAnimationActive={animateOnce} yAxisId="left" dataKey="CAC"        stackId="custos" fill={COLORS.cac} />}
                {isOn("comissoes") &&  <Bar isAnimationActive={animateOnce} yAxisId="left" dataKey="Comissões"  stackId="custos" fill={COLORS.comissoes} />}
                {isOn("bonus") &&      <Bar isAnimationActive={animateOnce} yAxisId="left" dataKey="Bônus"      stackId="custos" fill={COLORS.bonus} />}
                {isOn("infra") &&      <Bar isAnimationActive={animateOnce} yAxisId="left" dataKey="Infra"      stackId="custos" fill={COLORS.infra} />}
                {isOn("operadores") && <Bar isAnimationActive={animateOnce} yAxisId="left" dataKey="Operadores" stackId="custos" fill={COLORS.operadores} />}
                {isOn("participacoes") && (
                  <Bar isAnimationActive={animateOnce} yAxisId="left" dataKey="Participações" stackId="custos" fill={COLORS.participacoes} radius={[6, 6, 0, 0]} />
                )}
                {isOn("fluxoLiquido") && (
                  <Bar isAnimationActive={animateOnce} yAxisId="left" dataKey="Fluxo Líquido" radius={[6, 6, 0, 0]}>
                    {chartData.map((d, i) => (
                      <Cell
                        key={`fl-${i}`}
                        fill={(d["Fluxo Líquido"] as number) >= 0 ? COLORS.fluxoPos : COLORS.fluxoNeg}
                      />
                    ))}
                  </Bar>
                )}
                {isOn("resultadoAcumulado") && (
                  <Area
                    isAnimationActive={animateOnce}
                    yAxisId="right"
                    type="monotone"
                    dataKey="Resultado Acumulado"
                    fill="url(#rl-acum-fill)"
                    stroke="url(#rl-acum-stroke)"
                    strokeWidth={2}
                    baseValue={0}
                    activeDot={{ r: 4 }}
                  />
                )}
                {isOn("resultadoLiquido") && (
                  <Line isAnimationActive={animateOnce}
                    yAxisId="left"
                    type="monotone"
                    dataKey="Resultado Líquido"
                    stroke={COLORS.resultado}
                    strokeWidth={2.25}
                    dot={{ r: 2.5, fill: COLORS.resultado, strokeWidth: 0 }}
                    activeDot={{ r: 5 }}
                  />
                )}
                {chartData.length > 6 && (
                  <Brush
                    dataKey="name"
                    height={18}
                    stroke="hsl(var(--primary) / 0.4)"
                    fill="hsl(var(--card))"
                    travellerWidth={8}
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          )}
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto rounded-lg border border-border/70">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border/70 text-muted-foreground">
                <th className="text-left py-2 pr-3">Mês</th>
                <th className="text-right py-2 px-2">Fluxo Líq.</th>
                <th className="text-right py-2 px-2">CAC</th>
                <th className="text-right py-2 px-2">Comiss.</th>
                <th className="text-right py-2 px-2">Bônus</th>
                <th className="text-right py-2 px-2">Infra</th>
                <th className="text-right py-2 px-2">Operad.</th>
                <th className="text-right py-2 px-2">Particip.</th>
                <th className="text-right py-2 px-2">Custo Total</th>
                <th className="text-right py-2 px-2">Result. Líq.</th>
                <th className="text-right py-2 pl-2">Margem</th>
              </tr>
            </thead>
            <tbody>
              {meses.map(m => (
                <tr
                  key={m.mesKey}
                  data-month={m.mesKey}
                  onMouseEnter={() => setHoveredMonth(m.mesKey)}
                  onMouseLeave={() => setHoveredMonth(null)}
                  className={cn(
                    "border-b border-border/60 transition-colors duration-150 cursor-default",
                    hoveredMonth === m.mesKey ? "bg-muted/50" : "hover:bg-muted/30",
                    m.isBaseline && "text-muted-foreground italic opacity-70"
                  )}
                >
                  <td className="py-2 pr-3 font-medium">
                    {m.mesNomeLongo}
                    {m.isBaseline && <span className="ml-1 text-[10px] uppercase tracking-wide">(baseline)</span>}
                  </td>
                  <td className="text-right px-2">{fmtBRLfull(m.fluxoLiquido)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.cac)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.comissoes)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.bonus)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.infra)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.operadores)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.participacoes)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.custoTotal)}</td>
                  <td
                    className={cn(
                      "text-right px-2 font-medium tabular-nums",
                      m.resultadoLiquido >= 0
                        ? "text-[hsl(var(--status-emerald))]"
                        : "text-[hsl(var(--status-red))]"
                    )}
                  >
                    {fmtBRLfull(m.resultadoLiquido)}
                  </td>
                  <td className="text-right pl-2">
                    {m.margemOperacional === null ? "—" : `${m.margemOperacional.toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}