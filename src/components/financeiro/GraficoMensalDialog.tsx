import { useMemo, useRef, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Brush, Cell, ReferenceArea, ReferenceLine,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, Sparkles, Settings2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
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
  lucroOp:       "hsl(var(--status-emerald))",
  lucroAcum:     "hsl(var(--muted-foreground))",
};

const COST_KEYS: Array<{ key: keyof MesFinanceiro; label: string; color: string }> = [
  { key: "cac",           label: "CAC",           color: COLORS.cac },
  { key: "comissoes",     label: "Comissões",     color: COLORS.comissoes },
  { key: "bonus",         label: "Bônus",         color: COLORS.bonus },
  { key: "infra",         label: "Infra",         color: COLORS.infra },
  { key: "operadores",    label: "Operadores",    color: COLORS.operadores },
  { key: "participacoes", label: "Participações", color: COLORS.participacoes },
];

type Modo = "custos" | "lucro";
type SeriesShape = "bar" | "line" | "lineDashed";
interface SeriesDef {
  id: string;
  label: string;
  color: string;
  shape: SeriesShape;
  group: "Custos" | "Indicadores" | "Lucro";
  modos: Modo[];
  hint?: string;
}

const ALL_SERIES: SeriesDef[] = [
  { id: "CAC",                label: "CAC",                color: COLORS.cac,           shape: "bar",        group: "Custos",       modos: ["custos"] },
  { id: "Comissões",          label: "Comissões",          color: COLORS.comissoes,     shape: "bar",        group: "Custos",       modos: ["custos"] },
  { id: "Bônus",              label: "Bônus",              color: COLORS.bonus,         shape: "bar",        group: "Custos",       modos: ["custos"] },
  { id: "Infra",              label: "Infra",              color: COLORS.infra,         shape: "bar",        group: "Custos",       modos: ["custos"] },
  { id: "Operadores",         label: "Operadores",         color: COLORS.operadores,    shape: "bar",        group: "Custos",       modos: ["custos"] },
  { id: "Participações",      label: "Participações",      color: COLORS.participacoes, shape: "bar",        group: "Custos",       modos: ["custos"] },
  { id: "Fluxo Líquido",      label: "Fluxo Líquido",      color: COLORS.fluxoPos,      shape: "bar",        group: "Indicadores",  modos: ["custos"], hint: "Saques − Depósitos" },
  { id: "Resultado Líq. (custos)", label: "Resultado Líquido", color: COLORS.resultado, shape: "line",      group: "Indicadores",  modos: ["custos"], hint: "Fluxo Líquido − Custo Total" },
  { id: "Margem %",           label: "Margem %",           color: COLORS.margem,        shape: "lineDashed", group: "Indicadores",  modos: ["custos"], hint: "Eixo direito" },
  { id: "Lucro Operacional",  label: "Lucro Operacional",  color: COLORS.lucroOp,       shape: "line",       group: "Lucro",        modos: ["lucro"], hint: "Apostas (lucro/prejuízo) por mês" },
  { id: "Resultado Líquido",  label: "Resultado Líquido",  color: COLORS.resultado,     shape: "line",       group: "Lucro",        modos: ["lucro"], hint: "Fluxo Líquido − Custo Total" },
  { id: "Acumulado",          label: "Lucro Op. Acumulado", color: COLORS.lucroAcum,    shape: "lineDashed", group: "Lucro",        modos: ["lucro"], hint: "Soma running do Lucro Operacional" },
];

const DEFAULTS_BY_MODO: Record<Modo, string[]> = {
  custos: ["CAC","Comissões","Bônus","Infra","Operadores","Participações","Fluxo Líquido","Resultado Líq. (custos)","Margem %"],
  lucro:  ["Lucro Operacional","Resultado Líquido"],
};
const LS_KEY = "labbet:grafico-mensal:visible-series:v1";

function loadVisible(): Record<Modo, string[]> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        custos: Array.isArray(p?.custos) ? p.custos : DEFAULTS_BY_MODO.custos,
        lucro:  Array.isArray(p?.lucro)  ? p.lucro  : DEFAULTS_BY_MODO.lucro,
      };
    }
  } catch { /* ignore */ }
  return { ...DEFAULTS_BY_MODO };
}

export function GraficoMensalDialog({
  open, onOpenChange, meses, workspaceNome, janelaMeses, onJanelaChange,
  incluirBaseline, onIncluirBaselineChange,
}: Props) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const [modo, setModo] = useState<Modo>("custos");
  const [visibleByMode, setVisibleByMode] = useState<Record<Modo, string[]>>(() => loadVisible());
  const visibleSet = useMemo(() => new Set(visibleByMode[modo]), [visibleByMode, modo]);
  const isOn = (id: string) => visibleSet.has(id);
  const toggleSeries = (id: string) => {
    setVisibleByMode(prev => {
      const cur = new Set(prev[modo]);
      if (cur.has(id)) cur.delete(id); else cur.add(id);
      const next = { ...prev, [modo]: Array.from(cur) };
      try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
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
    let acc = 0;
    return meses.map(m => {
      acc += m.lucroOperacional || 0;
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
        "Margem %": m.margemOperacional,
        "Lucro Operacional": m.lucroOperacional,
        "Acumulado": acc,
      };
    });
  }, [meses]);

  const mesByName = useMemo(() => {
    const map = new Map<string, MesFinanceiro>();
    meses.forEach((m, i) => map.set(chartData[i].name, m));
    return map;
  }, [meses, chartData]);

  const renderTooltip = (props: any) => {
    if (!props?.active || !props?.label) return null;
    const m = mesByName.get(props.label);
    if (!m) return null;
    // Evita corte da tooltip nas bordas: ancora à direita quando o ponto está
    // na metade direita do gráfico (mesmo comportamento usado pelo Recharts
    // quando `allowEscapeViewBox` está ligado, mas controlado por nós).
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
    if (modo === "lucro") {
      const accIdx = chartData.findIndex(d => d.name === props.label);
      const acumulado = accIdx >= 0 ? (chartData[accIdx] as any)["Acumulado"] : 0;
      const segs: RichTooltipSegment[] = [];
      if (isOn("Lucro Operacional")) segs.push({ key: "lop", label: "Lucro Operacional", value: m.lucroOperacional, color: COLORS.lucroOp, formatted: fmtBRLfull(m.lucroOperacional) });
      if (isOn("Resultado Líquido")) segs.push({ key: "rl",  label: "Resultado Líquido", value: m.resultadoLiquido, color: COLORS.resultado, formatted: fmtBRLfull(m.resultadoLiquido) });
      if (isOn("Acumulado"))         segs.push({ key: "acc", label: "Lucro Op. Acumulado", value: acumulado, color: COLORS.lucroAcum, formatted: fmtBRLfull(acumulado) });
      const tone: "positive" | "negative" | "neutral" =
        m.lucroOperacional > 0 ? "positive" : m.lucroOperacional < 0 ? "negative" : "neutral";
      return wrap(
        <ChartRichTooltip
          variant="stackedBar"
          title={m.mesNomeLongo}
          badge={{ label: m.lucroOperacional >= 0 ? "Lucro" : "Prejuízo", tone }}
          segments={segs}
          total={m.lucroOperacional}
          totalLabel="Lucro do mês"
          totalFormatted={fmtBRLfull(m.lucroOperacional)}
        />
      );
    }
    const segments: RichTooltipSegment[] = COST_KEYS.map(c => ({
      key: String(c.key),
      label: c.label,
      value: Number((m as any)[c.key]) || 0,
      color: c.color,
      formatted: fmtBRLfull(Number((m as any)[c.key]) || 0),
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
        total={m.custoTotal}
        totalLabel="Custo total"
        totalFormatted={fmtBRLfull(m.custoTotal)}
        footerRows={[
          { label: "Custo total", value: fmtBRLfull(m.custoTotal), tone: "neutral" },
          {
            label: "Fluxo Líquido",
            value: fmtBRLfull(m.fluxoLiquido),
            tone: m.fluxoLiquido >= 0 ? "positive" : "negative",
          },
          {
            label: "Resultado Líquido",
            value: fmtBRLfull(m.resultadoLiquido),
            tone: m.resultadoLiquido >= 0 ? "positive" : "negative",
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
              <ToggleGroup
                type="single"
                value={modo}
                onValueChange={v => v && setModo(v as Modo)}
                size="sm"
              >
                <ToggleGroupItem value="custos">Custos × Fluxo</ToggleGroupItem>
                <ToggleGroupItem value="lucro">Lucro Op.</ToggleGroupItem>
              </ToggleGroup>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="outline" title="Configurar séries visíveis">
                    <Settings2 className="h-4 w-4 mr-1" /> Séries
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">
                    Séries visíveis · {modo === "custos" ? "Custos × Fluxo" : "Lucro Operacional"}
                  </div>
                  {(["Custos","Indicadores","Lucro"] as const).map(group => {
                    const items = ALL_SERIES.filter(s => s.modos.includes(modo) && s.group === group);
                    if (!items.length) return null;
                    return (
                      <div key={group} className="mb-2 last:mb-0">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70 mb-1">{group}</div>
                        <div className="flex flex-col gap-1.5">
                          {items.map(s => (
                            <label key={s.id} className="flex items-center gap-2 text-xs cursor-pointer">
                              <Checkbox
                                checked={isOn(s.id)}
                                onCheckedChange={() => toggleSeries(s.id)}
                              />
                              <span
                                className={cn(
                                  s.shape === "bar" ? "h-2 w-2 rounded-[2px]" : "h-[2px] w-3.5 rounded-full",
                                  s.shape === "lineDashed" && "border-t border-dashed bg-transparent"
                                )}
                                style={
                                  s.shape === "lineDashed"
                                    ? { borderColor: s.color, height: 0 }
                                    : { background: s.color }
                                }
                              />
                              <span className="flex-1">{s.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </PopoverContent>
              </Popover>
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
              <ToggleGroup
                type="single"
                value={String(janelaMeses)}
                onValueChange={v => v && onJanelaChange(Number(v))}
                size="sm"
              >
                <ToggleGroupItem value="6">6m</ToggleGroupItem>
                <ToggleGroupItem value="12">12m</ToggleGroupItem>
                <ToggleGroupItem value="24">24m</ToggleGroupItem>
              </ToggleGroup>
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
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 pt-1 text-[11px] text-muted-foreground">
          {ALL_SERIES.filter(s => s.modos.includes(modo) && isOn(s.id)).map(s => (
            <div
              key={s.id}
              className="flex items-center gap-1.5"
              title={s.hint}
            >
              {s.shape === "bar" ? (
                <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
              ) : s.shape === "line" ? (
                <span className="inline-block h-[2px] w-4 rounded-full" style={{ background: s.color }} />
              ) : (
                <span
                  className="inline-block w-4 border-t border-dashed"
                  style={{ borderColor: s.color, height: 0 }}
                />
              )}
              <span>{s.label}</span>
              {s.id === "Fluxo Líquido" && (
                <span className="text-muted-foreground/60">
                  · verde se ≥ 0, vermelho se &lt; 0
                </span>
              )}
              {s.id === "Margem %" && (
                <span className="text-muted-foreground/60">· eixo direito</span>
              )}
            </div>
          ))}
        </div>

        {/* Gráfico */}
        <div
          ref={chartRef}
          className="bg-card rounded-xl p-4 border border-border/80 shadow-[0_4px_24px_hsl(0_0%_0%/0.18)]"
        >
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
                  <filter id="margemGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="2.4" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
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
                  tickFormatter={v => `${v}%`}
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground) / 0.7)" }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
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
                {modo === "custos" && (
                  <>
                    {isOn("CAC") &&        <Bar yAxisId="left" dataKey="CAC"        stackId="custos" fill={COLORS.cac} />}
                    {isOn("Comissões") &&  <Bar yAxisId="left" dataKey="Comissões"  stackId="custos" fill={COLORS.comissoes} />}
                    {isOn("Bônus") &&      <Bar yAxisId="left" dataKey="Bônus"      stackId="custos" fill={COLORS.bonus} />}
                    {isOn("Infra") &&      <Bar yAxisId="left" dataKey="Infra"      stackId="custos" fill={COLORS.infra} />}
                    {isOn("Operadores") && <Bar yAxisId="left" dataKey="Operadores" stackId="custos" fill={COLORS.operadores} />}
                    {isOn("Participações") && (
                      <Bar yAxisId="left" dataKey="Participações" stackId="custos" fill={COLORS.participacoes} radius={[6, 6, 0, 0]} />
                    )}
                    {isOn("Fluxo Líquido") && (
                      <Bar yAxisId="left" dataKey="Fluxo Líquido" radius={[6, 6, 0, 0]}>
                        {chartData.map((d, i) => (
                          <Cell
                            key={`fl-${i}`}
                            fill={(d["Fluxo Líquido"] as number) >= 0 ? COLORS.fluxoPos : COLORS.fluxoNeg}
                          />
                        ))}
                      </Bar>
                    )}
                    {isOn("Resultado Líq. (custos)") && (
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="Resultado Líquido"
                        stroke={COLORS.resultado}
                        strokeWidth={2.25}
                        dot={{ r: 2.5, fill: COLORS.resultado, strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                    {isOn("Margem %") && (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="Margem %"
                        stroke={COLORS.margem}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 3, fill: COLORS.margem, strokeWidth: 0 }}
                        filter="url(#margemGlow)"
                      />
                    )}
                  </>
                )}
                {modo === "lucro" && (
                  <>
                    <ReferenceLine
                      yAxisId="left"
                      y={0}
                      stroke="hsl(var(--border))"
                      strokeDasharray="2 4"
                    />
                    {isOn("Lucro Operacional") && (
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="Lucro Operacional"
                        stroke={COLORS.lucroOp}
                        strokeWidth={2.5}
                        dot={{ r: 3, fill: COLORS.lucroOp, strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                    {isOn("Resultado Líquido") && (
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="Resultado Líquido"
                        stroke={COLORS.resultado}
                        strokeWidth={2}
                        dot={{ r: 2.5, fill: COLORS.resultado, strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                      />
                    )}
                    {isOn("Acumulado") && (
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="Acumulado"
                        stroke={COLORS.lucroAcum}
                        strokeWidth={1.75}
                        strokeDasharray="5 5"
                        dot={false}
                      />
                    )}
                  </>
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