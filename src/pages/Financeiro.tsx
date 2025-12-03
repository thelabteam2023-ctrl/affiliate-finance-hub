import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Gift,
  Banknote,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  BarChart3,
  PieChart,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart as RechartsPie,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CaixaFiat {
  moeda: string;
  saldo: number;
}

interface CaixaCrypto {
  coin: string;
  saldo_coin: number;
  saldo_usd: number;
}

interface DespesaIndicacao {
  tipo: string;
  valor: number;
  data_movimentacao: string;
}

interface CustoAquisicao {
  custo_total: number;
  valor_indicador: number;
  valor_parceiro: number;
  valor_fornecedor: number;
  data_inicio: string;
}

export default function Financeiro() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [caixaFiat, setCaixaFiat] = useState<CaixaFiat[]>([]);
  const [caixaCrypto, setCaixaCrypto] = useState<CaixaCrypto[]>([]);
  const [despesas, setDespesas] = useState<DespesaIndicacao[]>([]);
  const [custos, setCustos] = useState<CustoAquisicao[]>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
    } else {
      fetchData();
    }
  };

  const fetchData = async () => {
    try {
      setLoading(true);

      const [fiatResult, cryptoResult, despesasResult, custosResult] = await Promise.all([
        supabase.from("v_saldo_caixa_fiat").select("*"),
        supabase.from("v_saldo_caixa_crypto").select("*"),
        supabase.from("movimentacoes_indicacao").select("tipo, valor, data_movimentacao").eq("status", "CONFIRMADO"),
        supabase.from("v_custos_aquisicao").select("custo_total, valor_indicador, valor_parceiro, valor_fornecedor, data_inicio"),
      ]);

      if (fiatResult.error) throw fiatResult.error;
      if (cryptoResult.error) throw cryptoResult.error;
      if (despesasResult.error) throw despesasResult.error;
      if (custosResult.error) throw custosResult.error;

      setCaixaFiat(fiatResult.data || []);
      setCaixaCrypto(cryptoResult.data || []);
      setDespesas(despesasResult.data || []);
      setCustos(custosResult.data || []);
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

  const formatCurrency = (value: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency === "USD" ? "USD" : "BRL",
    }).format(value);
  };

  // Calculate KPIs
  const saldoBRL = caixaFiat.find(f => f.moeda === "BRL")?.saldo || 0;
  const saldoUSD = caixaFiat.find(f => f.moeda === "USD")?.saldo || 0;
  const totalCryptoUSD = caixaCrypto.reduce((acc, c) => acc + (c.saldo_usd || 0), 0);

  const totalDespesasIndicacao = despesas.reduce((acc, d) => acc + d.valor, 0);
  const totalComissoes = despesas.filter(d => d.tipo === "COMISSAO_INDICADOR").reduce((acc, d) => acc + d.valor, 0);
  const totalBonus = despesas.filter(d => d.tipo === "BONUS_INDICADOR").reduce((acc, d) => acc + d.valor, 0);

  const totalCustosAquisicao = custos.reduce((acc, c) => acc + (c.custo_total || 0), 0);
  const custoIndicadores = custos.reduce((acc, c) => acc + (c.valor_indicador || 0), 0);
  const custoParceiros = custos.reduce((acc, c) => acc + (c.valor_parceiro || 0), 0);
  const custoFornecedores = custos.reduce((acc, c) => acc + (c.valor_fornecedor || 0), 0);

  // Margem líquida (simplificada)
  const capitalOperacional = saldoBRL + (saldoUSD * 5) + (totalCryptoUSD * 5); // Aproximação
  const margemLiquida = capitalOperacional - totalCustosAquisicao;
  const margemPercent = capitalOperacional > 0 ? (margemLiquida / capitalOperacional) * 100 : 0;

  // Chart data - Distribution
  const pieData = [
    { name: "Indicadores", value: custoIndicadores, color: "hsl(var(--chart-1))" },
    { name: "Parceiros", value: custoParceiros, color: "hsl(var(--chart-2))" },
    { name: "Fornecedores", value: custoFornecedores, color: "hsl(var(--chart-3))" },
  ].filter(d => d.value > 0);

  // Monthly evolution
  const getMonthlyData = () => {
    const months: Record<string, { mes: string; label: string; custos: number; despesas: number }> = {};
    
    // Last 6 months
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const key = format(date, "yyyy-MM");
      months[key] = {
        mes: key,
        label: format(date, "MMM", { locale: ptBR }),
        custos: 0,
        despesas: 0,
      };
    }

    custos.forEach(c => {
      if (c.data_inicio) {
        const key = format(parseISO(c.data_inicio), "yyyy-MM");
        if (months[key]) {
          months[key].custos += c.custo_total || 0;
        }
      }
    });

    despesas.forEach(d => {
      if (d.data_movimentacao) {
        const key = format(parseISO(d.data_movimentacao), "yyyy-MM");
        if (months[key]) {
          months[key].despesas += d.valor || 0;
        }
      }
    });

    return Object.values(months);
  };

  const monthlyData = getMonthlyData();

  // Bar chart - comparison
  const comparisonData = [
    { name: "Caixa FIAT", valor: saldoBRL + saldoUSD * 5 },
    { name: "Caixa Crypto", valor: totalCryptoUSD * 5 },
    { name: "Custos Aquisição", valor: totalCustosAquisicao },
    { name: "Despesas Pagas", valor: totalDespesasIndicacao },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Visão Financeira</h1>
        <p className="text-muted-foreground">
          Dashboard consolidado: Caixa Operacional + Despesas de Infraestrutura
        </p>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Capital Operacional */}
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Capital Operacional</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(capitalOperacional)}</div>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                BRL {formatCurrency(saldoBRL)}
              </Badge>
              <Badge variant="outline" className="text-xs">
                Crypto ${totalCryptoUSD.toFixed(2)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Custos de Aquisição */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Custos de Aquisição</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(totalCustosAquisicao)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {custos.length} parceiros adquiridos
            </p>
          </CardContent>
        </Card>

        {/* Despesas Pagas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Despesas Pagas</CardTitle>
            <Banknote className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalDespesasIndicacao)}</div>
            <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
              <span>Comissões: {formatCurrency(totalComissoes)}</span>
              <span>•</span>
              <span>Bônus: {formatCurrency(totalBonus)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Margem Líquida */}
        <Card className={margemLiquida >= 0 ? "border-success/30" : "border-destructive/30"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Margem Líquida</CardTitle>
            {margemLiquida >= 0 ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${margemLiquida >= 0 ? "text-success" : "text-destructive"}`}>
              {formatCurrency(margemLiquida)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {margemPercent >= 0 ? "+" : ""}{margemPercent.toFixed(1)}% do capital
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Sections */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="custos" className="flex items-center gap-2">
            <PieChart className="h-4 w-4" />
            Custos Detalhados
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Evolution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Evolução Mensal</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis 
                      tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} 
                    />
                    <Tooltip
                      contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                      formatter={(value: number) => [formatCurrency(value), ""]}
                    />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="custos"
                      name="Custos Aquisição"
                      stroke="hsl(var(--destructive))"
                      fill="hsl(var(--destructive) / 0.2)"
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="despesas"
                      name="Despesas Pagas"
                      stroke="hsl(var(--chart-2))"
                      fill="hsl(var(--chart-2) / 0.2)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Comparison Bar */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Comparativo Geral</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={comparisonData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis 
                      type="number"
                      tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      width={120}
                      tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
                    />
                    <Tooltip
                      contentStyle={{ 
                        backgroundColor: "rgba(0, 0, 0, 0.4)", 
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        backdropFilter: "blur(12px)",
                        borderRadius: "12px",
                        padding: "12px 16px"
                      }}
                      cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
                      formatter={(value: number) => [formatCurrency(value), "Valor"]}
                    />
                    <Bar 
                      dataKey="valor" 
                      fill="hsl(var(--primary))" 
                      radius={[0, 4, 4, 0]}
                      background={{ fill: "transparent" }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Caixa Operacional */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Caixa Operacional</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                  <span className="text-sm">Saldo FIAT (BRL)</span>
                  <span className="font-bold">{formatCurrency(saldoBRL)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                  <span className="text-sm">Saldo FIAT (USD)</span>
                  <span className="font-bold">{formatCurrency(saldoUSD, "USD")}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                  <span className="text-sm">Exposição Crypto</span>
                  <span className="font-bold">${totalCryptoUSD.toFixed(2)}</span>
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => navigate("/caixa")}
                >
                  <ArrowUpRight className="h-4 w-4 mr-2" />
                  Ir para Caixa
                </Button>
              </CardContent>
            </Card>

            {/* Despesas de Infraestrutura */}
            <Card>
              <CardHeader className="flex flex-row items-center gap-2">
                <Banknote className="h-5 w-5 text-chart-2" />
                <CardTitle className="text-base">Despesas de Infraestrutura</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Gift className="h-4 w-4 text-primary" />
                    <span className="text-sm">Bônus Pagos</span>
                  </div>
                  <span className="font-bold">{formatCurrency(totalBonus)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Banknote className="h-4 w-4 text-chart-2" />
                    <span className="text-sm">Comissões Pagas</span>
                  </div>
                  <span className="font-bold">{formatCurrency(totalComissoes)}</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-chart-3" />
                    <span className="text-sm">Custos Aquisição</span>
                  </div>
                  <span className="font-bold">{formatCurrency(totalCustosAquisicao)}</span>
                </div>
                <Button
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => navigate("/programa-indicacao")}
                >
                  <ArrowUpRight className="h-4 w-4 mr-2" />
                  Ir para Captação
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="custos" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribuição de Custos</CardTitle>
              </CardHeader>
              <CardContent>
                {pieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <RechartsPie>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={70}
                        outerRadius={110}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => [formatCurrency(value), "Valor"]}
                        contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                      />
                      <Legend />
                    </RechartsPie>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                    Sem dados de custos
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Detailed Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Detalhamento de Custos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pagamentos a Indicadores</span>
                    <span className="font-medium">{formatCurrency(custoIndicadores)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-chart-1 rounded-full"
                      style={{ width: `${totalCustosAquisicao > 0 ? (custoIndicadores / totalCustosAquisicao) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pagamentos a Parceiros</span>
                    <span className="font-medium">{formatCurrency(custoParceiros)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-chart-2 rounded-full"
                      style={{ width: `${totalCustosAquisicao > 0 ? (custoParceiros / totalCustosAquisicao) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Pagamentos a Fornecedores</span>
                    <span className="font-medium">{formatCurrency(custoFornecedores)}</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-chart-3 rounded-full"
                      style={{ width: `${totalCustosAquisicao > 0 ? (custoFornecedores / totalCustosAquisicao) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="flex justify-between">
                    <span className="font-medium">Total de Custos</span>
                    <span className="font-bold text-lg">{formatCurrency(totalCustosAquisicao)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
