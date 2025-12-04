import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  Target, 
  DollarSign,
  PieChart,
  BarChart3
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend
} from "recharts";

interface ProjetoDashboardTabProps {
  projetoId: string;
}

interface Aposta {
  id: string;
  data_aposta: string;
  lucro_prejuizo: number | null;
  resultado: string | null;
  estrategia: string | null;
  esporte: string;
}

export function ProjetoDashboardTab({ projetoId }: ProjetoDashboardTabProps) {
  const [apostas, setApostas] = useState<Aposta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApostas();
  }, [projetoId]);

  const fetchApostas = async () => {
    try {
      const { data, error } = await supabase
        .from("apostas")
        .select("id, data_aposta, lucro_prejuizo, resultado, estrategia, esporte")
        .eq("projeto_id", projetoId)
        .order("data_aposta", { ascending: true });

      if (error) throw error;
      setApostas(data || []);
    } catch (error) {
      console.error("Erro ao carregar apostas:", error);
    } finally {
      setLoading(false);
    }
  };

  // Prepare evolution chart data
  const evolutionData = apostas.reduce((acc: any[], aposta) => {
    const date = new Date(aposta.data_aposta).toLocaleDateString("pt-BR");
    const lastBalance = acc.length > 0 ? acc[acc.length - 1].saldo : 0;
    const newBalance = lastBalance + (aposta.lucro_prejuizo || 0);
    
    acc.push({
      data: date,
      saldo: newBalance,
      lucro: aposta.lucro_prejuizo || 0
    });
    
    return acc;
  }, []);

  // Prepare results pie chart data
  const resultadosData = [
    { name: "GREEN", value: apostas.filter(a => a.resultado === "GREEN").length, color: "#10b981" },
    { name: "RED", value: apostas.filter(a => a.resultado === "RED").length, color: "#ef4444" },
    { name: "VOID", value: apostas.filter(a => a.resultado === "VOID").length, color: "#6b7280" },
    { name: "HALF", value: apostas.filter(a => a.resultado === "HALF").length, color: "#f59e0b" },
    { name: "Pendente", value: apostas.filter(a => !a.resultado).length, color: "#3b82f6" },
  ].filter(d => d.value > 0);

  // Prepare sports bar chart data
  const esportesMap = apostas.reduce((acc: Record<string, { greens: number; reds: number }>, aposta) => {
    if (!acc[aposta.esporte]) {
      acc[aposta.esporte] = { greens: 0, reds: 0 };
    }
    if (aposta.resultado === "GREEN") acc[aposta.esporte].greens++;
    if (aposta.resultado === "RED") acc[aposta.esporte].reds++;
    return acc;
  }, {});

  const esportesData = Object.entries(esportesMap).map(([esporte, data]) => ({
    esporte,
    greens: data.greens,
    reds: data.reds
  }));

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  }

  if (apostas.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-10">
            <Target className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 text-lg font-semibold">Nenhuma aposta registrada</h3>
            <p className="text-muted-foreground">
              Vá para a aba "Apostas" para registrar suas operações
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Evolução do Saldo */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Evolução do Saldo
          </CardTitle>
          <CardDescription>
            Acompanhe a evolução do lucro/prejuízo ao longo do tempo
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolutionData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="data" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickFormatter={(value) => formatCurrency(value)}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                  formatter={(value: number) => [formatCurrency(value), "Saldo"]}
                />
                <Line 
                  type="monotone" 
                  dataKey="saldo" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--primary))", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Distribuição de Resultados */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PieChart className="h-5 w-5" />
            Distribuição de Resultados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <RechartsPieChart>
                <Pie
                  data={resultadosData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {resultadosData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Performance por Esporte */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Performance por Esporte
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={esportesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="esporte" 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px"
                  }}
                />
                <Legend />
                <Bar dataKey="greens" fill="#10b981" name="Greens" />
                <Bar dataKey="reds" fill="#ef4444" name="Reds" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}