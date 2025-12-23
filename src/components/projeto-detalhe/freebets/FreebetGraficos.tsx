import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, PieChart as PieChartIcon } from "lucide-react";
import { ApostaOperacionalFreebet, BookmakerFreebetStats, FreebetRecebida } from "./types";
import { CurvaExtracaoChart } from "./CurvaExtracaoChart";
import { ModernBarChart } from "@/components/ui/modern-bar-chart";
import { ModernDonutChart } from "@/components/ui/modern-donut-chart";

interface FreebetGraficosProps {
  apostas: ApostaOperacionalFreebet[];
  statsPorCasa: BookmakerFreebetStats[];
  formatCurrency: (value: number) => string;
  dateRange: { start: Date; end: Date } | null;
  freebets?: FreebetRecebida[];
}

export function FreebetGraficos({ apostas, statsPorCasa, formatCurrency, dateRange, freebets = [] }: FreebetGraficosProps) {
  // Comparativo por casa - preparado para ModernBarChart
  const comparativoCasas = useMemo(() => {
    return statsPorCasa
      .sort((a, b) => b.valor_total_extraido - a.valor_total_extraido)
      .slice(0, 8)
      .map(stat => ({
        nome: stat.bookmaker_nome.length > 10 ? stat.bookmaker_nome.slice(0, 10) + '...' : stat.bookmaker_nome,
        recebido: stat.valor_total_recebido,
        extraido: stat.valor_total_extraido,
        taxa: stat.taxa_extracao
      }));
  }, [statsPorCasa]);

  // Taxa de conversão (ganhas vs perdidas) - preparado para ModernDonutChart
  const taxaConversaoData = useMemo(() => {
    const apostasFinalizadas = apostas.filter(ap => ap.status === "LIQUIDADA" && ap.resultado !== "PENDENTE");
    const ganhas = apostasFinalizadas.filter(ap => ap.resultado === "GREEN" || ap.resultado === "MEIO_GREEN").length;
    const perdidas = apostasFinalizadas.filter(ap => ap.resultado === "RED" || ap.resultado === "MEIO_RED").length;
    const void_ = apostasFinalizadas.filter(ap => ap.resultado === "VOID").length;
    const pendentes = apostas.filter(ap => ap.status === "PENDENTE" || ap.resultado === "PENDENTE").length;
    
    return [
      { name: 'Ganhas', value: ganhas, color: '#22c55e' },
      { name: 'Perdidas', value: perdidas, color: '#ef4444' },
      { name: 'Void', value: void_, color: '#6b7280' },
      { name: 'Pendentes', value: pendentes, color: '#eab308' },
    ].filter(d => d.value > 0);
  }, [apostas]);

  // Taxa de extração por casa - preparado para ModernBarChart horizontal
  const taxaExtracaoData = useMemo(() => {
    return statsPorCasa
      .filter(stat => stat.valor_total_recebido > 0)
      .sort((a, b) => b.taxa_extracao - a.taxa_extracao)
      .slice(0, 8)
      .map(stat => ({
        nome: stat.bookmaker_nome.length > 10 ? stat.bookmaker_nome.slice(0, 10) + '...' : stat.bookmaker_nome,
        taxa: Math.round(stat.taxa_extracao),
        fullName: stat.bookmaker_nome
      }));
  }, [statsPorCasa]);

  // Total de apostas para o centro do donut
  const totalApostas = taxaConversaoData.reduce((acc, d) => acc + d.value, 0);
  const apostasGanhas = taxaConversaoData.find(d => d.name === 'Ganhas')?.value || 0;
  const taxaAcerto = totalApostas > 0 ? Math.round((apostasGanhas / totalApostas) * 100) : 0;

  if (apostas.length === 0 && freebets.length === 0) {
    return (
      <div className="text-center py-12 border rounded-lg bg-muted/5">
        <BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/30" />
        <p className="mt-3 text-sm text-muted-foreground">Sem dados suficientes para gráficos</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Gráfico Principal: Curva de Extração */}
      <CurvaExtracaoChart
        apostas={apostas}
        freebets={freebets}
        formatCurrency={formatCurrency}
        dateRange={dateRange}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Comparativo por Casa - ModernBarChart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Recebido vs Extraído por Casa
            </CardTitle>
          </CardHeader>
          <CardContent>
            {comparativoCasas.length > 0 ? (
              <ModernBarChart
                data={comparativoCasas}
                categoryKey="nome"
                bars={[
                  { dataKey: "recebido", label: "Recebido", gradientStart: "#f59e0b", gradientEnd: "#d97706" },
                  { dataKey: "extraido", label: "Extraído", gradientStart: "#22c55e", gradientEnd: "#16a34a" }
                ]}
                height={220}
                barSize={16}
                showLabels={false}
                showLegend={true}
                formatValue={formatCurrency}
              />
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Sem dados por casa
              </div>
            )}
          </CardContent>
        </Card>

        {/* Taxa de Conversão - ModernDonutChart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-primary" />
              Distribuição de Resultados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {taxaConversaoData.length > 0 ? (
              <ModernDonutChart
                data={taxaConversaoData}
                height={220}
                innerRadius={55}
                outerRadius={80}
                showLabels={true}
                showLegend={false}
                centerValue={taxaAcerto}
                centerLabel="Acerto"
              />
            ) : (
              <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                Sem dados de resultados
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Taxa de Extração por Casa */}
      {taxaExtracaoData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-amber-400" />
              Taxa de Extração por Casa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ModernBarChart
              data={taxaExtracaoData}
              categoryKey="nome"
              bars={[
                { dataKey: "taxa", label: "Taxa %", gradientStart: "#8b5cf6", gradientEnd: "#7c3aed" }
              ]}
              height={180}
              barSize={24}
              showLabels={true}
              showLegend={false}
              formatValue={(v) => `${v}%`}
              formatTooltip={(dataKey, value) => `${value}%`}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
