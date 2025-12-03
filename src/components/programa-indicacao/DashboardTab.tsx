import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DollarSign, Users, TrendingUp, UserPlus, Truck, ArrowRight } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";

interface CustoData {
  parceria_id: string;
  parceiro_nome: string;
  origem_tipo: string;
  data_inicio: string;
  valor_indicador: number;
  valor_parceiro: number;
  valor_fornecedor: number;
  custo_total: number;
  indicador_nome: string | null;
  fornecedor_nome: string | null;
}

export function DashboardTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [custos, setCustos] = useState<CustoData[]>([]);
  const [periodoFilter, setPeriodoFilter] = useState<string>("todos");

  useEffect(() => {
    fetchCustos();
  }, []);

  const fetchCustos = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("v_custos_aquisicao")
        .select("*");

      if (error) throw error;
      setCustos(data || []);
    } catch (error: any) {
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const filterByPeriod = (data: CustoData[]) => {
    if (periodoFilter === "todos") return data;
    
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    
    return data.filter((item) => {
      const dataInicio = new Date(item.data_inicio);
      if (periodoFilter === "mes") return dataInicio >= startOfMonth;
      if (periodoFilter === "ano") return dataInicio >= startOfYear;
      return true;
    });
  };

  const filteredCustos = filterByPeriod(custos);

  // Calculate KPIs
  const totalInvestimento = filteredCustos.reduce((acc, c) => acc + (c.custo_total || 0), 0);
  const totalParceiros = filteredCustos.length;
  const custoMedio = totalParceiros > 0 ? totalInvestimento / totalParceiros : 0;

  // Calculate by origin
  const porOrigem = {
    indicador: filteredCustos.filter((c) => c.origem_tipo === "INDICADOR").length,
    fornecedor: filteredCustos.filter((c) => c.origem_tipo === "FORNECEDOR").length,
    direto: filteredCustos.filter((c) => c.origem_tipo === "DIRETO").length,
  };

  // Calculate payments
  const pagamentos = {
    indicadores: filteredCustos.reduce((acc, c) => acc + (c.valor_indicador || 0), 0),
    parceiros: filteredCustos.reduce((acc, c) => acc + (c.valor_parceiro || 0), 0),
    fornecedores: filteredCustos.reduce((acc, c) => acc + (c.valor_fornecedor || 0), 0),
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  // Pie chart data
  const pieData = [
    { name: "Via Indicador", value: porOrigem.indicador, color: "hsl(var(--primary))" },
    { name: "Via Fornecedor", value: porOrigem.fornecedor, color: "hsl(var(--chart-2))" },
    { name: "Direto", value: porOrigem.direto, color: "hsl(var(--chart-3))" },
  ].filter((d) => d.value > 0);

  // Bar chart data
  const barData = [
    { name: "Indicadores", valor: pagamentos.indicadores },
    { name: "Parceiros", valor: pagamentos.parceiros },
    { name: "Fornecedores", valor: pagamentos.fornecedores },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Filter */}
      <div className="flex justify-end">
        <Select value={periodoFilter} onValueChange={setPeriodoFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo período</SelectItem>
            <SelectItem value="mes">Este mês</SelectItem>
            <SelectItem value="ano">Este ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investimento Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalInvestimento)}</div>
            <p className="text-xs text-muted-foreground">
              Em aquisição de parceiros
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Parceiros Adquiridos</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalParceiros}</div>
            <p className="text-xs text-muted-foreground">
              Total de parcerias
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custo Médio</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(custoMedio)}</div>
            <p className="text-xs text-muted-foreground">
              Por parceiro
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribution by Origin */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribuição por Origem</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => [`${value} parceiros`, ""]} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payments by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagamentos por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis 
                  tickFormatter={(value) => value >= 1000 ? `R$ ${(value / 1000).toFixed(1)}k` : `R$ ${value}`}
                  tick={{ fill: "hsl(var(--muted-foreground))" }}
                  width={80}
                />
                <Tooltip 
                  formatter={(value: number) => [formatCurrency(value), "Valor"]}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                />
                <Bar dataKey="valor" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Payment Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-primary">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <UserPlus className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pago a Indicadores</p>
                <p className="text-xl font-bold">{formatCurrency(pagamentos.indicadores)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <ArrowRight className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Repassado a Parceiros</p>
                <p className="text-xl font-bold">{formatCurrency(pagamentos.parceiros)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-orange-500/10 flex items-center justify-center">
                <Truck className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pago a Fornecedores</p>
                <p className="text-xl font-bold">{formatCurrency(pagamentos.fornecedores)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Origin Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo por Origem de Aquisição</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center p-4 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-3xl font-bold text-primary">{porOrigem.indicador}</p>
              <p className="text-sm text-muted-foreground mt-1">Via Indicador</p>
              <p className="text-xs text-muted-foreground">
                {totalParceiros > 0 ? ((porOrigem.indicador / totalParceiros) * 100).toFixed(1) : 0}% do total
              </p>
            </div>
            <div className="text-center p-4 rounded-lg bg-orange-500/5 border border-orange-500/20">
              <p className="text-3xl font-bold text-orange-500">{porOrigem.fornecedor}</p>
              <p className="text-sm text-muted-foreground mt-1">Via Fornecedor</p>
              <p className="text-xs text-muted-foreground">
                {totalParceiros > 0 ? ((porOrigem.fornecedor / totalParceiros) * 100).toFixed(1) : 0}% do total
              </p>
            </div>
            <div className="text-center p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-3xl font-bold">{porOrigem.direto}</p>
              <p className="text-sm text-muted-foreground mt-1">Aquisição Direta</p>
              <p className="text-xs text-muted-foreground">
                {totalParceiros > 0 ? ((porOrigem.direto / totalParceiros) * 100).toFixed(1) : 0}% do total
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
