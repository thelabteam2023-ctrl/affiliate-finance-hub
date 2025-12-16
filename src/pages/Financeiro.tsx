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
  Loader2,
  BarChart3,
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
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ComposedChart,
  Line,
  Bar,
} from "recharts";
import { format, parseISO, subMonths, subWeeks, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, getWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { KpiExplanationDialog, KpiType } from "@/components/financeiro/KpiExplanationDialog";
import { DespesaAdministrativaDialog } from "@/components/financeiro/DespesaAdministrativaDialog";
import { SaudeFinanceiraCard } from "@/components/financeiro/SaudeFinanceiraCard";
import { RentabilidadeCaptacaoCard } from "@/components/financeiro/RentabilidadeCaptacaoCard";
import { HistoricoDespesasAdmin } from "@/components/financeiro/HistoricoDespesasAdmin";
import { ComposicaoCustosCard } from "@/components/financeiro/ComposicaoCustosCard";
// Novos cards CFO
import { FluxoCaixaRealCard, FluxoCaixaRealData } from "@/components/financeiro/FluxoCaixaRealCard";
import { MovimentacaoCapitalCard } from "@/components/financeiro/MovimentacaoCapitalCard";
import { CustoSustentacaoCard } from "@/components/financeiro/CustoSustentacaoCard";
import { BurnRateCard } from "@/components/financeiro/BurnRateCard";
import { RunwayCard } from "@/components/financeiro/RunwayCard";
import { EquilibrioOperacionalCard } from "@/components/financeiro/EquilibrioOperacionalCard";
import { EficienciaCapitalCard } from "@/components/financeiro/EficienciaCapitalCard";
import { MapaPatrimonioCard } from "@/components/financeiro/MapaPatrimonioCard";

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
    pagamentosParcerias: number;
    comissoesIndicador: number;
    bonusIndicador: number;
    total: number;
  };
  compromissosQuitados: {
    custosOperacionais: number;
    despesasAdmin: number;
    pagamentosOperador: number;
    total: number;
  };
}

interface ContaParceiro {
  saldo: number;
}

interface WalletParceiro {
  saldo_usd: number;
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
  const [movimentacoesIndicacao, setMovimentacoesIndicacao] = useState<DespesaIndicacao[]>([]);
  const [bookmakersSaldos, setBookmakersSaldos] = useState<BookmakerSaldo[]>([]);
  const [lucroOperacionalApostas, setLucroOperacionalApostas] = useState<number>(0);
  const [totalParceirosAtivos, setTotalParceirosAtivos] = useState<number>(0);
  const [contasParceiros, setContasParceiros] = useState<ContaParceiro[]>([]);
  const [walletsParceiros, setWalletsParceiros] = useState<WalletParceiro[]>([]);
  
  // Estados para compromissos pendentes de parcerias
  const [parceirosPendentes, setParceirosPendentes] = useState<{ valorTotal: number; count: number }>({ valorTotal: 0, count: 0 });
  const [comissoesPendentes, setComissoesPendentes] = useState<{ valorTotal: number; count: number }>({ valorTotal: 0, count: 0 });
  const [bonusPendentes, setBonusPendentes] = useState<{ valorTotal: number; count: number }>({ valorTotal: 0, count: 0 });
  
  // Hook centralizado de cotações
  const cryptoSymbols = useMemo(() => caixaCrypto.map(c => c.coin), [caixaCrypto]);
  const { cotacaoUSD, getCryptoUSDValue, getCryptoPrice, refreshAll: refreshCotacoes, loading: loadingCotacoes, lastUpdate, source } = useCotacoes(cryptoSymbols);

  // Filtros de período
  const [periodoPreset, setPeriodoPreset] = useState<string>("1m");
  const [dataInicio, setDataInicio] = useState<string>("");
  const [dataFim, setDataFim] = useState<string>("");

  // Dialog states
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false);
  const [kpiType, setKpiType] = useState<KpiType>(null);
  const [despesaAdminDialogOpen, setDespesaAdminDialogOpen] = useState(false);
  const [editingDespesa, setEditingDespesa] = useState<DespesaAdministrativa | null>(null);

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
        movIndicacaoResult,
        bookmakersResult,
        apostasLucroResult,
        parceirosAtivosResult,
        parceriasParceiroResult,
        parceriasComissaoResult,
        acordosIndicadorResult,
        contasParceirosResult,
        walletsParceirosResult,
      ] = await Promise.all([
        supabase.from("v_saldo_caixa_fiat").select("*"),
        supabase.from("v_saldo_caixa_crypto").select("*"),
        supabase.from("movimentacoes_indicacao").select("tipo, valor, data_movimentacao, parceria_id, indicador_id").eq("status", "CONFIRMADO"),
        supabase.from("v_custos_aquisicao").select("custo_total, valor_indicador, valor_parceiro, valor_fornecedor, data_inicio, indicador_id, indicador_nome"),
        supabase.from("cash_ledger").select("tipo_transacao, valor, data_transacao, moeda").eq("status", "CONFIRMADO"),
        supabase.from("despesas_administrativas").select("*").eq("status", "CONFIRMADO"),
        supabase.from("despesas_administrativas").select("*").eq("status", "PENDENTE"),
        supabase.from("pagamentos_operador").select("tipo_pagamento, valor, data_pagamento, status").eq("status", "CONFIRMADO"),
        supabase.from("pagamentos_operador").select("tipo_pagamento, valor, data_pagamento, status").eq("status", "PENDENTE"),
        supabase.from("movimentacoes_indicacao").select("tipo, valor, data_movimentacao, parceria_id, indicador_id"),
        supabase.from("bookmakers").select("saldo_atual, saldo_freebet, saldo_irrecuperavel, status").in("status", ["ativo", "ATIVO", "EM_USO", "AGUARDANDO_SAQUE"]),
        supabase.from("apostas").select("lucro_prejuizo").not("resultado", "is", null),
        supabase.from("parceiros").select("id", { count: "exact", head: true }).eq("status", "ativo"),
        supabase
          .from("parcerias")
          .select("id, valor_parceiro, origem_tipo, status, custo_aquisicao_isento")
          .in("status", ["ATIVA", "EM_ENCERRAMENTO"])
          .or("custo_aquisicao_isento.is.null,custo_aquisicao_isento.eq.false")
          .gt("valor_parceiro", 0),
        supabase
          .from("parcerias")
          .select("id, valor_comissao_indicador, comissao_paga")
          .eq("comissao_paga", false)
          .not("valor_comissao_indicador", "is", null)
          .gt("valor_comissao_indicador", 0),
        supabase
          .from("indicador_acordos")
          .select("indicador_id, meta_parceiros, valor_bonus")
          .eq("ativo", true),
        supabase.from("v_saldo_parceiro_contas").select("saldo"),
        supabase.from("v_saldo_parceiro_wallets").select("saldo_usd"),
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
      if (movIndicacaoResult.error) throw movIndicacaoResult.error;
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
      setMovimentacoesIndicacao(movIndicacaoResult.data || []);
      setBookmakersSaldos(bookmakersResult.data || []);
      setContasParceiros(contasParceirosResult.data || []);
      setWalletsParceiros(walletsParceirosResult.data || []);
      
      // Calcular lucro operacional das apostas
      const lucroTotal = (apostasLucroResult.data || []).reduce((acc: number, a: { lucro_prejuizo: number | null }) => 
        acc + (a.lucro_prejuizo || 0), 0);
      setLucroOperacionalApostas(lucroTotal);
      
      // Total de parceiros ativos
      setTotalParceirosAtivos(parceirosAtivosResult.count || 0);
      
      // ========== CÁLCULO DE COMPROMISSOS PENDENTES DE PARCERIAS ==========
      const allMovimentacoes = movIndicacaoResult.data || [];
      
      // 1. Parceiros pendentes
      const parceriasPagas = allMovimentacoes
        .filter((m: any) => m.tipo === "PAGTO_PARCEIRO" && m.parceria_id)
        .map((m: any) => m.parceria_id);
      const parceirosPendentesCalc = (parceriasParceiroResult.data || [])
        .filter((p: any) => !parceriasPagas.includes(p.id));
      const valorParceirosPendentes = parceirosPendentesCalc.reduce((acc: number, p: any) => acc + (p.valor_parceiro || 0), 0);
      setParceirosPendentes({ valorTotal: valorParceirosPendentes, count: parceirosPendentesCalc.length });
      
      // 2. Comissões pendentes
      const comissoesPendentesCalc = parceriasComissaoResult.data || [];
      const valorComissoesPendentes = comissoesPendentesCalc.reduce((acc: number, p: any) => acc + (p.valor_comissao_indicador || 0), 0);
      setComissoesPendentes({ valorTotal: valorComissoesPendentes, count: comissoesPendentesCalc.length });
      
      // 3. Bônus pendentes
      const custosData = custosResult.data || [];
      const acordosData = acordosIndicadorResult.data || [];
      
      const indicadorStats: Record<string, number> = {};
      custosData.forEach((c: any) => {
        if (c.indicador_id) {
          indicadorStats[c.indicador_id] = (indicadorStats[c.indicador_id] || 0) + 1;
        }
      });
      
      const bonusPagosPorIndicador: Record<string, number> = {};
      allMovimentacoes
        .filter((m: any) => m.tipo === "BONUS_INDICADOR" && m.indicador_id)
        .forEach((m: any) => {
          bonusPagosPorIndicador[m.indicador_id] = (bonusPagosPorIndicador[m.indicador_id] || 0) + 1;
        });
      
      let totalBonusPendente = 0;
      let countBonusPendente = 0;
      acordosData.forEach((acordo: any) => {
        const qtdParceiros = indicadorStats[acordo.indicador_id] || 0;
        if (acordo.meta_parceiros && acordo.meta_parceiros > 0) {
          const ciclosCompletos = Math.floor(qtdParceiros / acordo.meta_parceiros);
          const bonusJaPagos = bonusPagosPorIndicador[acordo.indicador_id] || 0;
          const ciclosPendentes = ciclosCompletos - bonusJaPagos;
          if (ciclosPendentes > 0) {
            totalBonusPendente += (acordo.valor_bonus || 0) * ciclosPendentes;
            countBonusPendente += ciclosPendentes;
          }
        }
      });
      setBonusPendentes({ valorTotal: totalBonusPendente, count: countBonusPendente });
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

  // ==================== CÁLCULOS CORRIGIDOS ====================
  
  // Saldos base
  const saldoBRL = caixaFiat.find(f => f.moeda === "BRL")?.saldo || 0;
  const saldoUSD = caixaFiat.find(f => f.moeda === "USD")?.saldo || 0;
  const totalCryptoUSD = caixaCrypto.reduce((acc, c) => {
    return acc + getCryptoUSDValue(c.coin, c.saldo_coin, c.saldo_usd);
  }, 0);

  // Capital Operacional (Caixa = BRL + USD + Crypto convertidos)
  const capitalOperacional = saldoBRL + (saldoUSD * cotacaoUSD) + (totalCryptoUSD * cotacaoUSD);

  // Saldo em Bookmakers (capital em operação)
  const saldoBookmakers = bookmakersSaldos.reduce((acc, b) => {
    return acc + (b.saldo_atual || 0) - (b.saldo_irrecuperavel || 0);
  }, 0);

  // Saldos em contas de parceiros e wallets
  const totalContasParceiros = contasParceiros.reduce((acc, c) => acc + (c.saldo || 0), 0);
  const totalWalletsParceiros = walletsParceiros.reduce((acc, w) => acc + ((w.saldo_usd || 0) * cotacaoUSD), 0);

  // ==================== CUSTOS REAIS (impactam P&L) ====================
  
  // Custos de Aquisição = PAGTO_PARCEIRO + PAGTO_FORNECEDOR
  const totalCustosAquisicao = filteredDespesas
    .filter(d => d.tipo === "PAGTO_PARCEIRO" || d.tipo === "PAGTO_FORNECEDOR")
    .reduce((acc, d) => acc + d.valor, 0);
  
  // Custos de Indicação = COMISSAO_INDICADOR + BONUS_INDICADOR
  const totalComissoes = filteredDespesas.filter(d => d.tipo === "COMISSAO_INDICADOR").reduce((acc, d) => acc + d.valor, 0);
  const totalBonus = filteredDespesas.filter(d => d.tipo === "BONUS_INDICADOR").reduce((acc, d) => acc + d.valor, 0);
  const totalDespesasIndicacao = totalComissoes + totalBonus;

  // Custos Operacionais Totais (Aquisição + Indicação)
  const totalCustosOperacionais = totalCustosAquisicao + totalDespesasIndicacao;
  
  // Despesas administrativas
  const totalDespesasAdmin = filteredDespesasAdmin.reduce((acc, d) => acc + d.valor, 0);

  // Pagamentos de operadores
  const totalPagamentosOperadores = filteredPagamentosOp.reduce((acc, p) => acc + p.valor, 0);

  // ==================== FLUXO DE CAIXA REAL (CORRIGIDO) ====================
  // Separa MOVIMENTAÇÃO DE CAPITAL (depósitos/saques bookmakers) de FLUXO REAL
  
  const getFluxoCaixaRealData = (): FluxoCaixaRealData[] => {
    const weeks: { label: string; weekStart: Date; weekEnd: Date }[] = [];
    
    for (let i = 7; i >= 0; i--) {
      const weekDate = subWeeks(new Date(), i);
      const weekStart = startOfWeek(weekDate, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(weekDate, { weekStartsOn: 1 });
      const weekNumber = getWeek(weekStart, { weekStartsOn: 1 });
      weeks.push({
        label: `Sem ${weekNumber}`,
        weekStart,
        weekEnd,
      });
    }
    
    return weeks.map(w => {
      // ENTRADAS REAIS: Aportes de investidores, receitas (saques de bookmaker representam lucro realizado)
      const entradasReais = cashLedger
        .filter(l => {
          if (l.moeda !== "BRL") return false;
          // Entradas reais: APORTE_FINANCEIRO e SAQUE (lucro realizado)
          if (l.tipo_transacao !== "APORTE_FINANCEIRO" && l.tipo_transacao !== "SAQUE") return false;
          const dataTransacao = parseISO(l.data_transacao);
          return isWithinInterval(dataTransacao, { start: w.weekStart, end: w.weekEnd });
        })
        .reduce((acc, l) => acc + l.valor, 0);
      
      // SAÍDAS REAIS: Custos operacionais + Despesas admin + Pagamentos
      // NÃO inclui depósitos em bookmakers (realocação patrimonial)
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

      const pagamentosOpSemana = pagamentosOperador
        .filter(p => {
          if (!p.data_pagamento) return false;
          const dataPagamento = parseISO(p.data_pagamento);
          return isWithinInterval(dataPagamento, { start: w.weekStart, end: w.weekEnd });
        })
        .reduce((acc, p) => acc + p.valor, 0);
      
      const saidasReais = custosSemana + despesasAdminSemana + pagamentosOpSemana;
      
      return {
        label: w.label,
        entradas: entradasReais,
        saidas: saidasReais,
        saldo: entradasReais - saidasReais,
      };
    });
  };

  const fluxoCaixaRealData = getFluxoCaixaRealData();
  const totalEntradasReais = fluxoCaixaRealData.reduce((acc, f) => acc + f.entradas, 0);
  const totalSaidasReais = fluxoCaixaRealData.reduce((acc, f) => acc + f.saidas, 0);

  // ==================== MOVIMENTAÇÃO DE CAPITAL (separado) ====================
  
  // Depósitos em bookmakers no período (realocação, não custo)
  const depositosBookmakersPeriodo = filteredLedger
    .filter(l => l.moeda === "BRL" && l.tipo_transacao === "DEPOSITO")
    .reduce((acc, l) => acc + l.valor, 0);

  // Saques de bookmakers no período
  const saquesBookmakersPeriodo = filteredLedger
    .filter(l => l.moeda === "BRL" && l.tipo_transacao === "SAQUE")
    .reduce((acc, l) => acc + l.valor, 0);

  // ==================== MÉTRICAS CFO ====================
  
  // Custo de Sustentação = Custos Operacionais + Despesas Admin + Operadores
  const custoSustentacao = totalCustosOperacionais + totalDespesasAdmin + totalPagamentosOperadores;

  // Burn Rate (baseado em período de 1 mês = período filtrado padrão)
  const burnRateMensal = totalSaidasReais;
  const burnRateSemanal = burnRateMensal / 4;

  // Entradas mensais (aportes + saques realizados)
  const entradasMensais = totalEntradasReais;

  // Liquidez Imediata = Capital Operacional (caixa disponível agora)
  const liquidezImediata = capitalOperacional;

  // ==================== COMPOSIÇÃO DE CUSTOS ====================
  
  const composicaoCustos = [
    { name: "Custos Aquisição", value: totalCustosAquisicao, color: "#3B82F6" },
    { name: "Comissões", value: totalComissoes, color: "#22C55E" },
    { name: "Bônus", value: totalBonus, color: "#F59E0B" },
    { name: "Infraestrutura", value: totalDespesasAdmin, color: "#8B5CF6" },
    { name: "Operadores", value: totalPagamentosOperadores, color: "#06B6D4" },
  ].filter(c => c.value > 0);

  // Total período anterior
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

  // ==================== SAÚDE FINANCEIRA ====================
  
  const compromissosPendentesData = {
    despesasAdmin: despesasAdminPendentes.reduce((acc, d) => acc + d.valor, 0),
    pagamentosOperador: pagamentosOperadorPendentes.reduce((acc, p) => acc + p.valor, 0),
    pagamentosParcerias: parceirosPendentes.valorTotal,
    comissoesIndicador: comissoesPendentes.valorTotal,
    bonusIndicador: bonusPendentes.valorTotal,
    total: 0,
  };
  compromissosPendentesData.total = 
    compromissosPendentesData.despesasAdmin + 
    compromissosPendentesData.pagamentosOperador + 
    compromissosPendentesData.pagamentosParcerias + 
    compromissosPendentesData.comissoesIndicador + 
    compromissosPendentesData.bonusIndicador;

  const compromissosQuitadosData = {
    custosOperacionais: totalCustosOperacionais,
    despesasAdmin: totalDespesasAdmin,
    pagamentosOperador: totalPagamentosOperadores,
    total: totalCustosOperacionais + totalDespesasAdmin + totalPagamentosOperadores,
  };

  const saudeFinanceiraData: SaudeFinanceiraData = {
    liquidezImediata: capitalOperacional,
    reservaEstrategica: saldoBookmakers,
    compromissosPendentes: compromissosPendentesData,
    compromissosQuitados: compromissosQuitadosData,
  };

  // ==================== RENTABILIDADE ====================
  
  const totalLucroParceiros = lucroOperacionalApostas > 0 ? lucroOperacionalApostas : 0;
  
  // Calcular dias médio de operação dinamicamente
  const diasMedioAquisicao = useMemo(() => {
    if (custos.length === 0) return 30; // fallback mínimo
    
    const hoje = new Date();
    const diasPorParceria = custos
      .filter(c => c.data_inicio)
      .map(c => {
        const dataInicio = parseISO(c.data_inicio);
        const diffMs = hoje.getTime() - dataInicio.getTime();
        return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      });
    
    if (diasPorParceria.length === 0) return 30;
    
    const media = diasPorParceria.reduce((acc, d) => acc + d, 0) / diasPorParceria.length;
    return Math.max(30, Math.round(media)); // mínimo 30 dias
  }, [custos]);
  // ==================== HISTÓRICO MENSAL ====================
  
  const getHistoricoMensal = () => {
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

    let patrimonioAcumulado = 0;
    const monthsArray = Object.values(months);
    monthsArray.forEach((m, index) => {
      patrimonioAcumulado += m.resultado - m.custos - m.despesas - m.despesasAdmin;
      monthsArray[index].patrimonio = patrimonioAcumulado;
    });

    return monthsArray.map(m => ({
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
        <h1 className="text-3xl font-bold tracking-tight">Dashboard CFO</h1>
        <p className="text-muted-foreground">
          Visão financeira estratégica: Liquidez, Custos e Sustentabilidade
        </p>
      </div>

      {/* Filtros de Período */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={periodoPreset} onValueChange={setPeriodoPreset}>
          <SelectTrigger className="w-[190px] flex items-center">
            <Calendar className="h-4 w-4 mr-2 shrink-0" />
            <SelectValue placeholder="Período" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1m">Último mês</SelectItem>
            <SelectItem value="3m">3 meses</SelectItem>
            <SelectItem value="6m">6 meses</SelectItem>
            <SelectItem value="12m">12 meses</SelectItem>
            <SelectItem value="all">Todo período</SelectItem>
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

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Visão CFO
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
          {/* LINHA 1: Métricas Críticas - Runway e Equilíbrio */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <RunwayCard
              liquidezImediata={liquidezImediata}
              burnRateMensal={burnRateMensal}
              formatCurrency={formatCurrency}
            />
            <EquilibrioOperacionalCard
              lucroOperacional={lucroOperacionalApostas}
              custoSustentacao={custoSustentacao}
              formatCurrency={formatCurrency}
            />
            <EficienciaCapitalCard
              lucroOperacional={lucroOperacionalApostas}
              capitalEmBookmakers={saldoBookmakers}
              formatCurrency={formatCurrency}
            />
          </div>

          {/* LINHA 2: Fluxo de Caixa Real vs Movimentação de Capital */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <FluxoCaixaRealCard
              fluxoData={fluxoCaixaRealData}
              totalEntradas={totalEntradasReais}
              totalSaidas={totalSaidasReais}
              formatCurrency={formatCurrency}
            />
            <MovimentacaoCapitalCard
              depositosBookmakers={depositosBookmakersPeriodo}
              saquesBookmakers={saquesBookmakersPeriodo}
              capitalEmOperacao={saldoBookmakers}
              formatCurrency={formatCurrency}
            />
          </div>

          {/* LINHA 3: Custos e Burn Rate */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CustoSustentacaoCard
              custosOperacionais={totalCustosOperacionais}
              despesasAdministrativas={totalDespesasAdmin}
              pagamentosOperadores={totalPagamentosOperadores}
              formatCurrency={formatCurrency}
            />
            <BurnRateCard
              burnRateMensal={burnRateMensal}
              burnRateSemanal={burnRateSemanal}
              entradasMensais={entradasMensais}
              formatCurrency={formatCurrency}
            />
          </div>

          {/* LINHA 4: Patrimônio e Composição */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MapaPatrimonioCard
              caixaOperacional={capitalOperacional}
              saldoBookmakers={saldoBookmakers}
              contasParceiros={totalContasParceiros}
              walletsCrypto={totalWalletsParceiros}
              formatCurrency={formatCurrency}
            />
            <ComposicaoCustosCard
              categorias={composicaoCustos}
              totalAtual={custoSustentacao}
              totalAnterior={totalCustosAnterior}
              formatCurrency={formatCurrency}
            />
          </div>

          {/* LINHA 5: Saúde Financeira e Rentabilidade (cards existentes, menor destaque) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <SaudeFinanceiraCard
              saudeData={saudeFinanceiraData}
              formatCurrency={formatCurrency}
            />
            <RentabilidadeCaptacaoCard
              totalLucroParceiros={totalLucroParceiros}
              totalCustosAquisicao={totalCustosOperacionais}
              totalParceirosAtivos={totalParceirosAtivos}
              diasMedioAquisicao={diasMedioAquisicao}
              lucroOperacional={lucroOperacionalApostas}
              formatCurrency={formatCurrency}
            />
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
                  <span className="text-orange-500">{formatCurrency(totalDespesasAdmin + totalPagamentosOperadores)}</span>
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

          {/* Tabela Histórica */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalhamento Mensal</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-3 px-4 font-medium">Mês</th>
                      <th className="text-right py-3 px-4 font-medium">Resultado</th>
                      <th className="text-right py-3 px-4 font-medium">Custos</th>
                      <th className="text-right py-3 px-4 font-medium">Despesas</th>
                      <th className="text-right py-3 px-4 font-medium">Lucro Líq.</th>
                      <th className="text-right py-3 px-4 font-medium">Patrimônio Acum.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicoMensal.map((m) => (
                      <tr key={m.mes} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-3 px-4 font-medium">{m.label}</td>
                        <td className={`py-3 px-4 text-right ${m.resultado >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(m.resultado)}
                        </td>
                        <td className="py-3 px-4 text-right text-destructive">{formatCurrency(m.custos)}</td>
                        <td className="py-3 px-4 text-right text-muted-foreground">{formatCurrency(m.despesas + m.despesasAdmin)}</td>
                        <td className={`py-3 px-4 text-right font-medium ${m.lucroLiquido >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(m.lucroLiquido)}
                        </td>
                        <td className={`py-3 px-4 text-right font-semibold ${m.patrimonio >= 0 ? 'text-primary' : 'text-destructive'}`}>
                          {formatCurrency(m.patrimonio)}
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
        onOpenChange={setDespesaAdminDialogOpen}
        despesa={editingDespesa}
        onSuccess={fetchData}
      />
    </div>
  );
}
