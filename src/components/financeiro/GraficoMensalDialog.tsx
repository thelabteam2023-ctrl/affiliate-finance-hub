import { useMemo, useRef, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Brush,
} from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Download, FileSpreadsheet, FileText, Sparkles } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { MesFinanceiro } from "@/hooks/useFinanceiroMensal";
import { exportRelatorioPDF } from "@/lib/financeiro/exportRelatorioPDF";
import { exportRelatorioXLSX } from "@/lib/financeiro/exportRelatorioXLSX";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meses: MesFinanceiro[];
  workspaceNome: string;
  janelaMeses: number;
  onJanelaChange: (n: number) => void;
}

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const fmtBRLfull = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const COLORS = {
  cac: "hsl(217, 91%, 60%)",
  comissoes: "hsl(142, 71%, 45%)",
  bonus: "hsl(38, 92%, 50%)",
  infra: "hsl(262, 83%, 58%)",
  operadores: "hsl(189, 94%, 43%)",
  fluxo: "hsl(142, 76%, 36%)",
  resultado: "hsl(0, 0%, 9%)",
  margem: "hsl(280, 65%, 55%)",
};

export function GraficoMensalDialog({
  open, onOpenChange, meses, workspaceNome, janelaMeses, onJanelaChange,
}: Props) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const resumo = useMemo(() => {
    if (!meses.length) return null;
    const resultados = meses.map(m => m.resultadoLiquido);
    const margens = meses.map(m => m.margemOperacional).filter((v): v is number => v !== null);
    const totalResultado = resultados.reduce((a, b) => a + b, 0);
    const totalCusto = meses.reduce((a, m) => a + m.custoTotal, 0);
    const totalFluxo = meses.reduce((a, m) => a + m.fluxoLiquido, 0);
    const melhor = meses.reduce((a, b) => (b.resultadoLiquido > a.resultadoLiquido ? b : a));
    const pior = meses.reduce((a, b) => (b.resultadoLiquido < a.resultadoLiquido ? b : a));
    return {
      mediaResultado: totalResultado / meses.length,
      mediaMargem: margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : null,
      totalCusto, totalFluxo, totalResultado,
      melhorMes: melhor, piorMes: pior,
    };
  }, [meses]);

  const chartData = useMemo(() => meses.map(m => ({
    name: m.mesLabel,
    CAC: m.cac,
    Comissões: m.comissoes,
    Bônus: m.bonus,
    Infra: m.infra,
    Operadores: m.operadores,
    "Fluxo Líquido": m.fluxoLiquido,
    "Resultado Líquido": m.resultadoLiquido,
    "Margem %": m.margemOperacional,
  })), [meses]);

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="p-3">
              <div className="text-[11px] text-muted-foreground">Resultado médio/mês</div>
              <div className={`text-lg font-semibold ${resumo.mediaResultado >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {fmtBRL(resumo.mediaResultado)}
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] text-muted-foreground">Margem média</div>
              <div className="text-lg font-semibold">
                {resumo.mediaMargem === null ? "—" : `${resumo.mediaMargem.toFixed(1)}%`}
              </div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] text-muted-foreground">Melhor mês</div>
              <div className="text-sm font-medium">{resumo.melhorMes.mesNomeLongo}</div>
              <div className="text-xs text-emerald-600">{fmtBRL(resumo.melhorMes.resultadoLiquido)}</div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] text-muted-foreground">Pior mês</div>
              <div className="text-sm font-medium">{resumo.piorMes.mesNomeLongo}</div>
              <div className="text-xs text-red-600">{fmtBRL(resumo.piorMes.resultadoLiquido)}</div>
            </Card>
          </div>
        )}

        {/* Gráfico */}
        <div ref={chartRef} className="bg-card rounded-lg p-4 border">
          <div style={{ width: "100%", height: 420 }}>
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="fluxoGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.fluxo} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={COLORS.fluxo} stopOpacity={0.55} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis
                  yAxisId="left"
                  tickFormatter={fmtBRL}
                  tick={{ fontSize: 11 }}
                  width={80}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={v => `${v}%`}
                  tick={{ fontSize: 11 }}
                  width={40}
                />
                <Tooltip
                  formatter={(value: any, name: string) => {
                    if (name === "Margem %") return value === null ? "—" : `${Number(value).toFixed(1)}%`;
                    return fmtBRLfull(Number(value) || 0);
                  }}
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {/* Custos empilhados */}
                <Bar yAxisId="left" dataKey="CAC" stackId="custos" fill={COLORS.cac} />
                <Bar yAxisId="left" dataKey="Comissões" stackId="custos" fill={COLORS.comissoes} />
                <Bar yAxisId="left" dataKey="Bônus" stackId="custos" fill={COLORS.bonus} />
                <Bar yAxisId="left" dataKey="Infra" stackId="custos" fill={COLORS.infra} />
                <Bar yAxisId="left" dataKey="Operadores" stackId="custos" fill={COLORS.operadores} radius={[4, 4, 0, 0]} />
                {/* Fluxo Líquido lado a lado */}
                <Bar yAxisId="left" dataKey="Fluxo Líquido" fill="url(#fluxoGrad)" radius={[4, 4, 0, 0]} />
                {/* Linhas */}
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="Resultado Líquido"
                  stroke={COLORS.resultado}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="Margem %"
                  stroke={COLORS.margem}
                  strokeWidth={2}
                  strokeDasharray="4 4"
                  dot={{ r: 2 }}
                />
                {chartData.length > 6 && <Brush dataKey="name" height={20} stroke="hsl(var(--primary))" />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="text-left py-2 pr-3">Mês</th>
                <th className="text-right py-2 px-2">Fluxo Líq.</th>
                <th className="text-right py-2 px-2">CAC</th>
                <th className="text-right py-2 px-2">Comiss.</th>
                <th className="text-right py-2 px-2">Bônus</th>
                <th className="text-right py-2 px-2">Infra</th>
                <th className="text-right py-2 px-2">Operad.</th>
                <th className="text-right py-2 px-2">Custo Total</th>
                <th className="text-right py-2 px-2">Result. Líq.</th>
                <th className="text-right py-2 pl-2">Margem</th>
              </tr>
            </thead>
            <tbody>
              {meses.map(m => (
                <tr key={m.mesKey} className="border-b hover:bg-muted/50">
                  <td className="py-2 pr-3 font-medium">{m.mesNomeLongo}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.fluxoLiquido)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.cac)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.comissoes)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.bonus)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.infra)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.operadores)}</td>
                  <td className="text-right px-2">{fmtBRLfull(m.custoTotal)}</td>
                  <td className={`text-right px-2 font-medium ${m.resultadoLiquido >= 0 ? "text-emerald-600" : "text-red-600"}`}>
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