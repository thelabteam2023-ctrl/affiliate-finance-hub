import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell 
} from "recharts";
import { PieChart as PieChartIcon, BarChart3 } from "lucide-react";
import { ApostaOperacionalFreebet, BookmakerFreebetStats, BookmakerChartData, FreebetRecebida } from "./types";
import { CurvaExtracaoChart } from "./CurvaExtracaoChart";

interface FreebetGraficosProps {
  apostas: ApostaOperacionalFreebet[];
  statsPorCasa: BookmakerFreebetStats[];
  formatCurrency: (value: number) => string;
  dateRange: { start: Date; end: Date } | null;
  freebets?: FreebetRecebida[];
}

const COLORS = ['#22c55e', '#ef4444', '#eab308', '#6366f1', '#f97316', '#14b8a6'];

export function FreebetGraficos({ apostas, statsPorCasa, formatCurrency, dateRange, freebets = [] }: FreebetGraficosProps) {
  // Comparativo por casa
  const comparativoCasas = useMemo((): BookmakerChartData[] => {
    return statsPorCasa
      .sort((a, b) => b.valor_total_extraido - a.valor_total_extraido)
      .slice(0, 8)
      .map(stat => ({
        nome: stat.bookmaker_nome.length > 12 ? stat.bookmaker_nome.slice(0, 12) + '...' : stat.bookmaker_nome,
        recebido: stat.valor_total_recebido,
        extraido: stat.valor_total_extraido,
        taxa: stat.taxa_extracao
      }));
  }, [statsPorCasa]);

  // Taxa de conversão (ganhas vs perdidas)
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

  // Casas disponíveis para filtro
  const casasDisponiveis = useMemo(() => {
    return [...new Set(apostas.map(ap => ap.bookmaker_nome))];
  }, [apostas]);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-popover border rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {typeof entry.value === 'number' && entry.name !== 'Taxa' 
                ? formatCurrency(entry.value) 
                : `${entry.value.toFixed(0)}%`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

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
        casasDisponiveis={casasDisponiveis}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Comparativo por Casa */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Recebido vs Extraído por Casa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparativoCasas} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis dataKey="nome" type="category" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="recebido" name="Recebido" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="extraido" name="Extraído" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Taxa de Conversão */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <PieChartIcon className="h-4 w-4 text-primary" />
              Distribuição de Resultados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={taxaConversaoData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {taxaConversaoData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Taxa de Extração por Casa */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-amber-400" />
            Taxa de Extração por Casa
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparativoCasas}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="nome" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip 
                  formatter={(value: number) => [`${value.toFixed(1)}%`, 'Taxa']}
                />
                <Bar dataKey="taxa" name="Taxa de Extração" radius={[4, 4, 0, 0]}>
                  {comparativoCasas.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.taxa >= 70 ? '#22c55e' : entry.taxa >= 50 ? '#f59e0b' : '#ef4444'} 
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
