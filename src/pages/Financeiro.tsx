import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCotacoes } from "@/hooks/useCotacoes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Users,
  Gift,
  Banknote,
  ArrowUpRight,
  Loader2,
  BarChart3,
  PieChart,
  Calendar,
  History,
  HelpCircle,
  Plus,
  Building2,
  Edit,
  Trash2,
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
  ComposedChart,
  Line,
} from "recharts";
import { format, parseISO, subMonths, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { KpiExplanationDialog, KpiType } from "@/components/financeiro/KpiExplanationDialog";
import { DespesaAdministrativaDialog } from "@/components/financeiro/DespesaAdministrativaDialog";

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

interface CashLedgerEntry {
  tipo_transacao: string;
  valor: number;
  data_transacao: string;
  moeda: string;
}

interface DespesaAdministrativa {
  id: string;
  categoria: string;
  descricao: string | null;
  valor: number;
  data_despesa: string;
  recorrente: boolean;
  status: string;
}

export default function Financeiro() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [caixaFiat, setCaixaFiat] = useState<CaixaFiat[]>([]);
  const [caixaCrypto, setCaixaCrypto] = useState<CaixaCrypto[]>([]);
  const [despesas, setDespesas] = useState<DespesaIndicacao[]>([]);
  const [custos, setCustos] = useState<CustoAquisicao[]>([]);
  const [cashLedger, setCashLedger] = useState<CashLedgerEntry[]>([]);
  const [despesasAdmin, setDespesasAdmin] = useState<DespesaAdministrativa[]>([]);

  // Hook centralizado de cotações
  const cryptoSymbols = useMemo(() => caixaCrypto.map(c => c.coin), [caixaCrypto]);
  const { cotacaoUSD, cryptoPrices, getCryptoUSDValue } = useCotacoes(cryptoSymbols);

  // Filtros de período
  const [periodoPreset, setPeriodoPreset] = useState<string>("all");
  const [dataInicio, setDataInicio] = useState<string>("");

  // Dialog states
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false);
  const [kpiType, setKpiType] = useState<KpiType>(null);
  const [despesaAdminDialogOpen, setDespesaAdminDialogOpen] = useState(false);
  const [editingDespesa, setEditingDespesa] = useState<DespesaAdministrativa | null>(null);
  const [dataFim, setDataFim] = useState<string>("");

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    // Aplicar presets de período
    const hoje = new Date();
    switch (periodoPreset) {
      case "1m":
        setDataInicio(format(subMonths(hoje, 1), "yyyy-MM-dd"));
        setDataFim(format(hoje, "yyyy-MM-dd"));
        break;
      case "3m":
        setDataInicio(format(subMonths(hoje, 3), "yyyy-MM-dd"));
        setDataFim(format(hoje, "yyyy-MM-dd"));
        break;
      case "6m":
        setDataInicio(format(subMonths(hoje, 6), "yyyy-MM-dd"));
        setDataFim(format(hoje, "yyyy-MM-dd"));
        break;
      case "12m":
        setDataInicio(format(subMonths(hoje, 12), "yyyy-MM-dd"));
        setDataFim(format(hoje, "yyyy-MM-dd"));
        break;
      case "all":
        setDataInicio("");
        setDataFim("");
        break;
    }
  }, [periodoPreset]);

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

      const [fiatResult, cryptoResult, despesasResult, custosResult, ledgerResult, despesasAdminResult] = await Promise.all([
        supabase.from("v_saldo_caixa_fiat").select("*"),
        supabase.from("v_saldo_caixa_crypto").select("*"),
        supabase.from("movimentacoes_indicacao").select("tipo, valor, data_movimentacao").eq("status", "CONFIRMADO"),
        supabase.from("v_custos_aquisicao").select("custo_total, valor_indicador, valor_parceiro, valor_fornecedor, data_inicio"),
        supabase.from("cash_ledger").select("tipo_transacao, valor, data_transacao, moeda").eq("status", "CONFIRMADO"),
        supabase.from("despesas_administrativas").select("*").eq("status", "CONFIRMADO"),
      ]);

      if (fiatResult.error) throw fiatResult.error;
      if (cryptoResult.error) throw cryptoResult.error;
      if (despesasResult.error) throw despesasResult.error;
      if (custosResult.error) throw custosResult.error;
      if (ledgerResult.error) throw ledgerResult.error;
      if (despesasAdminResult.error) throw despesasAdminResult.error;

      setCaixaFiat(fiatResult.data || []);
      setCaixaCrypto(cryptoResult.data || []);
      setDespesas(despesasResult.data || []);
      setCustos(custosResult.data || []);
      setCashLedger(ledgerResult.data || []);
      setDespesasAdmin(despesasAdminResult.data || []);
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

  const openKpiHelp = (type: KpiType) => {
    setKpiType(type);
    setKpiDialogOpen(true);
  };

  const formatCurrency = (value: number, currency: string = "BRL") => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency === "USD" ? "USD" : "BRL",
    }).format(value);
  };

  // Filtrar dados por período
  const filterByPeriod = <T extends { data_movimentacao?: string; data_inicio?: string; data_transacao?: string; data_despesa?: string }>(
    data: T[],
    dateField: keyof T
  ): T[] => {
    if (!dataInicio && !dataFim) return data;
    
    return data.filter(item => {
      const dateValue = item[dateField] as string | undefined;
      if (!dateValue) return true;
      
      const itemDate = parseISO(dateValue);
      const start = dataInicio ? startOfMonth(parseISO(dataInicio)) : new Date(0);
      const end = dataFim ? endOfMonth(parseISO(dataFim)) : new Date();
      
      return isWithinInterval(itemDate, { start, end });
    });
  };

  const filteredDespesas = filterByPeriod(despesas, "data_movimentacao");
  const filteredCustos = filterByPeriod(custos, "data_inicio");
  const filteredLedger = filterByPeriod(cashLedger, "data_transacao");
  const filteredDespesasAdmin = filterByPeriod(despesasAdmin, "data_despesa");

  // Calculate KPIs
  const saldoBRL = caixaFiat.find(f => f.moeda === "BRL")?.saldo || 0;
  const saldoUSD = caixaFiat.find(f => f.moeda === "USD")?.saldo || 0;
  // Usar cotações em tempo real para crypto
  const totalCryptoUSD = caixaCrypto.reduce((acc, c) => {
    return acc + getCryptoUSDValue(c.coin, c.saldo_coin, c.saldo_usd);
  }, 0);

  const totalDespesasIndicacao = filteredDespesas.reduce((acc, d) => acc + d.valor, 0);
  const totalComissoes = filteredDespesas.filter(d => d.tipo === "COMISSAO_INDICADOR").reduce((acc, d) => acc + d.valor, 0);
  const totalBonus = filteredDespesas.filter(d => d.tipo === "BONUS_INDICADOR").reduce((acc, d) => acc + d.valor, 0);

  const totalCustosAquisicao = filteredCustos.reduce((acc, c) => acc + (c.custo_total || 0), 0);
  const custoIndicadores = filteredCustos.reduce((acc, c) => acc + (c.valor_indicador || 0), 0);
  const custoParceiros = filteredCustos.reduce((acc, c) => acc + (c.valor_parceiro || 0), 0);
  const custoFornecedores = filteredCustos.reduce((acc, c) => acc + (c.valor_fornecedor || 0), 0);

  // Despesas administrativas
  const totalDespesasAdmin = filteredDespesasAdmin.reduce((acc, d) => acc + d.valor, 0);

  // Custos operacionais (aquisição + despesas de indicação unificados)
  const totalCustosOperacionais = totalCustosAquisicao + totalDespesasIndicacao;

  // Resultado operacional (saques - depósitos em BRL)
  const resultadoOperacional = filteredLedger
    .filter(l => l.moeda === "BRL")
    .reduce((acc, l) => {
      if (l.tipo_transacao === "SAQUE") return acc + l.valor;
      if (l.tipo_transacao === "DEPOSITO") return acc - l.valor;
      return acc;
    }, 0);

  // Capital e Margem líquida corrigida (usando cotação em tempo real)
  const capitalOperacional = saldoBRL + (saldoUSD * cotacaoUSD) + (totalCryptoUSD * cotacaoUSD);
  const margemLiquida = capitalOperacional - totalCustosOperacionais - totalDespesasAdmin;
  const margemPercent = capitalOperacional > 0 ? (margemLiquida / capitalOperacional) * 100 : 0;

  // Chart data - Distribution
  const pieData = [
    { name: "Indicadores", value: custoIndicadores, color: "hsl(var(--chart-1))" },
    { name: "Parceiros", value: custoParceiros, color: "hsl(var(--chart-2))" },
    { name: "Fornecedores", value: custoFornecedores, color: "hsl(var(--chart-3))" },
  ].filter(d => d.value > 0);

  // Monthly evolution data (últimos 12 meses)
  const getMonthlyData = () => {
    const months: Record<string, { mes: string; label: string; custos: number; despesas: number; despesasAdmin: number; resultado: number; patrimonio: number }> = {};
    
    for (let i = 11; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const key = format(date, "yyyy-MM");
      months[key] = {
        mes: key,
        label: format(date, "MMM/yy", { locale: ptBR }),
        custos: 0,
        despesas: 0,
        despesasAdmin: 0,
        resultado: 0,
        patrimonio: 0,
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

    despesasAdmin.forEach(d => {
      if (d.data_despesa) {
        const key = format(parseISO(d.data_despesa), "yyyy-MM");
        if (months[key]) {
          months[key].despesasAdmin += d.valor || 0;
        }
      }
    });

    cashLedger.forEach(l => {
      if (l.data_transacao && l.moeda === "BRL") {
        const key = format(parseISO(l.data_transacao), "yyyy-MM");
        if (months[key]) {
          if (l.tipo_transacao === "SAQUE") {
            months[key].resultado += l.valor;
          } else if (l.tipo_transacao === "DEPOSITO") {
            months[key].resultado -= l.valor;
          }
        }
      }
    });

    // Calcular patrimônio acumulado
    let patrimonioAcumulado = 0;
    const monthsArray = Object.values(months);
    monthsArray.forEach((m, index) => {
      patrimonioAcumulado += m.resultado - m.custos - m.despesas - m.despesasAdmin;
      monthsArray[index].patrimonio = patrimonioAcumulado;
    });

    return monthsArray;
  };

  const monthlyData = getMonthlyData();

  // Evolução mensal das despesas administrativas por categoria
  const getDespesasAdminMensais = () => {
    const months: Record<string, { label: string; total: number; categorias: Record<string, number> }> = {};
    
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const key = format(date, "yyyy-MM");
      months[key] = { label: format(date, "MMM/yy", { locale: ptBR }), total: 0, categorias: {} };
    }

    despesasAdmin.forEach(d => {
      if (d.data_despesa) {
        const key = format(parseISO(d.data_despesa), "yyyy-MM");
        if (months[key]) {
          months[key].categorias[d.categoria] = (months[key].categorias[d.categoria] || 0) + d.valor;
          months[key].total += d.valor;
        }
      }
    });

    return Object.entries(months).map(([mes, data]) => ({ 
      mes, 
      label: data.label, 
      total: data.total,
      ...data.categorias 
    }));
  };

  const despesasAdminMensais = getDespesasAdminMensais();

  // Categorias únicas das despesas admin para cores do gráfico e passar ao dialog
  const categoriasUnicas = [...new Set(despesasAdmin.map(d => d.categoria))];
  const coresCategoria: Record<string, string> = {
    ENERGIA: "hsl(var(--chart-1))",
    INTERNET_MOVEL: "hsl(var(--chart-2))",
    ALUGUEL: "hsl(var(--chart-3))",
    OPERADORES: "hsl(var(--chart-4))",
  };

  // Bar chart - comparison
  const comparisonData = [
    { name: "Caixa FIAT", valor: saldoBRL + saldoUSD * 5 },
    { name: "Caixa Crypto", valor: totalCryptoUSD * 5 },
    { name: "Custos Operacionais", valor: totalCustosOperacionais },
    { name: "Despesas Admin.", valor: totalDespesasAdmin },
  ];

  // Histórico mensal detalhado
  const getHistoricoMensal = () => {
    return monthlyData.map(m => ({
      ...m,
      lucroLiquido: m.resultado - m.custos - m.despesas - m.despesasAdmin,
      totalCustos: m.custos + m.despesas + m.despesasAdmin,
    }));
  };

  const historicoMensal = getHistoricoMensal();

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
            <div className="flex items-center gap-1">
              <CardTitle className="text-sm font-medium">Capital Operacional</CardTitle>
              <button onClick={() => openKpiHelp("capital_operacional")} className="text-muted-foreground hover:text-foreground transition-colors">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(capitalOperacional)}</div>
            <div className="mt-2 space-y-1">
              <p className="text-xs text-muted-foreground flex justify-between">
                <span>BRL:</span>
                <span className="font-medium">{formatCurrency(saldoBRL)}</span>
              </p>
              <p className="text-xs text-muted-foreground flex justify-between">
                <span>USD:</span>
                <span className="font-medium">${saldoUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })} <span className="text-muted-foreground/60">({formatCurrency(saldoUSD * cotacaoUSD)})</span></span>
              </p>
              <p className="text-xs text-muted-foreground flex justify-between">
                <span>CRYPTO:</span>
                <span className="font-medium">${totalCryptoUSD.toFixed(2)} <span className="text-muted-foreground/60">({formatCurrency(totalCryptoUSD * cotacaoUSD)})</span></span>
              </p>
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-2 border-t border-border/30 pt-1">
              Cotação USD/BRL: R$ {cotacaoUSD.toFixed(4)}
            </p>
          </CardContent>
        </Card>

        {/* Custos Operacionais (Unificado: Aquisição + Despesas Indicação) */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1">
              <CardTitle className="text-sm font-medium">Custos Operacionais</CardTitle>
              <button onClick={() => openKpiHelp("custos_operacionais")} className="text-muted-foreground hover:text-foreground transition-colors">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(totalCustosOperacionais)}
            </div>
            <div className="flex gap-2 mt-2 text-xs text-muted-foreground flex-wrap">
              <span>Aquisição: {formatCurrency(totalCustosAquisicao)}</span>
              <span>•</span>
              <span>Indicação: {formatCurrency(totalDespesasIndicacao)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Despesas Administrativas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1">
              <CardTitle className="text-sm font-medium">Despesas Admin.</CardTitle>
              <button onClick={() => openKpiHelp("despesas_administrativas")} className="text-muted-foreground hover:text-foreground transition-colors">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {formatCurrency(totalDespesasAdmin)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredDespesasAdmin.length} despesas no período
            </p>
          </CardContent>
        </Card>

        {/* Margem Líquida */}
        <Card className={margemLiquida >= 0 ? "border-success/30" : "border-destructive/30"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="flex items-center gap-1">
              <CardTitle className="text-sm font-medium">Margem Líquida</CardTitle>
              <button onClick={() => openKpiHelp("margem_liquida")} className="text-muted-foreground hover:text-foreground transition-colors">
                <HelpCircle className="h-3.5 w-3.5" />
              </button>
            </div>
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
          <TabsTrigger value="despesas" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Despesas Administrativas
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico Mensal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* Filtros de Período */}
          <div className="flex flex-wrap items-center gap-3">
          <Select value={periodoPreset} onValueChange={setPeriodoPreset}>
            <SelectTrigger className="w-[190px] flex items-center">
              <Calendar className="h-4 w-4 mr-2 shrink-0" />
              <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo período</SelectItem>
                <SelectItem value="1m">Último mês</SelectItem>
                <SelectItem value="3m">3 meses</SelectItem>
                <SelectItem value="6m">6 meses</SelectItem>
                <SelectItem value="12m">12 meses</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <DatePicker
                value={dataInicio}
                onChange={setDataInicio}
                placeholder="Data início"
              />
              <span className="text-muted-foreground">até</span>
              <DatePicker
                value={dataFim}
                onChange={setDataFim}
                placeholder="Data fim"
              />
            </div>
          </div>

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
                    <span>Pagamentos a Indicadores</span>
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
                    <span>Pagamentos a Parceiros</span>
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
                    <span>Pagamentos a Fornecedores</span>
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
                  <div className="flex justify-between font-medium">
                    <span>Total Custos de Aquisição</span>
                    <span className="text-destructive">{formatCurrency(totalCustosAquisicao)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab: Despesas Administrativas */}
        <TabsContent value="despesas" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Despesas Administrativas</h2>
              <p className="text-sm text-muted-foreground">Gerencie as despesas do escritório</p>
            </div>
            <Button onClick={() => { setEditingDespesa(null); setDespesaAdminDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Despesa
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-3 px-4 font-medium">Data</th>
                      <th className="text-left py-3 px-4 font-medium">Categoria</th>
                      <th className="text-left py-3 px-4 font-medium">Descrição</th>
                      <th className="text-right py-3 px-4 font-medium">Valor</th>
                      <th className="text-center py-3 px-4 font-medium">Recorrente</th>
                      <th className="text-center py-3 px-4 font-medium">Status</th>
                      <th className="text-center py-3 px-4 font-medium">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {despesasAdmin.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-muted-foreground">
                          Nenhuma despesa administrativa cadastrada
                        </td>
                      </tr>
                    ) : (
                      despesasAdmin
                        .sort((a, b) => new Date(b.data_despesa).getTime() - new Date(a.data_despesa).getTime())
                        .map((despesa) => (
                          <tr key={despesa.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="py-3 px-4">
                              {format(parseISO(despesa.data_despesa), "dd/MM/yyyy", { locale: ptBR })}
                            </td>
                            <td className="py-3 px-4">
                              <Badge variant="outline">{despesa.categoria}</Badge>
                            </td>
                            <td className="py-3 px-4 text-muted-foreground">
                              {despesa.descricao || "—"}
                            </td>
                            <td className="py-3 px-4 text-right font-medium text-orange-500">
                              {formatCurrency(despesa.valor)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {despesa.recorrente ? (
                                <Badge variant="secondary" className="text-xs">Sim</Badge>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <Badge 
                                variant={despesa.status === "CONFIRMADO" ? "default" : "secondary"}
                                className="text-xs"
                              >
                                {despesa.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => { setEditingDespesa(despesa); setDespesaAdminDialogOpen(true); }}
                                  className="text-muted-foreground hover:text-foreground transition-colors"
                                  title="Editar"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={async () => {
                                    if (confirm("Tem certeza que deseja excluir esta despesa?")) {
                                      const { error } = await supabase.from("despesas_administrativas").delete().eq("id", despesa.id);
                                      if (error) {
                                        toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
                                      } else {
                                        toast({ title: "Despesa excluída" });
                                        fetchData();
                                      }
                                    }
                                  }}
                                  className="text-muted-foreground hover:text-destructive transition-colors"
                                  title="Excluir"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Resumo por Categoria */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo por Categoria</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(
                  despesasAdmin.reduce((acc, d) => {
                    acc[d.categoria] = (acc[d.categoria] || 0) + d.valor;
                    return acc;
                  }, {} as Record<string, number>)
                ).sort((a, b) => b[1] - a[1]).map(([categoria, valor]) => (
                  <div key={categoria} className="flex items-center justify-between">
                    <span className="text-sm">{categoria}</span>
                    <span className="font-medium text-orange-500">{formatCurrency(valor)}</span>
                  </div>
                ))}
                {despesasAdmin.length > 0 && (
                  <div className="pt-3 border-t flex items-center justify-between font-semibold">
                    <span>Total</span>
                    <span className="text-orange-500">{formatCurrency(totalDespesasAdmin)}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Gráfico Evolução Mensal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evolução Mensal das Despesas</CardTitle>
            </CardHeader>
            <CardContent>
              {despesasAdmin.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma despesa cadastrada para exibir o gráfico
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={despesasAdminMensais}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                    <YAxis 
                      tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
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
                      formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    />
                    <Legend />
                    {categoriasUnicas.map((cat, index) => (
                      <Bar 
                        key={cat}
                        dataKey={cat} 
                        name={cat}
                        stackId="a"
                        fill={coresCategoria[cat] || `hsl(var(--chart-${(index % 5) + 1}))`}
                        radius={index === categoriasUnicas.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="space-y-6">
          {/* Gráfico Comparativo Mensal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Comparativo Mensal: Resultado vs Custos</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={350}>
                <ComposedChart data={historicoMensal}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis 
                    tickFormatter={(value) => value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value}
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
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  />
                  <Legend />
                  <Bar 
                    dataKey="resultado" 
                    name="Resultado Operacional" 
                    fill="hsl(var(--primary))" 
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar 
                    dataKey="custos" 
                    name="Custos Aquisição" 
                    fill="hsl(var(--destructive))" 
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar 
                    dataKey="despesas" 
                    name="Despesas Gerais" 
                    fill="hsl(var(--chart-2))" 
                    radius={[4, 4, 0, 0]}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="patrimonio" 
                    name="Patrimônio Acumulado" 
                    stroke="hsl(var(--success))" 
                    strokeWidth={3}
                    dot={{ fill: "hsl(var(--success))", strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* KPIs do Período */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                    Resultado Operacional
                  </CardTitle>
                  <button
                    onClick={() => openKpiHelp("resultado")}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${resultadoOperacional >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(resultadoOperacional)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                    Custos Aquisição
                  </CardTitle>
                  <button
                    onClick={() => openKpiHelp("custos")}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-destructive">
                  {formatCurrency(totalCustosAquisicao)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                    Despesas Operacionais
                  </CardTitle>
                  <button
                    onClick={() => openKpiHelp("despesas_operacionais")}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-muted-foreground">
                  {formatCurrency(totalDespesasIndicacao)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                    Despesas Admin.
                  </CardTitle>
                  <button
                    onClick={() => openKpiHelp("despesas_administrativas")}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-chart-2">
                  {formatCurrency(totalDespesasAdmin)}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 text-xs"
                  onClick={() => setDespesaAdminDialogOpen(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Adicionar
                </Button>
              </CardContent>
            </Card>

            <Card className={resultadoOperacional - totalCustosAquisicao - totalDespesasIndicacao - totalDespesasAdmin >= 0 ? "border-success/30" : "border-destructive/30"}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase">
                    Lucro Líquido
                  </CardTitle>
                  <button
                    onClick={() => openKpiHelp("lucro")}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                </div>
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold ${resultadoOperacional - totalCustosAquisicao - totalDespesasIndicacao - totalDespesasAdmin >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(resultadoOperacional - totalCustosAquisicao - totalDespesasIndicacao - totalDespesasAdmin)}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabela de Histórico Mensal */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhamento Mês a Mês</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-2 font-medium">Mês</th>
                      <th className="text-right py-3 px-2 font-medium">Resultado</th>
                      <th className="text-right py-3 px-2 font-medium">Custos Aq.</th>
                      <th className="text-right py-3 px-2 font-medium">Desp. Oper.</th>
                      <th className="text-right py-3 px-2 font-medium">Desp. Admin.</th>
                      <th className="text-right py-3 px-2 font-medium">Lucro Líquido</th>
                      <th className="text-right py-3 px-2 font-medium">Patrimônio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicoMensal.map((mes, index) => (
                      <tr key={mes.mes} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-3 px-2 font-medium">{mes.label}</td>
                        <td className={`text-right py-3 px-2 ${mes.resultado >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(mes.resultado)}
                        </td>
                        <td className="text-right py-3 px-2 text-destructive">
                          {mes.custos > 0 ? `-${formatCurrency(mes.custos)}` : formatCurrency(0)}
                        </td>
                        <td className="text-right py-3 px-2 text-muted-foreground">
                          {mes.despesas > 0 ? `-${formatCurrency(mes.despesas)}` : formatCurrency(0)}
                        </td>
                        <td className="text-right py-3 px-2 text-chart-2">
                          {mes.despesasAdmin > 0 ? `-${formatCurrency(mes.despesasAdmin)}` : formatCurrency(0)}
                        </td>
                        <td className={`text-right py-3 px-2 font-medium ${mes.lucroLiquido >= 0 ? "text-success" : "text-destructive"}`}>
                          {formatCurrency(mes.lucroLiquido)}
                        </td>
                        <td className={`text-right py-3 px-2 font-bold ${mes.patrimonio >= 0 ? "text-primary" : "text-destructive"}`}>
                          {formatCurrency(mes.patrimonio)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <KpiExplanationDialog
        open={kpiDialogOpen}
        onOpenChange={setKpiDialogOpen}
        kpiType={kpiType}
      />

      <DespesaAdministrativaDialog
        open={despesaAdminDialogOpen}
        onOpenChange={(open) => {
          setDespesaAdminDialogOpen(open);
          if (!open) setEditingDespesa(null);
        }}
        despesa={editingDespesa}
        onSuccess={fetchData}
        categoriasExtras={categoriasUnicas}
      />
    </div>
  );
}
