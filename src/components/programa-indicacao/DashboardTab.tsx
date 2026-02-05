import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { DollarSign, Users, TrendingUp, UserPlus, Truck, ArrowRight, Trophy, Award, Target, Gift, History } from "lucide-react";
import { ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { HistoricoCaptacaoDrawer } from "./HistoricoCaptacaoDrawer";
import { ModernDonutChart } from "@/components/ui/modern-donut-chart";
import { ModernBarChart } from "@/components/ui/modern-bar-chart";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod, DateRange } from "@/components/projeto-detalhe/StandardTimeFilter";
import { format } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
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


interface Acordo {
  indicador_id: string;
  meta_parceiros: number | null;
  valor_bonus: number | null;
  ativo: boolean;
}

interface BonusPago {
  indicador_id: string;
  quantidade: number;
}

interface Movimentacao {
  id: string;
  tipo: string;
  valor: number;
  status: string;
  data_movimentacao: string;
}

export function DashboardTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [custos, setCustos] = useState<CustoData[]>([]);
  const [acordos, setAcordos] = useState<Acordo[]>([]);
  const [bonusPagos, setBonusPagos] = useState<BonusPago[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [period, setPeriod] = useState<StandardPeriodFilter>("mes_atual");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [historicoOpen, setHistoricoOpen] = useState(false);
  
  // Derive date range from period
  const dateRange = getDateRangeFromPeriod(period, customDateRange);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch custos, acordos, bonus pagos, and movimentacoes in parallel
      // Use workspace-scoped views to prevent data leakage
      const [custosResult, acordosResult, bonusResult, movResult] = await Promise.all([
        supabase.from("v_custos_aquisicao").select("*"),
        supabase.from("indicador_acordos").select("indicador_id, meta_parceiros, valor_bonus, ativo").eq("ativo", true),
        // Count bonus already paid per indicador - use workspace-scoped view
        supabase.from("v_movimentacoes_indicacao_workspace")
          .select("indicador_id")
          .eq("tipo", "BONUS_INDICADOR")
          .eq("status", "CONFIRMADO"),
        // Fetch all movimentacoes for total investment calculation - use workspace-scoped view
        supabase.from("v_movimentacoes_indicacao_workspace")
          .select("id, tipo, valor, status, data_movimentacao")
      ]);

      if (custosResult.error) throw custosResult.error;
      if (acordosResult.error) throw acordosResult.error;
      if (bonusResult.error) throw bonusResult.error;
      if (movResult.error) throw movResult.error;
      
      // Aggregate bonus count per indicador
      const bonusCountMap = (bonusResult.data || []).reduce((acc, item) => {
        if (item.indicador_id) {
          acc[item.indicador_id] = (acc[item.indicador_id] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>);
      
      const bonusPagosList = Object.entries(bonusCountMap).map(([indicador_id, quantidade]) => ({
        indicador_id,
        quantidade
      }));
      
      setCustos(custosResult.data || []);
      setAcordos(acordosResult.data || []);
      setBonusPagos(bonusPagosList);
      setMovimentacoes(movResult.data || []);
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
    if (!dateRange) return data;
    
    return data.filter((item) => {
      const dataInicio = new Date(item.data_inicio);
      if (dataInicio < dateRange.start) return false;
      if (dataInicio > dateRange.end) return false;
      return true;
    });
  };

  // Filter movimentacoes by the same period
  const filterMovByPeriod = (data: Movimentacao[]) => {
    if (!dateRange) return data;
    
    return data.filter((item) => {
      const dataMov = new Date(item.data_movimentacao);
      if (dataMov < dateRange.start) return false;
      if (dataMov > dateRange.end) return false;
      return true;
    });
  };

  const filteredCustos = filterByPeriod(custos);
  const filteredMovimentacoes = filterMovByPeriod(movimentacoes);

  // Calculate KPIs - using movimentacoes (same as Financeiro tab)
  // Total Investment = all confirmed payments from movimentacoes_indicacao
  const totalPagtoParceiros = filteredMovimentacoes
    .filter((m) => (m.tipo === "PAGTO_PARCEIRO" || m.tipo === "PAGTO_FORNECEDOR") && m.status === "CONFIRMADO")
    .reduce((acc, m) => acc + m.valor, 0);
  const totalComissoes = filteredMovimentacoes
    .filter((m) => m.tipo === "COMISSAO_INDICADOR" && m.status === "CONFIRMADO")
    .reduce((acc, m) => acc + m.valor, 0);
  const totalBonus = filteredMovimentacoes
    .filter((m) => m.tipo === "BONUS_INDICADOR" && m.status === "CONFIRMADO")
    .reduce((acc, m) => acc + m.valor, 0);
  
  // Total Investment = same as "Total Geral" in Financeiro tab
  const totalInvestimento = totalPagtoParceiros + totalComissoes + totalBonus;
  const totalParceiros = filteredCustos.length;
  
  // NEW CAC LOGIC: Only CPFs with cost > 0 enter the CAC calculation
  // CPFs without cost (organic, migrated, own) are displayed but don't dilute CAC
  const cpfsPagos = filteredCustos.filter((c) => c.custo_total > 0);
  const cpfsSemCusto = filteredCustos.filter((c) => c.custo_total === 0 || c.custo_total === null);
  const qtdCpfsPagos = cpfsPagos.length;
  const qtdCpfsSemCusto = cpfsSemCusto.length;
  
  // CAC Pago Real: Only CPFs with financial cost
  const cacPago = qtdCpfsPagos > 0 ? totalInvestimento / qtdCpfsPagos : 0;
  
  // Taxa Orgânica: Percentage of CPFs without cost
  const taxaOrganica = totalParceiros > 0 ? (qtdCpfsSemCusto / totalParceiros) * 100 : 0;

  // Calculate by origin
  const porOrigem = {
    indicador: filteredCustos.filter((c) => c.origem_tipo === "INDICADOR").length,
    fornecedor: filteredCustos.filter((c) => c.origem_tipo === "FORNECEDOR").length,
    direto: filteredCustos.filter((c) => c.origem_tipo === "DIRETO").length,
  };

  // Calculate payments from confirmed movimentacoes (what was actually paid)
  const pagamentos = {
    indicadores: filteredMovimentacoes
      .filter((m) => m.tipo === "COMISSAO_INDICADOR" && m.status === "CONFIRMADO")
      .reduce((acc, m) => acc + m.valor, 0),
    parceiros: filteredMovimentacoes
      .filter((m) => m.tipo === "PAGTO_PARCEIRO" && m.status === "CONFIRMADO")
      .reduce((acc, m) => acc + m.valor, 0),
    fornecedores: filteredMovimentacoes
      .filter((m) => m.tipo === "PAGTO_FORNECEDOR" && m.status === "CONFIRMADO")
      .reduce((acc, m) => acc + m.valor, 0),
    bonus: filteredMovimentacoes
      .filter((m) => m.tipo === "BONUS_INDICADOR" && m.status === "CONFIRMADO")
      .reduce((acc, m) => acc + m.valor, 0),
  };

  // Ranking de Indicadores - sorted by TOTAL indicacoes (not meta progress)
  // Meta progress is separate and resets after bonus payment
  const indicadorRanking = Object.values(
    filteredCustos
      .filter((c) => c.indicador_id && c.indicador_nome)
      .reduce((acc, c) => {
        const key = c.indicador_id!;
        if (!acc[key]) {
          const acordo = acordos.find(a => a.indicador_id === key);
          const bonusPago = bonusPagos.find(b => b.indicador_id === key);
          const ciclosPagos = bonusPago?.quantidade || 0;
          const meta = acordo?.meta_parceiros || null;
          
          acc[key] = {
            id: key,
            nome: c.indicador_nome!,
            qtdParceiros: 0, // Total indicações (for ranking)
            valorTotal: 0,
            meta,
            valorBonus: acordo?.valor_bonus || null,
            ciclosPagos, // Cycles already paid
          };
        }
        acc[key].qtdParceiros += 1;
        acc[key].valorTotal += c.valor_indicador || 0;
        return acc;
      }, {} as Record<string, { 
        id: string; 
        nome: string; 
        qtdParceiros: number; 
        valorTotal: number; 
        meta: number | null; 
        valorBonus: number | null;
        ciclosPagos: number;
      }>)
  )
  // Sort by TOTAL indicações (ranking criteria)
  .sort((a, b) => b.qtdParceiros - a.qtdParceiros)
  .slice(0, 5);

  // Calculate pending bonus for each indicador
  const indicadoresComBonusPendente = indicadorRanking.filter(ind => {
    if (!ind.meta) return false;
    // Indicações disponíveis = total - (ciclos pagos × meta)
    const indicacoesDisponiveis = ind.qtdParceiros - (ind.ciclosPagos * ind.meta);
    // Ciclos pendentes = floor(indicações disponíveis / meta)
    const ciclosPendentes = Math.floor(indicacoesDisponiveis / ind.meta);
    return ciclosPendentes > 0;
  });

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
      const mes = format(parseLocalDate(c.data_inicio), "yyyy-MM");
      if (!acc[mes]) {
        acc[mes] = { mes, mesLabel: format(parseLocalDate(c.data_inicio), "MMM/yy", { locale: ptBR }), quantidade: 0, custo: 0 };
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

  // Pie chart data with modern gradient colors
  const pieData = [
    { name: "Via Indicador", value: porOrigem.indicador },
    { name: "Via Fornecedor", value: porOrigem.fornecedor },
    { name: "Direto", value: porOrigem.direto },
  ].filter((d) => d.value > 0);
  
  const pieColors = ["#22C55E", "#3B82F6", "#8B5CF6"];

  // Bar chart data - shows only what was actually paid (CONFIRMADO)
  const barData = [
    { name: "Comissões", valor: pagamentos.indicadores },
    { name: "Parceiros", valor: pagamentos.parceiros },
    { name: "Fornecedores", valor: pagamentos.fornecedores },
    { name: "Bônus", valor: pagamentos.bonus },
  ].filter((d) => d.valor > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Period Filter - Standardized */}
      <div className="flex flex-wrap gap-2 items-center justify-between">
        <StandardTimeFilter
          period={period}
          onPeriodChange={setPeriod}
          customDateRange={customDateRange}
          onCustomDateRangeChange={setCustomDateRange}
        />

        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground hover:text-foreground"
          onClick={() => setHistoricoOpen(true)}
        >
          <History className="h-4 w-4" />
          <span className="hidden sm:inline">Histórico</span>
        </Button>
      </div>

      {/* KPIs - Row 1: Main Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Investimento Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalInvestimento)}</div>
            <p className="text-xs text-muted-foreground">
              Custo operacional da captação
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de CPFs</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalParceiros}</div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{qtdCpfsPagos}</span> pagos
              </span>
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{qtdCpfsSemCusto}</span> sem custo
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CAC Pago Real</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(cacPago)}</div>
            <p className="text-xs text-muted-foreground">
              Apenas CPFs com custo ({qtdCpfsPagos})
            </p>
          </CardContent>
        </Card>
      </div>

      {/* KPIs - Row 2: Organic Rate Warning */}
      {qtdCpfsSemCusto > 0 && (
        <Card className="border-dashed border-muted-foreground/30 bg-muted/30">
          <CardContent className="py-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="font-normal">
                  {taxaOrganica.toFixed(1)}% orgânico
                </Badge>
                <span className="text-sm text-muted-foreground">
                  {qtdCpfsSemCusto} CPF{qtdCpfsSemCusto !== 1 ? 's' : ''} não entra{qtdCpfsSemCusto !== 1 ? 'm' : ''} no CAC (sem custo financeiro)
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                  contentStyle={{ 
                    backgroundColor: "rgba(0, 0, 0, 0.4)", 
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                    backdropFilter: "blur(12px)",
                    borderRadius: "12px",
                    padding: "12px 16px"
                  }}
                  cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
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
          <CardContent className="overflow-hidden">
            <ModernDonutChart
              data={pieData}
              height={250}
              innerRadius={60}
              outerRadius={90}
              showLegend={true}
              colors={pieColors}
              formatValue={(value) => `${value} parceiros`}
            />
          </CardContent>
        </Card>

        {/* Payments by Category */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pagamentos por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="overflow-hidden">
            <ModernBarChart
              data={barData}
              categoryKey="name"
              bars={[
                { 
                  dataKey: "valor", 
                  label: "Valor", 
                  gradientStart: "#22C55E", 
                  gradientEnd: "#16A34A" 
                },
              ]}
              height={250}
              barSize={40}
              formatValue={(value) => formatCurrency(value)}
            />
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
                {indicadorRanking.map((ind, index) => {
                  // Calculate available indicações (after subtracting paid cycles)
                  const indicacoesDisponiveis = ind.meta 
                    ? ind.qtdParceiros - (ind.ciclosPagos * ind.meta) 
                    : ind.qtdParceiros;
                  
                  // Calculate pending cycles (bonus not paid yet)
                  const ciclosPendentes = ind.meta 
                    ? Math.floor(indicacoesDisponiveis / ind.meta) 
                    : 0;
                  
                  // Progress toward NEXT bonus (reset after each payment)
                  const indicacoesNoCicloAtual = ind.meta 
                    ? indicacoesDisponiveis % ind.meta 
                    : 0;
                  
                  const progressPercent = ind.meta 
                    ? (indicacoesNoCicloAtual / ind.meta) * 100 
                    : 0;
                  
                  // Only show "META ATINGIDA" if there are pending (unpaid) cycles
                  const temBonusPendente = ciclosPendentes > 0;
                  const proximoMeta = ind.meta && indicacoesNoCicloAtual >= ind.meta * 0.8 && !temBonusPendente;
                  
                  return (
                    <div key={ind.id} className={`p-3 rounded-lg ${
                      temBonusPendente ? "bg-emerald-500/10 border border-emerald-500/30" :
                      proximoMeta ? "bg-yellow-500/10 border border-yellow-500/30" :
                      "bg-muted/30"
                    }`}>
                      <div className="flex items-center gap-3">
                        {/* Ranking position - always show position, not meta status */}
                        <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm ${
                          index === 0 ? "bg-yellow-500/20 text-yellow-500" :
                          index === 1 ? "bg-gray-400/20 text-gray-400" :
                          index === 2 ? "bg-orange-600/20 text-orange-600" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {index + 1}º
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate">{ind.nome}</p>
                            {temBonusPendente && (
                              <Badge variant="default" className="bg-emerald-500 text-xs">
                                {ciclosPendentes > 1 ? `${ciclosPendentes} BÔNUS PENDENTES` : "BÔNUS PENDENTE"}
                              </Badge>
                            )}
                            {proximoMeta && (
                              <Badge variant="outline" className="border-yellow-500 text-yellow-500 text-xs">
                                QUASE LÁ
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {ind.qtdParceiros} {ind.qtdParceiros === 1 ? "indicação" : "indicações"} no total
                            {ind.ciclosPagos > 0 && (
                              <span className="text-emerald-500"> · {ind.ciclosPagos} {ind.ciclosPagos === 1 ? "bônus pago" : "bônus pagos"}</span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-primary">{formatCurrency(ind.valorTotal)}</p>
                          <p className="text-xs text-muted-foreground">comissão</p>
                        </div>
                      </div>
                      
                      {/* Progress bar for meta - shows progress toward NEXT bonus */}
                      {ind.meta && (
                        <div className="mt-3 space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground flex items-center gap-1">
                              <Target className="h-3 w-3" />
                              Progresso próximo bônus
                            </span>
                            <span className={temBonusPendente ? "text-emerald-500 font-medium" : "text-muted-foreground"}>
                              {indicacoesNoCicloAtual}/{ind.meta} ({progressPercent.toFixed(0)}%)
                            </span>
                          </div>
                          <Progress 
                            value={temBonusPendente ? 100 : progressPercent} 
                            className={`h-2 ${temBonusPendente ? "[&>div]:bg-emerald-500" : proximoMeta ? "[&>div]:bg-yellow-500" : ""}`}
                          />
                          {ind.valorBonus && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Gift className="h-3 w-3" />
                              Bônus por meta: {formatCurrency(ind.valorBonus)}
                              {temBonusPendente && (
                                <span className="text-emerald-500 ml-1">
                                  ({formatCurrency(ind.valorBonus * ciclosPendentes)} a pagar)
                                </span>
                              )}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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

      {/* Histórico de Captação Drawer */}
      <HistoricoCaptacaoDrawer
        open={historicoOpen}
        onOpenChange={setHistoricoOpen}
      />
    </div>
  );
}
