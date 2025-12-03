import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DollarSign, Users, TrendingUp, UserPlus, Truck, ArrowRight, CalendarDays, Trophy, Award } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts";
import { format, startOfMonth, startOfYear, subMonths, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

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
  indicador_id: string | null;
  fornecedor_nome: string | null;
  fornecedor_id: string | null;
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

export function DashboardTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [custos, setCustos] = useState<CustoData[]>([]);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: startOfMonth(new Date()),
    to: new Date(),
  });
  const [quickFilter, setQuickFilter] = useState<string>("mes");

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

  const handleQuickFilter = (filter: string) => {
    setQuickFilter(filter);
    const now = new Date();
    
    switch (filter) {
      case "mes":
        setDateRange({ from: startOfMonth(now), to: now });
        break;
      case "ano":
        setDateRange({ from: startOfYear(now), to: now });
        break;
      case "3meses":
        setDateRange({ from: subMonths(now, 3), to: now });
        break;
      case "6meses":
        setDateRange({ from: subMonths(now, 6), to: now });
        break;
      case "todos":
        setDateRange({ from: undefined, to: undefined });
        break;
    }
  };

  const filterByPeriod = (data: CustoData[]) => {
    if (!dateRange.from && !dateRange.to) return data;
    
    return data.filter((item) => {
      const dataInicio = new Date(item.data_inicio);
      if (dateRange.from && dataInicio < dateRange.from) return false;
      if (dateRange.to && dataInicio > dateRange.to) return false;
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

  // Ranking de Indicadores
  const indicadorRanking = Object.values(
    filteredCustos
      .filter((c) => c.indicador_id && c.indicador_nome)
      .reduce((acc, c) => {
        const key = c.indicador_id!;
        if (!acc[key]) {
          acc[key] = {
            id: key,
            nome: c.indicador_nome!,
            qtdParceiros: 0,
            valorTotal: 0,
          };
        }
        acc[key].qtdParceiros += 1;
        acc[key].valorTotal += c.valor_indicador || 0;
        return acc;
      }, {} as Record<string, { id: string; nome: string; qtdParceiros: number; valorTotal: number }>)
  ).sort((a, b) => b.qtdParceiros - a.qtdParceiros).slice(0, 5);

  // Ranking de Fornecedores
  const fornecedorRanking = Object.values(
    filteredCustos
      .filter((c) => c.fornecedor_id && c.fornecedor_nome)
      .reduce((acc, c) => {
        const key = c.fornecedor_id!;
        if (!acc[key]) {
          acc[key] = {
            id: key,
            nome: c.fornecedor_nome!,
            qtdParceiros: 0,
            valorTotal: 0,
          };
        }
        acc[key].qtdParceiros += 1;
        acc[key].valorTotal += c.valor_fornecedor || 0;
        return acc;
      }, {} as Record<string, { id: string; nome: string; qtdParceiros: number; valorTotal: number }>)
  ).sort((a, b) => b.qtdParceiros - a.qtdParceiros).slice(0, 5);

  // Evolução Mensal
  const evolucaoMensal = Object.values(
    filteredCustos.reduce((acc, c) => {
      const mes = format(parseISO(c.data_inicio), "yyyy-MM");
      if (!acc[mes]) {
        acc[mes] = { mes, mesLabel: format(parseISO(c.data_inicio), "MMM/yy", { locale: ptBR }), quantidade: 0, custo: 0 };
      }
      acc[mes].quantidade += 1;
      acc[mes].custo += c.custo_total || 0;
      return acc;
    }, {} as Record<string, { mes: string; mesLabel: string; quantidade: number; custo: number }>)
  ).sort((a, b) => a.mes.localeCompare(b.mes));

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
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={quickFilter === "mes" ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickFilter("mes")}
          >
            Este mês
          </Button>
          <Button
            variant={quickFilter === "3meses" ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickFilter("3meses")}
          >
            Últimos 3 meses
          </Button>
          <Button
            variant={quickFilter === "6meses" ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickFilter("6meses")}
          >
            Últimos 6 meses
          </Button>
          <Button
            variant={quickFilter === "ano" ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickFilter("ano")}
          >
            Este ano
          </Button>
          <Button
            variant={quickFilter === "todos" ? "default" : "outline"}
            size="sm"
            onClick={() => handleQuickFilter("todos")}
          >
            Todo período
          </Button>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <CalendarDays className="h-4 w-4" />
              {dateRange.from && dateRange.to
                ? `${format(dateRange.from, "dd/MM/yy")} - ${format(dateRange.to, "dd/MM/yy")}`
                : "Período personalizado"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              selected={{ from: dateRange.from, to: dateRange.to }}
              onSelect={(range) => {
                setDateRange({ from: range?.from, to: range?.to });
                setQuickFilter("custom");
              }}
              locale={ptBR}
              numberOfMonths={2}
            />
          </PopoverContent>
        </Popover>
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

      {/* Evolution Chart */}
      {evolucaoMensal.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolução de Aquisições</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={evolucaoMensal}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="mesLabel" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickFormatter={(value) => formatCurrency(value)}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                  formatter={(value: number, name: string) => [
                    name === "quantidade" ? `${value} parceiros` : formatCurrency(value),
                    name === "quantidade" ? "Quantidade" : "Custo Total"
                  ]}
                />
                <Line yAxisId="left" type="monotone" dataKey="quantidade" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: "hsl(var(--primary))" }} />
                <Line yAxisId="right" type="monotone" dataKey="custo" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ fill: "hsl(var(--chart-2))" }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

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

      {/* Rankings Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ranking de Indicadores */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Top Indicadores</CardTitle>
          </CardHeader>
          <CardContent>
            {indicadorRanking.length > 0 ? (
              <div className="space-y-3">
                {indicadorRanking.map((ind, index) => (
                  <div key={ind.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      index === 0 ? "bg-yellow-500/20 text-yellow-500" :
                      index === 1 ? "bg-gray-400/20 text-gray-400" :
                      index === 2 ? "bg-orange-600/20 text-orange-600" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {index + 1}º
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{ind.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {ind.qtdParceiros} {ind.qtdParceiros === 1 ? "indicação" : "indicações"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-primary">{formatCurrency(ind.valorTotal)}</p>
                      <p className="text-xs text-muted-foreground">comissão</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <UserPlus className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Nenhuma indicação no período</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ranking de Fornecedores */}
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Award className="h-5 w-5 text-orange-500" />
            <CardTitle className="text-base">Top Fornecedores</CardTitle>
          </CardHeader>
          <CardContent>
            {fornecedorRanking.length > 0 ? (
              <div className="space-y-3">
                {fornecedorRanking.map((forn, index) => (
                  <div key={forn.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      index === 0 ? "bg-yellow-500/20 text-yellow-500" :
                      index === 1 ? "bg-gray-400/20 text-gray-400" :
                      index === 2 ? "bg-orange-600/20 text-orange-600" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {index + 1}º
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{forn.nome}</p>
                      <p className="text-sm text-muted-foreground">
                        {forn.qtdParceiros} {forn.qtdParceiros === 1 ? "parceiro" : "parceiros"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-orange-500">{formatCurrency(forn.valorTotal)}</p>
                      <p className="text-xs text-muted-foreground">pago</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Truck className="h-8 w-8 mb-2 opacity-50" />
                <p className="text-sm">Nenhum fornecedor no período</p>
              </div>
            )}
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
