import { useMemo, useRef, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Brush, Cell, ReferenceArea,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileSpreadsheet, FileText, Sparkles } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
};

const COST_KEYS: Array<{ key: keyof MesFinanceiro; label: string; color: string }> = [
  { key: "cac",           label: "CAC",           color: COLORS.cac },
  { key: "comissoes",     label: "Comissões",     color: COLORS.comissoes },
  { key: "bonus",         label: "Bônus",         color: COLORS.bonus },
  { key: "infra",         label: "Infra",         color: COLORS.infra },
  { key: "operadores",    label: "Operadores",    color: COLORS.operadores },
  { key: "participacoes", label: "Participações", color: COLORS.participacoes },
];

export function GraficoMensalDialog({
  open, onOpenChange, meses, workspaceNome, janelaMeses, onJanelaChange,
  incluirBaseline, onIncluirBaselineChange,
}: Props) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);

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

  const chartData = useMemo(() => meses.map(m => ({
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
  })), [meses]);

  const mesByName = useMemo(() => {
    const map = new Map<string, MesFinanceiro>();
    meses.forEach((m, i) => map.set(chartData[i].name, m));
    return map;
  }, [meses, chartData]);

  const renderTooltip = (props: any) => {
    if (!props?.active || !props?.label) return null;
    const m = mesByName.get(props.label);
    if (!m) return null;
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
    return (
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
          {COST_KEYS.map(c => (
            <div key={String(c.key)} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
              {c.label}
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[hsl(var(--status-emerald))]" />
            Fluxo Líquido
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-[2px] w-4 rounded-full bg-[hsl(var(--status-purple))]" />
            Margem %
          </div>
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
                {/* Custos empilhados */}
                <Bar yAxisId="left" dataKey="CAC" stackId="custos" fill={COLORS.cac} />
                <Bar yAxisId="left" dataKey="Comissões" stackId="custos" fill={COLORS.comissoes} />
                <Bar yAxisId="left" dataKey="Bônus" stackId="custos" fill={COLORS.bonus} />
                <Bar yAxisId="left" dataKey="Infra" stackId="custos" fill={COLORS.infra} />
                <Bar yAxisId="left" dataKey="Operadores" stackId="custos" fill={COLORS.operadores} />
                <Bar
                  yAxisId="left"
                  dataKey="Participações"
                  stackId="custos"
                  fill={COLORS.participacoes}
                  radius={[6, 6, 0, 0]}
                />
                {/* Fluxo Líquido lado a lado, cor por sinal */}
                <Bar yAxisId="left" dataKey="Fluxo Líquido" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell
                      key={`fl-${i}`}
                      fill={
                        (d["Fluxo Líquido"] as number) >= 0
                          ? COLORS.fluxoPos
                          : COLORS.fluxoNeg
                      }
                    />
                  ))}
                </Bar>
                {/* Linhas */}
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="Resultado Líquido"
                  stroke={COLORS.resultado}
                  strokeWidth={2.25}
                  dot={{ r: 2.5, fill: COLORS.resultado, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
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