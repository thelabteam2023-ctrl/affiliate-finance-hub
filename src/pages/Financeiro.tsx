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
  RefreshCw,
  Info,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { format, parseISO, subMonths, subWeeks, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import { KpiExplanationDialog, KpiType } from "@/components/financeiro/KpiExplanationDialog";
import { DespesaAdministrativaDialog } from "@/components/financeiro/DespesaAdministrativaDialog";
import { ModernBarChart } from "@/components/ui/modern-bar-chart";
import { SaudeFinanceiraCard } from "@/components/financeiro/SaudeFinanceiraCard";
import { RentabilidadeCaptacaoCard } from "@/components/financeiro/RentabilidadeCaptacaoCard";
import { HistoricoDespesasAdmin } from "@/components/financeiro/HistoricoDespesasAdmin";
import { FluxoCaixaCard } from "@/components/financeiro/FluxoCaixaCard";
import { ComposicaoCustosCard } from "@/components/financeiro/ComposicaoCustosCard";

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

interface PagamentoOperador {
  tipo_pagamento: string;
  valor: number;
  data_pagamento: string;
  status: string;
}

interface BookmakerSaldo {
  saldo_atual: number;
  saldo_freebet: number;
  saldo_irrecuperavel: number;
  status: string;
}

interface SaudeFinanceiraData {
  liquidezImediata: number;
  reservaEstrategica: number;
  compromissosPendentes: {
    despesasAdmin: number;
    pagamentosOperador: number;
    total: number;
  };
  compromissosQuitados: {
    custosOperacionais: number;
    despesasAdmin: number;
    pagamentosOperador: number;
    total: number;
  };
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
  const [despesasAdminPendentes, setDespesasAdminPendentes] = useState<DespesaAdministrativa[]>([]);
  const [pagamentosOperador, setPagamentosOperador] = useState<PagamentoOperador[]>([]);
  const [pagamentosOperadorPendentes, setPagamentosOperadorPendentes] = useState<PagamentoOperador[]>([]);
  const [bookmakersSaldos, setBookmakersSaldos] = useState<BookmakerSaldo[]>([]);
  const [lucroOperacionalApostas, setLucroOperacionalApostas] = useState<number>(0);
  const [totalParceirosAtivos, setTotalParceirosAtivos] = useState<number>(0);
  // Hook centralizado de cotações
  const cryptoSymbols = useMemo(() => caixaCrypto.map(c => c.coin), [caixaCrypto]);
  const { cotacaoUSD, cryptoPrices, getCryptoUSDValue, getCryptoPrice, refreshAll: refreshCotacoes, loading: loadingCotacoes, lastUpdate, source } = useCotacoes(cryptoSymbols);

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

      const [
        fiatResult, 
        cryptoResult, 
        despesasResult, 
        custosResult, 
        ledgerResult, 
        despesasAdminResult, 
        despesasAdminPendentesResult,
        pagamentosOpResult, 
        pagamentosOpPendentesResult,
        bookmakersResult,
        apostasLucroResult,
        parceirosAtivosResult
      ] = await Promise.all([
        supabase.from("v_saldo_caixa_fiat").select("*"),
        supabase.from("v_saldo_caixa_crypto").select("*"),
        supabase.from("movimentacoes_indicacao").select("tipo, valor, data_movimentacao").eq("status", "CONFIRMADO"),
        supabase.from("v_custos_aquisicao").select("custo_total, valor_indicador, valor_parceiro, valor_fornecedor, data_inicio"),
        supabase.from("cash_ledger").select("tipo_transacao, valor, data_transacao, moeda").eq("status", "CONFIRMADO"),
        supabase.from("despesas_administrativas").select("*").eq("status", "CONFIRMADO"),
        supabase.from("despesas_administrativas").select("*").eq("status", "PENDENTE"),
        supabase.from("pagamentos_operador").select("tipo_pagamento, valor, data_pagamento, status").eq("status", "CONFIRMADO"),
        supabase.from("pagamentos_operador").select("tipo_pagamento, valor, data_pagamento, status").eq("status", "PENDENTE"),
        supabase.from("bookmakers").select("saldo_atual, saldo_freebet, saldo_irrecuperavel, status").in("status", ["ativo", "ATIVO", "EM_USO", "AGUARDANDO_SAQUE"]),
        supabase.from("apostas").select("lucro_prejuizo").not("resultado", "is", null),
        supabase.from("parceiros").select("id", { count: "exact", head: true }).eq("status", "ativo"),
      ]);

      if (fiatResult.error) throw fiatResult.error;
      if (cryptoResult.error) throw cryptoResult.error;
      if (despesasResult.error) throw despesasResult.error;
      if (custosResult.error) throw custosResult.error;
      if (ledgerResult.error) throw ledgerResult.error;
      if (despesasAdminResult.error) throw despesasAdminResult.error;
      if (despesasAdminPendentesResult.error) throw despesasAdminPendentesResult.error;
      if (pagamentosOpResult.error) throw pagamentosOpResult.error;
      if (pagamentosOpPendentesResult.error) throw pagamentosOpPendentesResult.error;
      if (bookmakersResult.error) throw bookmakersResult.error;

      setCaixaFiat(fiatResult.data || []);
      setCaixaCrypto(cryptoResult.data || []);
      setDespesas(despesasResult.data || []);
      setCustos(custosResult.data || []);
      setCashLedger(ledgerResult.data || []);
      setDespesasAdmin(despesasAdminResult.data || []);
      setDespesasAdminPendentes(despesasAdminPendentesResult.data || []);
      setPagamentosOperador(pagamentosOpResult.data || []);
      setPagamentosOperadorPendentes(pagamentosOpPendentesResult.data || []);
      setBookmakersSaldos(bookmakersResult.data || []);
      
      // Calcular lucro operacional das apostas
      const lucroTotal = (apostasLucroResult.data || []).reduce((acc: number, a: { lucro_prejuizo: number | null }) => 
        acc + (a.lucro_prejuizo || 0), 0);
      setLucroOperacionalApostas(lucroTotal);
      
      // Total de parceiros ativos
      setTotalParceirosAtivos(parceirosAtivosResult.count || 0);
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
  const filterByPeriod = <T extends { data_movimentacao?: string; data_inicio?: string; data_transacao?: string; data_despesa?: string; data_pagamento?: string }>(
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
  const filteredPagamentosOp = filterByPeriod(pagamentosOperador, "data_pagamento") as PagamentoOperador[];

  // Calculate KPIs
  const saldoBRL = caixaFiat.find(f => f.moeda === "BRL")?.saldo || 0;
  const saldoUSD = caixaFiat.find(f => f.moeda === "USD")?.saldo || 0;
  // Usar cotações em tempo real para crypto
  const totalCryptoUSD = caixaCrypto.reduce((acc, c) => {
    return acc + getCryptoUSDValue(c.coin, c.saldo_coin, c.saldo_usd);
  }, 0);

  // Custos de Captação - usando movimentacoes_indicacao como fonte única (pagamentos efetivos)
  // Aquisição = PAGTO_PARCEIRO + PAGTO_FORNECEDOR
  const totalCustosAquisicao = filteredDespesas
    .filter(d => d.tipo === "PAGTO_PARCEIRO" || d.tipo === "PAGTO_FORNECEDOR")
    .reduce((acc, d) => acc + d.valor, 0);
  
  // Indicação = COMISSAO_INDICADOR + BONUS_INDICADOR
  const totalComissoes = filteredDespesas.filter(d => d.tipo === "COMISSAO_INDICADOR").reduce((acc, d) => acc + d.valor, 0);
  const totalBonus = filteredDespesas.filter(d => d.tipo === "BONUS_INDICADOR").reduce((acc, d) => acc + d.valor, 0);
  const totalDespesasIndicacao = totalComissoes + totalBonus;

  // Custos orçamentários (para análise de composição, não soma no total)
  const custoIndicadores = filteredCustos.reduce((acc, c) => acc + (c.valor_indicador || 0), 0);
  const custoParceiros = filteredCustos.reduce((acc, c) => acc + (c.valor_parceiro || 0), 0);
  const custoFornecedores = filteredCustos.reduce((acc, c) => acc + (c.valor_fornecedor || 0), 0);

  // Despesas administrativas
  const totalDespesasAdmin = filteredDespesasAdmin.reduce((acc, d) => acc + d.valor, 0);

  // Pagamentos de operadores
  const totalPagamentosOperadores = filteredPagamentosOp.reduce((acc, p) => acc + p.valor, 0);

  // Custos operacionais (Aquisição + Indicação) - usando apenas pagamentos efetivos
  const totalCustosOperacionais = totalCustosAquisicao + totalDespesasIndicacao;
  
  // Despesas administrativas totais (infraestrutura + operadores)
  const totalDespesasAdminCompleto = totalDespesasAdmin + totalPagamentosOperadores;

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
  const margemLiquida = capitalOperacional - totalCustosOperacionais - totalDespesasAdminCompleto;
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
    DARF: "hsl(var(--chart-4))",
    CONTABILIDADE: "hsl(var(--chart-5))",
    OUTROS: "hsl(180 60% 50%)",
  };

  // Bar chart - comparison (usando cotacaoUSD em tempo real)
  const comparisonData = [
    { name: "Caixa FIAT", valor: saldoBRL + (saldoUSD * cotacaoUSD) },
    { name: "Caixa Crypto", valor: totalCryptoUSD * cotacaoUSD },
    { name: "Custos Operacionais", valor: totalCustosOperacionais },
    { name: "Despesas Admin.", valor: totalDespesasAdminCompleto },
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

  // ==================== DADOS PARA NOVOS COMPONENTES ====================

  // ===== SAÚDE FINANCEIRA - NOVO MODELO =====
  // Saldo total em bookmakers (capital recuperável)
  const saldoBookmakers = bookmakersSaldos.reduce((acc, b) => {
    return acc + (b.saldo_atual || 0) - (b.saldo_irrecuperavel || 0);
  }, 0);

  // Compromissos PENDENTES (ainda não pagos - representam risco futuro)
  const compromissosPendentesData = {
    despesasAdmin: despesasAdminPendentes.reduce((acc, d) => acc + d.valor, 0),
    pagamentosOperador: pagamentosOperadorPendentes.reduce((acc, p) => acc + p.valor, 0),
    total: 0,
  };
  compromissosPendentesData.total = compromissosPendentesData.despesasAdmin + compromissosPendentesData.pagamentosOperador;

  // Compromissos JÁ QUITADOS (histórico - não impactam saúde financeira)
  const compromissosQuitadosData = {
    custosOperacionais: totalCustosOperacionais,
    despesasAdmin: totalDespesasAdmin,
    pagamentosOperador: totalPagamentosOperadores,
    total: totalCustosOperacionais + totalDespesasAdmin + totalPagamentosOperadores,
  };

  // Dados consolidados para o card de saúde financeira
  const saudeFinanceiraData: SaudeFinanceiraData = {
    liquidezImediata: capitalOperacional,
    reservaEstrategica: saldoBookmakers,
    compromissosPendentes: compromissosPendentesData,
    compromissosQuitados: compromissosQuitadosData,
  };

  // Custos mensais médios (últimos 3 meses) - para referência histórica
  const custosMensaisMedia = monthlyData.slice(-3).reduce((acc, m) => 
    acc + m.custos + m.despesas + m.despesasAdmin, 0) / 3;

  // Dados para Fluxo de Caixa - SEMANAL (últimas 8 semanas)
  const getFluxoCaixaData = () => {
    const weeks: { label: string; weekStart: Date; weekEnd: Date }[] = [];
    
    // Gerar últimas 8 semanas
    for (let i = 7; i >= 0; i--) {
      const weekDate = subWeeks(new Date(), i);
      const weekStart = startOfWeek(weekDate, { weekStartsOn: 1 }); // Segunda-feira
      const weekEnd = endOfWeek(weekDate, { weekStartsOn: 1 }); // Domingo
      weeks.push({
        label: `Sem ${8 - i}`,
        weekStart,
        weekEnd,
      });
    }
    
    return weeks.map(w => {
      // Entradas = Aportes de investidores + Saques de bookmaker
      const entradasSemana = cashLedger
        .filter(l => {
          if (l.moeda !== "BRL") return false;
          if (l.tipo_transacao !== "SAQUE" && l.tipo_transacao !== "APORTE_FINANCEIRO") return false;
          const dataTransacao = parseISO(l.data_transacao);
          return isWithinInterval(dataTransacao, { start: w.weekStart, end: w.weekEnd });
        })
        .reduce((acc, l) => acc + l.valor, 0);
      
      // Saídas = Depósitos em bookmaker + Custos + Despesas
      const depositosSemana = cashLedger
        .filter(l => {
          if (l.moeda !== "BRL" || l.tipo_transacao !== "DEPOSITO") return false;
          const dataTransacao = parseISO(l.data_transacao);
          return isWithinInterval(dataTransacao, { start: w.weekStart, end: w.weekEnd });
        })
        .reduce((acc, l) => acc + l.valor, 0);
      
      const custosSemana = despesas
        .filter(d => {
          if (!d.data_movimentacao) return false;
          const dataMovimentacao = parseISO(d.data_movimentacao);
          return isWithinInterval(dataMovimentacao, { start: w.weekStart, end: w.weekEnd });
        })
        .reduce((acc, d) => acc + d.valor, 0);
      
      const despesasAdminSemana = despesasAdmin
        .filter(d => {
          if (!d.data_despesa) return false;
          const dataDespesa = parseISO(d.data_despesa);
          return isWithinInterval(dataDespesa, { start: w.weekStart, end: w.weekEnd });
        })
        .reduce((acc, d) => acc + d.valor, 0);
      
      const saidasSemana = depositosSemana + custosSemana + despesasAdminSemana;
      
      return {
        label: w.label,
        entradas: entradasSemana,
        saidas: saidasSemana,
        saldo: entradasSemana - saidasSemana,
      };
    });
  };

  const fluxoCaixaData = getFluxoCaixaData();
  const totalEntradasPeriodo = fluxoCaixaData.reduce((acc, f) => acc + f.entradas, 0);
  const totalSaidasPeriodo = fluxoCaixaData.reduce((acc, f) => acc + f.saidas, 0);

  // Composição de Custos por categoria
  const composicaoCustos = [
    { name: "Custos Aquisição", value: totalCustosAquisicao, color: "#3B82F6" },
    { name: "Comissões", value: totalComissoes, color: "#22C55E" },
    { name: "Bônus", value: totalBonus, color: "#F59E0B" },
    { name: "Infraestrutura", value: totalDespesasAdmin, color: "#8B5CF6" },
    { name: "Operadores", value: totalPagamentosOperadores, color: "#06B6D4" },
  ].filter(c => c.value > 0);

  // Total período anterior (para comparativo)
  const getMesAnteriorCustos = () => {
    const mesAnterior = subMonths(new Date(), 1);
    const keyAnterior = format(mesAnterior, "yyyy-MM");
    
    const custosAnt = despesas
      .filter(d => d.data_movimentacao && format(parseISO(d.data_movimentacao), "yyyy-MM") === keyAnterior)
      .reduce((acc, d) => acc + d.valor, 0);
    
    const despesasAdmAnt = despesasAdmin
      .filter(d => d.data_despesa && format(parseISO(d.data_despesa), "yyyy-MM") === keyAnterior)
      .reduce((acc, d) => acc + d.valor, 0);
    
    const opAnt = pagamentosOperador
      .filter(p => p.data_pagamento && format(parseISO(p.data_pagamento), "yyyy-MM") === keyAnterior)
      .reduce((acc, p) => acc + p.valor, 0);
    
    return custosAnt + despesasAdmAnt + opAnt;
  };

  const totalCustosAnterior = getMesAnteriorCustos();

  // Rentabilidade - usando lucro parceiros do resultado operacional
  const totalLucroParceiros = resultadoOperacional > 0 ? resultadoOperacional : 0;
  const diasMedioAquisicao = 60; // Média padrão de parcerias

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
              <div className="text-xs text-muted-foreground flex justify-between items-center">
                <span>CRYPTO:</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="font-medium flex items-center gap-1 hover:text-foreground transition-colors">
                      ${totalCryptoUSD.toFixed(2)} <span className="text-muted-foreground/60">({formatCurrency(totalCryptoUSD * cotacaoUSD)})</span>
                      <Info className="h-3 w-3" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72" align="end">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium">Cotações em tempo real (Binance)</p>
                        <button 
                          onClick={refreshCotacoes} 
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          disabled={loadingCotacoes}
                        >
                          <RefreshCw className={`h-3 w-3 ${loadingCotacoes ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                      {lastUpdate && (
                        <p className="text-[10px] text-muted-foreground">
                          Atualizado: {format(lastUpdate, "HH:mm:ss", { locale: ptBR })}
                        </p>
                      )}
                      <div className="space-y-1.5 pt-1 border-t border-border/50">
                        {caixaCrypto.map(c => {
                          const price = getCryptoPrice(c.coin);
                          const usdValue = getCryptoUSDValue(c.coin, c.saldo_coin, c.saldo_usd);
                          return (
                            <div key={c.coin} className="flex items-center justify-between text-xs">
                              <span className="font-mono">{c.coin}</span>
                              <div className="text-right">
                                <span className="text-muted-foreground">
                                  {c.saldo_coin.toFixed(c.saldo_coin < 1 ? 6 : 4)} × 
                                </span>
                                <span className="font-medium ml-1">
                                  ${price ? price.toFixed(price < 1 ? 6 : 2) : '—'}
                                </span>
                                <span className="text-primary ml-2">
                                  = {formatCurrency(usdValue, "USD")}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/50 mt-2 border-t border-border/30 pt-1 flex items-center justify-between">
              <span>Cotação USD/BRL: R$ {cotacaoUSD.toFixed(4)} ({source.usd})</span>
              {lastUpdate && (
                <button 
                  onClick={refreshCotacoes}
                  className="flex items-center gap-1 hover:text-foreground transition-colors"
                  disabled={loadingCotacoes}
                >
                  <RefreshCw className={`h-2.5 w-2.5 ${loadingCotacoes ? 'animate-spin' : ''}`} />
                </button>
              )}
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
              {formatCurrency(totalDespesasAdminCompleto)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Infraestrutura + Operadores
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

          {/* NOVOS COMPONENTES - Grid Principal */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Saúde Financeira */}
            <SaudeFinanceiraCard
              saudeData={saudeFinanceiraData}
              formatCurrency={formatCurrency}
            />

            {/* Rentabilidade da Captação */}
            <RentabilidadeCaptacaoCard
              totalLucroParceiros={totalLucroParceiros}
              totalCustosAquisicao={totalCustosOperacionais}
              totalParceirosAtivos={totalParceirosAtivos}
              diasMedioAquisicao={diasMedioAquisicao}
              lucroOperacional={lucroOperacionalApostas}
              formatCurrency={formatCurrency}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Fluxo de Caixa Semanal */}
            <FluxoCaixaCard
              fluxoSemanal={fluxoCaixaData}
              totalEntradas={totalEntradasPeriodo}
              totalSaidas={totalSaidasPeriodo}
              formatCurrency={formatCurrency}
            />

            {/* Composição de Custos */}
            <ComposicaoCustosCard
              categorias={composicaoCustos}
              totalAtual={totalCustosOperacionais + totalDespesasAdminCompleto}
              totalAnterior={totalCustosAnterior}
              formatCurrency={formatCurrency}
            />
          </div>

          {/* Summary Cards - Links Rápidos */}
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
                    <span>Subtotal Infraestrutura</span>
                    <span className="text-orange-500">{formatCurrency(totalDespesasAdmin)}</span>
                  </div>
                )}
                <div className="pt-3 border-t flex items-center justify-between font-semibold">
                  <span>Operadores</span>
                  <span className="text-blue-500">{formatCurrency(totalPagamentosOperadores)}</span>
                </div>
                <div className="pt-3 border-t flex items-center justify-between font-bold text-lg">
                  <span>Total Geral</span>
                  <span className="text-orange-500">{formatCurrency(totalDespesasAdminCompleto)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Histórico de Transações */}
          <HistoricoDespesasAdmin formatCurrency={formatCurrency} />
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
                  {formatCurrency(totalDespesasAdminCompleto)}
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

            <Card className={resultadoOperacional - totalCustosAquisicao - totalDespesasIndicacao - totalDespesasAdminCompleto >= 0 ? "border-success/30" : "border-destructive/30"}>
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
                <div className={`text-xl font-bold ${resultadoOperacional - totalCustosAquisicao - totalDespesasIndicacao - totalDespesasAdminCompleto >= 0 ? "text-success" : "text-destructive"}`}>
                  {formatCurrency(resultadoOperacional - totalCustosAquisicao - totalDespesasIndicacao - totalDespesasAdminCompleto)}
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
