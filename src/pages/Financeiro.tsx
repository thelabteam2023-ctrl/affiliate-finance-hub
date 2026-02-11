import { useEffect, useState, useMemo, useCallback } from "react";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { useWorkspaceChangeListener } from "@/hooks/useWorkspaceCacheClear";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCotacoes } from "@/hooks/useCotacoes";
import { useCurrencySnapshot } from "@/hooks/useCurrencySnapshot";
import { useWorkspaceLucroOperacional } from "@/hooks/useWorkspaceLucroOperacional";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardPeriodFilterBar } from "@/components/shared/DashboardPeriodFilterBar";
import { DashboardPeriodFilter, getDashboardDateRangeAsStrings } from "@/types/dashboardFilters";
import { PageHeader } from "@/components/PageHeader";
import {
  Loader2,
  BarChart3,
  History,
  Plus,
  Building2,
  Edit,
  Trash2,
  ArrowUpDown,
  Users,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ComposedChart,
  Line,
  Bar,
} from "recharts";
import { format, subMonths, subWeeks, startOfMonth, endOfMonth, startOfWeek, endOfWeek, isWithinInterval, getWeek } from "date-fns";
import { parseLocalDate } from "@/lib/dateUtils";
import { getGrupoInfo } from "@/lib/despesaGrupos";
import { ptBR } from "date-fns/locale";
import { KpiExplanationDialog, KpiType } from "@/components/financeiro/KpiExplanationDialog";
import { DespesaAdministrativaDialog } from "@/components/financeiro/DespesaAdministrativaDialog";
import { RentabilidadeCaptacaoCard } from "@/components/financeiro/RentabilidadeCaptacaoCard";
import { HistoricoDespesasAdmin } from "@/components/financeiro/HistoricoDespesasAdmin";
import { 
  ComposicaoCustosCard,
  CustoAquisicaoDetalhe,
  ComissaoDetalhe,
  BonusDetalhe,
  InfraestruturaDetalhe,
  OperadorDetalhe,
} from "@/components/financeiro/ComposicaoCustosCard";
import { MovimentacaoCapitalCard } from "@/components/financeiro/MovimentacaoCapitalCard";
import { CustoSustentacaoCard } from "@/components/financeiro/CustoSustentacaoCard";
import { EquilibrioOperacionalCard } from "@/components/financeiro/EquilibrioOperacionalCard";
import { EficienciaCapitalCard } from "@/components/financeiro/EficienciaCapitalCard";
import { 
  MapaPatrimonioCard, 
  BookmakerPorProjeto, 
  ContaPorBanco, 
  WalletPorExchange, 
  CaixaDetalhe 
} from "@/components/financeiro/MapaPatrimonioCard";
import { ParticipacaoInvestidoresTab } from "@/components/financeiro/ParticipacaoInvestidoresTab";
import { MultiCurrencyWarningBanner } from "@/components/financeiro/MultiCurrencyIndicator";

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
  indicador_id?: string;
  indicadores_referral?: { nome: string } | null;
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
  grupo?: string;
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
  operador_id?: string;
  operadores?: { nome: string } | null;
}

// Interface simplificada para histórico mensal (não precisa de todos os campos)
interface ApostaHistorico {
  lucro_prejuizo: number | null;
  data_aposta: string;
}

interface BookmakerSaldo {
  saldo_atual: number;
  saldo_freebet: number;
  saldo_irrecuperavel: number;
  status: string;
  projeto_id: string | null;
  moeda: string;
}

interface BookmakerDetalhado {
  saldo_atual: number;
  saldo_irrecuperavel: number;
  projeto_id: string | null;
  projetos?: { nome: string } | null;
  moeda: string;
}

interface ContaDetalhada {
  saldo: number;
  banco: string;
  parceiro_nome: string;
  moeda: string;
}

interface WalletDetalhada {
  saldo_usd: number;
  exchange: string;
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
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  // SEGURANÇA: workspaceId como dependência para isolamento multi-tenant
  const { workspaceId } = useTabWorkspace();
  
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
  const [bookmakersDetalhados, setBookmakersDetalhados] = useState<BookmakerDetalhado[]>([]);
  const [apostasHistorico, setApostasHistorico] = useState<ApostaHistorico[]>([]);
  const [totalParceirosAtivos, setTotalParceirosAtivos] = useState<number>(0);
  const [contasParceiros, setContasParceiros] = useState<ContaParceiro[]>([]);
  const [contasDetalhadas, setContasDetalhadas] = useState<ContaDetalhada[]>([]);
  const [walletsParceiros, setWalletsParceiros] = useState<WalletParceiro[]>([]);
  const [walletsDetalhadas, setWalletsDetalhadas] = useState<WalletDetalhada[]>([]);
  const [participacoesPagas, setParticipacoesPagas] = useState<{ valor_participacao: number; data_pagamento: string }[]>([]);
  
  // Estados para compromissos pendentes de parcerias
  const [parceirosPendentes, setParceirosPendentes] = useState<{ valorTotal: number; count: number }>({ valorTotal: 0, count: 0 });
  const [comissoesPendentes, setComissoesPendentes] = useState<{ valorTotal: number; count: number }>({ valorTotal: 0, count: 0 });
  const [bonusPendentes, setBonusPendentes] = useState<{ valorTotal: number; count: number }>({ valorTotal: 0, count: 0 });
  
  // Hook centralizado de cotações
  const cryptoSymbols = useMemo(() => caixaCrypto.map(c => c.coin), [caixaCrypto]);
  const { cotacaoUSD, getCryptoUSDValue, getCryptoPrice, refreshAll: refreshCotacoes, loading: loadingCotacoes, lastUpdate, source } = useCotacoes(cryptoSymbols);
  
  // Hook para conversão de moedas (usa a API centralizada)
  const { convertFromBRL } = useCurrencySnapshot({ cryptoSymbols });

  // Filtro de período unificado (padrão: mês atual)
  const [periodoPreset, setPeriodoPreset] = useState<DashboardPeriodFilter>("mes");
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | undefined>(undefined);
  
  // Datas derivadas do filtro selecionado
  const { dataInicio, dataFim } = useMemo(
    () => getDashboardDateRangeAsStrings(periodoPreset, customRange),
    [periodoPreset, customRange]
  );

  // ==================== FONTE ÚNICA DE VERDADE: LUCRO OPERACIONAL ====================
  // Hook centralizado que consolida: apostas + cashback + giros grátis (e futuros módulos)
  const { 
    resultado: lucroOperacionalData, 
    loading: loadingLucroOperacional,
    refresh: refreshLucroOperacional 
  } = useWorkspaceLucroOperacional({
    dataInicio: dataInicio || null,
    dataFim: dataFim || null,
    cotacaoUSD,
  });

  // Valores derivados do hook centralizado
  const lucroOperacionalApostas = lucroOperacionalData?.lucroTotal ?? 0;
  const hasMultiCurrencyApostas = lucroOperacionalData?.hasMultiCurrency ?? false;


  // Dialog states
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false);
  const [kpiType, setKpiType] = useState<KpiType>(null);
  const [despesaAdminDialogOpen, setDespesaAdminDialogOpen] = useState(false);
  const [editingDespesa, setEditingDespesa] = useState<DespesaAdministrativa | null>(null);

  // Ordenação do histórico mensal
  const [historicoSort, setHistoricoSort] = useState<{ field: "mes" | "lucroLiquido" | "patrimonio"; direction: "asc" | "desc" }>({ field: "mes", direction: "desc" });

  // Parâmetros da URL para filtro e aba inicial
  const tabFromUrl = searchParams.get("tab");
  const investidorFiltroId = searchParams.get("investidor");

  // SEGURANÇA: Refetch quando workspace muda
  useEffect(() => {
    if (workspaceId) {
      checkAuth();
    }
  }, [workspaceId]);

  // Listener para reset de estados locais na troca de workspace
  useWorkspaceChangeListener(useCallback(() => {
    console.log("[Financeiro] Workspace changed - resetting local state");
    setCaixaFiat([]);
    setCaixaCrypto([]);
    setDespesas([]);
    setCustos([]);
    setCashLedger([]);
    setDespesasAdmin([]);
    setDespesasAdminPendentes([]);
    setPagamentosOperador([]);
    setPagamentosOperadorPendentes([]);
    setMovimentacoesIndicacao([]);
    setBookmakersSaldos([]);
    setBookmakersDetalhados([]);
    setApostasHistorico([]);
    setContasParceiros([]);
    setContasDetalhadas([]);
    setWalletsParceiros([]);
    setWalletsDetalhadas([]);
    setLoading(true);
  }, []));

  // Datas derivadas automaticamente do periodoPreset via useMemo - sem necessidade de useEffect

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
        bookmakersDetalhadosResult,
        parceirosAtivosResult,
        parceriasParceiroResult,
        parceriasComissaoResult,
        acordosIndicadorResult,
        contasParceirosResult,
        walletsParceirosResult,
        contasDetalhadasResult,
        walletsDetalhadasResult,
        participacoesResult,
        // Para histórico mensal - fetch simplificado
        apostasHistoricoResult,
      ] = await Promise.all([
        supabase.from("v_saldo_caixa_fiat").select("*"),
        supabase.from("v_saldo_caixa_crypto").select("*"),
        supabase.from("movimentacoes_indicacao").select("tipo, valor, data_movimentacao, parceria_id, indicador_id, indicadores_referral(nome)").eq("status", "CONFIRMADO"),
        supabase.from("v_custos_aquisicao").select("custo_total, valor_indicador, valor_parceiro, valor_fornecedor, data_inicio, indicador_id, indicador_nome"),
        supabase.from("cash_ledger").select("tipo_transacao, valor, data_transacao, moeda").eq("status", "CONFIRMADO"),
        supabase.from("despesas_administrativas").select("*").eq("status", "CONFIRMADO"),
        supabase.from("despesas_administrativas").select("*").eq("status", "PENDENTE"),
        supabase.from("pagamentos_operador").select("tipo_pagamento, valor, data_pagamento, status, operador_id, operadores(nome)").eq("status", "CONFIRMADO"),
        supabase.from("pagamentos_operador").select("tipo_pagamento, valor, data_pagamento, status, operador_id, operadores(nome)").eq("status", "PENDENTE"),
        supabase.from("movimentacoes_indicacao").select("tipo, valor, data_movimentacao, parceria_id, indicador_id, indicadores_referral(nome)"),
        supabase.from("bookmakers").select("saldo_atual, saldo_freebet, saldo_irrecuperavel, status, estado_conta, aguardando_saque_at, projeto_id, moeda").in("status", ["ativo", "ATIVO", "EM_USO", "limitada", "LIMITADA"]),
        supabase.from("bookmakers").select("saldo_atual, saldo_irrecuperavel, projeto_id, moeda, projetos(nome)").in("status", ["ativo", "ATIVO", "EM_USO", "limitada", "LIMITADA"]),
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
        supabase.from("v_saldo_parceiro_contas").select("saldo, banco, parceiro_nome, moeda"),
        supabase.from("v_saldo_parceiro_wallets").select("saldo_usd, exchange"),
        supabase.from("participacao_ciclos").select("valor_participacao, data_pagamento").eq("status", "PAGO"),
        // Apenas para histórico mensal (lucro_prejuizo + data_aposta)
        supabase.from("apostas_unificada").select("lucro_prejuizo, data_aposta").not("resultado", "is", null),
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
      setBookmakersDetalhados(bookmakersDetalhadosResult.data || []);
      setContasParceiros(contasParceirosResult.data || []);
      setWalletsParceiros(walletsParceirosResult.data || []);
      setContasDetalhadas(contasDetalhadasResult.data || []);
      setWalletsDetalhadas(walletsDetalhadasResult.data || []);
      setParticipacoesPagas(participacoesResult.data || []);
      
      // Armazenar apostas para histórico mensal (não mais usado para lucro operacional)
      setApostasHistorico(apostasHistoricoResult.data || []);
      
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
  const filterByPeriod = <T extends { data_movimentacao?: string; data_inicio?: string; data_transacao?: string; data_despesa?: string; data_pagamento?: string; data_aposta?: string; data_credito?: string }>(
    data: T[],
    dateField: keyof T
  ): T[] => {
    if (!dataInicio && !dataFim) return data;
    
    return data.filter(item => {
      const dateValue = item[dateField] as string | undefined;
      if (!dateValue) return true;
      
      const itemDate = parseLocalDate(dateValue);
      const start = dataInicio ? startOfMonth(parseLocalDate(dataInicio)) : new Date(0);
      const end = dataFim ? endOfMonth(parseLocalDate(dataFim)) : new Date();
      
      return isWithinInterval(itemDate, { start, end });
    });
  };

  const filteredDespesas = filterByPeriod(despesas, "data_movimentacao");
  const filteredCustos = filterByPeriod(custos, "data_inicio");
  const filteredLedger = filterByPeriod(cashLedger, "data_transacao");
  const filteredDespesasAdmin = filterByPeriod(despesasAdmin, "data_despesa");
  const filteredPagamentosOp = filterByPeriod(pagamentosOperador, "data_pagamento") as PagamentoOperador[];
  // NOTA: Lucro operacional agora é calculado pelo hook useWorkspaceLucroOperacional
  // que consolida todos os módulos (apostas, cashback, giros grátis, etc.)
  // Valores disponíveis: lucroOperacionalApostas, hasMultiCurrencyApostas (definidos acima)

  // ==================== CÁLCULOS CORRIGIDOS ====================
  
  // Saldos base
  const saldoBRL = caixaFiat.find(f => f.moeda === "BRL")?.saldo || 0;
  const saldoUSD = caixaFiat.find(f => f.moeda === "USD")?.saldo || 0;
  const totalCryptoUSD = caixaCrypto.reduce((acc, c) => {
    return acc + getCryptoUSDValue(c.coin, c.saldo_coin, c.saldo_usd);
  }, 0);

  // Capital Operacional (Caixa = BRL + USD + Crypto convertidos)
  const capitalOperacional = saldoBRL + (saldoUSD * cotacaoUSD) + (totalCryptoUSD * cotacaoUSD);

  // Saldo em Bookmakers (capital em operação) - SEPARADO POR MOEDA
  const saldoBookmakersBRL = bookmakersSaldos
    .filter(b => !b.moeda || b.moeda === "BRL")
    .reduce((acc, b) => acc + (b.saldo_atual || 0) - (b.saldo_irrecuperavel || 0), 0);
  
  const saldoBookmakersUSD = bookmakersSaldos
    .filter(b => b.moeda === "USD")
    .reduce((acc, b) => acc + (b.saldo_atual || 0) - (b.saldo_irrecuperavel || 0), 0);
  
  // Total em BRL para referência (USD convertido)
  const saldoBookmakers = saldoBookmakersBRL + (saldoBookmakersUSD * cotacaoUSD);
  const hasBookmakersUSD = saldoBookmakersUSD > 0;

  // Saldos em contas de parceiros e wallets
  const totalContasParceiros = contasParceiros.reduce((acc, c) => acc + (c.saldo || 0), 0);
  const totalWalletsParceiros = walletsParceiros.reduce((acc, w) => acc + ((w.saldo_usd || 0) * cotacaoUSD), 0);

  // ==================== DADOS DETALHADOS PARA MAPA DE PATRIMÔNIO ====================
  
  // Bookmakers agrupados por projeto (separando BRL/USD)
  const bookmakersPorProjeto = useMemo((): BookmakerPorProjeto[] => {
    const agrupado: Record<string, { projetoId: string | null; projetoNome: string; saldoBRL: number; saldoUSD: number }> = {};
    
    bookmakersDetalhados.forEach((b: any) => {
      const projetoId = b.projeto_id || null;
      const projetoNome = b.projetos?.nome || "Sem Projeto";
      const key = projetoId || "sem_projeto";
      const saldoLiquido = (b.saldo_atual || 0) - (b.saldo_irrecuperavel || 0);
      const moeda = b.moeda || "BRL";
      const isUSD = moeda === "USD" || moeda === "USDT";
      
      if (!agrupado[key]) {
        agrupado[key] = { projetoId, projetoNome, saldoBRL: 0, saldoUSD: 0 };
      }
      
      if (isUSD) {
        agrupado[key].saldoUSD += saldoLiquido;
      } else {
        agrupado[key].saldoBRL += saldoLiquido;
      }
    });
    
    return Object.values(agrupado)
      .filter(p => p.saldoBRL !== 0 || p.saldoUSD !== 0)
      .map(p => ({
        ...p,
        saldo: p.saldoBRL + (p.saldoUSD * cotacaoUSD), // Saldo consolidado em BRL
      }));
  }, [bookmakersDetalhados, cotacaoUSD]);

  // Contas detalhadas por parceiro (não agrupadas por banco)
  const contasPorBanco = useMemo((): ContaPorBanco[] => {
    return contasDetalhadas
      .filter((c: ContaDetalhada) => (c.saldo || 0) !== 0)
      .map((c: ContaDetalhada) => ({
        bancoNome: c.banco || "Banco não informado",
        parceiroNome: c.parceiro_nome || "Parceiro não informado",
        saldo: c.saldo || 0,
        qtdContas: 1,
        moeda: c.moeda || "BRL",
      }))
      .sort((a, b) => b.saldo - a.saldo);
  }, [contasDetalhadas]);

  // Wallets agrupadas por exchange
  const walletsPorExchange = useMemo((): WalletPorExchange[] => {
    const agrupado: Record<string, { exchange: string; saldoUsd: number }> = {};
    
    walletsDetalhadas.forEach((w: any) => {
      const exchange = w.exchange || "Exchange não informada";
      
      if (!agrupado[exchange]) {
        agrupado[exchange] = { exchange, saldoUsd: 0 };
      }
      agrupado[exchange].saldoUsd += w.saldo_usd || 0;
    });
    
    return Object.values(agrupado);
  }, [walletsDetalhadas]);

  // Detalhes do caixa operacional
  const caixaDetalhes = useMemo((): CaixaDetalhe[] => {
    const detalhes: CaixaDetalhe[] = [];
    
    // BRL
    if (saldoBRL > 0) {
      detalhes.push({
        tipo: "BRL",
        nome: "Real (BRL)",
        valor: saldoBRL,
        valorBRL: saldoBRL,
      });
    }
    
    // USD
    if (saldoUSD > 0) {
      detalhes.push({
        tipo: "USD",
        nome: "Dólar (USD)",
        valor: saldoUSD,
        valorBRL: saldoUSD * cotacaoUSD,
      });
    }
    
    // Crypto
    caixaCrypto.forEach(c => {
      const valorUSD = getCryptoUSDValue(c.coin, c.saldo_coin, c.saldo_usd);
      if (valorUSD > 0) {
        detalhes.push({
          tipo: "CRYPTO",
          nome: c.coin,
          valor: c.saldo_coin,
          valorBRL: valorUSD * cotacaoUSD,
        });
      }
    });
    
    return detalhes;
  }, [saldoBRL, saldoUSD, caixaCrypto, cotacaoUSD, getCryptoUSDValue]);

  // ==================== CUSTOS REAIS (impactam P&L) ====================
  
  // Custos de Aquisição = PAGTO_PARCEIRO + PAGTO_FORNECEDOR
  const totalCustosAquisicao = filteredDespesas
    .filter(d => d.tipo === "PAGTO_PARCEIRO" || d.tipo === "PAGTO_FORNECEDOR")
    .reduce((acc, d) => acc + d.valor, 0);
  
  // Custos de Indicação = COMISSAO_INDICADOR + BONUS_INDICADOR
  const totalComissoes = filteredDespesas.filter(d => d.tipo === "COMISSAO_INDICADOR").reduce((acc, d) => acc + d.valor, 0);
  const totalBonus = filteredDespesas.filter(d => d.tipo === "BONUS_INDICADOR").reduce((acc, d) => acc + d.valor, 0);
  const totalDespesasIndicacao = totalComissoes + totalBonus;

  // Custos de Retenção = RENOVACAO_PARCERIA + BONIFICACAO_ESTRATEGICA
  const totalRenovacoes = filteredDespesas.filter(d => d.tipo === "RENOVACAO_PARCERIA").reduce((acc, d) => acc + d.valor, 0);
  const totalBonificacoes = filteredDespesas.filter(d => d.tipo === "BONIFICACAO_ESTRATEGICA").reduce((acc, d) => acc + d.valor, 0);
  const totalCustosRetencao = totalRenovacoes + totalBonificacoes;

  // Custos Operacionais Totais (Aquisição + Indicação + Retenção)
  const totalCustosOperacionais = totalCustosAquisicao + totalDespesasIndicacao + totalCustosRetencao;
  
  // Despesas administrativas (infraestrutura - exclui RH que vai para operadores)
  const despesasInfraestrutura = filteredDespesasAdmin.filter(d => d.grupo !== 'RECURSOS_HUMANOS');
  const despesasRH = filteredDespesasAdmin.filter(d => d.grupo === 'RECURSOS_HUMANOS');
  const totalDespesasAdmin = despesasInfraestrutura.reduce((acc, d) => acc + d.valor, 0);
  const totalDespesasRH = despesasRH.reduce((acc, d) => acc + d.valor, 0);

  // Pagamentos de operadores (inclui despesas de RH)
  const totalPagamentosOperadores = filteredPagamentosOp.reduce((acc, p) => acc + p.valor, 0) + totalDespesasRH;

  // ==================== FLUXO DE CAIXA REAL (CORRIGIDO) ====================
  // Separa MOVIMENTAÇÃO DE CAPITAL (depósitos/saques bookmakers) de FLUXO REAL
  
  const getFluxoCaixaRealData = (): { label: string; entradas: number; saidas: number; saldo: number }[] => {
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
          const dataTransacao = parseLocalDate(l.data_transacao);
          return isWithinInterval(dataTransacao, { start: w.weekStart, end: w.weekEnd });
        })
        .reduce((acc, l) => acc + l.valor, 0);
      
      // SAÍDAS REAIS: Custos operacionais + Despesas admin + Pagamentos
      // NÃO inclui depósitos em bookmakers (realocação patrimonial)
      const custosSemana = despesas
        .filter(d => {
          if (!d.data_movimentacao) return false;
          const dataMovimentacao = parseLocalDate(d.data_movimentacao);
          return isWithinInterval(dataMovimentacao, { start: w.weekStart, end: w.weekEnd });
        })
        .reduce((acc, d) => acc + d.valor, 0);
      
      const despesasAdminSemana = despesasAdmin
        .filter(d => {
          if (!d.data_despesa) return false;
          const dataDespesa = parseLocalDate(d.data_despesa);
          return isWithinInterval(dataDespesa, { start: w.weekStart, end: w.weekEnd });
        })
        .reduce((acc, d) => acc + d.valor, 0);

      const pagamentosOpSemana = pagamentosOperador
        .filter(p => {
          if (!p.data_pagamento) return false;
          const dataPagamento = parseLocalDate(p.data_pagamento);
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

  // ==================== DETALHES PARA DRILL-DOWN COMPOSIÇÃO DE CUSTOS ====================
  
  // Custos de Aquisição por tipo
  const custosAquisicaoDetalhes = useMemo((): CustoAquisicaoDetalhe[] => {
    const parceiroTotal = filteredDespesas
      .filter(d => d.tipo === "PAGTO_PARCEIRO")
      .reduce((acc, d) => acc + d.valor, 0);
    const fornecedorTotal = filteredDespesas
      .filter(d => d.tipo === "PAGTO_FORNECEDOR")
      .reduce((acc, d) => acc + d.valor, 0);
    
    const detalhes: CustoAquisicaoDetalhe[] = [];
    if (parceiroTotal > 0) detalhes.push({ tipo: "PAGTO_PARCEIRO", valor: parceiroTotal });
    if (fornecedorTotal > 0) detalhes.push({ tipo: "PAGTO_FORNECEDOR", valor: fornecedorTotal });
    return detalhes;
  }, [filteredDespesas]);

  // Comissões por indicador
  const comissoesDetalhes = useMemo((): ComissaoDetalhe[] => {
    const agrupado: Record<string, { indicadorNome: string; valor: number }> = {};
    
    filteredDespesas
      .filter(d => d.tipo === "COMISSAO_INDICADOR")
      .forEach((d: any) => {
        const indicadorNome = d.indicadores_referral?.nome || "Indicador não identificado";
        if (!agrupado[indicadorNome]) {
          agrupado[indicadorNome] = { indicadorNome, valor: 0 };
        }
        agrupado[indicadorNome].valor += d.valor;
      });
    
    return Object.values(agrupado).sort((a, b) => b.valor - a.valor);
  }, [filteredDespesas]);

  // Bônus por indicador
  const bonusDetalhes = useMemo((): BonusDetalhe[] => {
    const agrupado: Record<string, { indicadorNome: string; valor: number }> = {};
    
    filteredDespesas
      .filter(d => d.tipo === "BONUS_INDICADOR")
      .forEach((d: any) => {
        const indicadorNome = d.indicadores_referral?.nome || "Indicador não identificado";
        if (!agrupado[indicadorNome]) {
          agrupado[indicadorNome] = { indicadorNome, valor: 0 };
        }
        agrupado[indicadorNome].valor += d.valor;
      });
    
    return Object.values(agrupado).sort((a, b) => b.valor - a.valor);
  }, [filteredDespesas]);

  // Infraestrutura por categoria - com suporte a CRYPTO (exclui RH)
  const infraestruturaDetalhes = useMemo((): InfraestruturaDetalhe[] => {
    const agrupado: Record<string, { 
      categoria: string; 
      valor: number; 
      valorUSD: number;
      hasCrypto: boolean;
    }> = {};
    
    // Apenas despesas de infraestrutura (exclui RH que vai para operadores)
    despesasInfraestrutura.forEach((d: any) => {
      const categoria = d.categoria || "Outros";
      const isCrypto = d.tipo_moeda === "CRYPTO";
      
      if (!agrupado[categoria]) {
        agrupado[categoria] = { categoria, valor: 0, valorUSD: 0, hasCrypto: false };
      }
      
      // Valor em BRL (sempre somar para total de referência)
      agrupado[categoria].valor += d.valor;
      
      // Se for CRYPTO, usar o snapshot salvo (qtd_coin é o valor em USD/USDT)
      if (isCrypto) {
        agrupado[categoria].hasCrypto = true;
        // Usar valor do snapshot: qtd_coin já é USD (USDT 1:1)
        // Se não tiver qtd_coin, usa API para converter BRL -> USD com cotação snapshot
        const valorUSD = d.qtd_coin ?? (d.cotacao ? d.valor / d.cotacao : convertFromBRL(d.valor, "USD"));
        agrupado[categoria].valorUSD += valorUSD;
      }
    });
    
    return Object.values(agrupado).sort((a, b) => b.valor - a.valor);
  }, [despesasInfraestrutura, convertFromBRL]);

  // Operadores por nome (inclui pagamentos de operadores + despesas de RH com subcategorias)
  const operadoresDetalhes = useMemo((): OperadorDetalhe[] => {
    const agrupado: Record<string, { operadorNome: string; valor: number }> = {};
    
    // Pagamentos de operadores tradicionais
    filteredPagamentosOp.forEach((p: any) => {
      const operadorNome = p.operadores?.nome || "Operador não identificado";
      if (!agrupado[operadorNome]) {
        agrupado[operadorNome] = { operadorNome, valor: 0 };
      }
      agrupado[operadorNome].valor += p.valor;
    });
    
    // Despesas de RH (agrupadas por subcategoria para visualização)
    despesasRH.forEach((d: any) => {
      // Usar subcategoria para categorizar: "RH - Salário Mensal", "RH - Comissão", etc.
      let subcategoriaLabel = "RH - Outros";
      if (d.subcategoria_rh) {
        const subcatMap: Record<string, string> = {
          SALARIO_MENSAL: "RH - Salário Mensal",
          COMISSAO: "RH - Comissões",
          ADIANTAMENTO: "RH - Adiantamentos",
          BONIFICACAO: "RH - Bonificações",
        };
        subcategoriaLabel = subcatMap[d.subcategoria_rh] || `RH - ${d.subcategoria_rh}`;
      } else if (d.categoria) {
        // Fallback para categoria se não tiver subcategoria
        subcategoriaLabel = `RH - ${d.categoria}`;
      }
      
      if (!agrupado[subcategoriaLabel]) {
        agrupado[subcategoriaLabel] = { operadorNome: subcategoriaLabel, valor: 0 };
      }
      agrupado[subcategoriaLabel].valor += d.valor;
    });
    
    return Object.values(agrupado).sort((a, b) => b.valor - a.valor);
  }, [filteredPagamentosOp, despesasRH]);

  // Total período anterior
  const getMesAnteriorCustos = () => {
    const mesAnterior = subMonths(new Date(), 1);
    const keyAnterior = format(mesAnterior, "yyyy-MM");
    
    const custosAnt = despesas
      .filter(d => d.data_movimentacao && format(parseLocalDate(d.data_movimentacao), "yyyy-MM") === keyAnterior)
      .reduce((acc, d) => acc + d.valor, 0);
    
    const despesasAdmAnt = despesasAdmin
      .filter(d => d.data_despesa && format(parseLocalDate(d.data_despesa), "yyyy-MM") === keyAnterior)
      .reduce((acc, d) => acc + d.valor, 0);
    
    const opAnt = pagamentosOperador
      .filter(p => p.data_pagamento && format(parseLocalDate(p.data_pagamento), "yyyy-MM") === keyAnterior)
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
    if (custos.length === 0) return 1; // fallback mínimo de 1 dia
    
    const hoje = new Date();
    const diasPorParceria = custos
      .filter(c => c.data_inicio)
      .map(c => {
        const dataInicio = parseLocalDate(c.data_inicio);
        const diffMs = hoje.getTime() - dataInicio.getTime();
        return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      });
    
    if (diasPorParceria.length === 0) return 1;
    
    const media = diasPorParceria.reduce((acc, d) => acc + d, 0) / diasPorParceria.length;
    return Math.max(1, Math.round(media)); // mínimo 1 dia (real)
  }, [custos]);
  // ==================== HISTÓRICO MENSAL ====================
  
  const getHistoricoMensal = () => {
    // Novo modelo: baseado em lucro operacional (apostas), não fluxo de caixa
    const months: Record<string, { 
      mes: string; 
      label: string; 
      lucroApostas: number;      // Lucro operacional das apostas LIQUIDADAS
      custosOperacionais: number; // Pagamentos a parceiros + indicadores + operadores
      despesasAdmin: number;      // Despesas administrativas
      participacoes: number;      // Participações pagas a investidores
      patrimonio: number;
    }> = {};
    
    // Inicializar últimos 12 meses
    for (let i = 11; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const key = format(date, "yyyy-MM");
      months[key] = {
        mes: key,
        label: format(date, "MMM/yy", { locale: ptBR }),
        lucroApostas: 0,
        custosOperacionais: 0,
        despesasAdmin: 0,
        participacoes: 0,
        patrimonio: 0,
      };
    }

    // 1. LUCRO OPERACIONAL: soma de lucro_prejuizo das apostas liquidadas
    apostasHistorico.forEach(aposta => {
      if (aposta.data_aposta && aposta.lucro_prejuizo !== null) {
        const key = format(parseLocalDate(aposta.data_aposta), "yyyy-MM");
        if (months[key]) {
          months[key].lucroApostas += aposta.lucro_prejuizo;
        }
      }
    });

    // 2. CUSTOS OPERACIONAIS: pagamentos CONFIRMADOS a parceiros/indicadores
    // (despesas já vem filtrado por CONFIRMADO na query)
    despesas.forEach(d => {
      if (d.data_movimentacao) {
        const key = format(parseLocalDate(d.data_movimentacao), "yyyy-MM");
        if (months[key]) {
          months[key].custosOperacionais += d.valor || 0;
        }
      }
    });

    // 2b. CUSTOS OPERACIONAIS: pagamentos a operadores CONFIRMADOS
    pagamentosOperador.forEach(p => {
      if (p.data_pagamento) {
        const key = format(parseLocalDate(p.data_pagamento), "yyyy-MM");
        if (months[key]) {
          months[key].custosOperacionais += p.valor || 0;
        }
      }
    });

    // 3. DESPESAS ADMINISTRATIVAS: despesas confirmadas
    despesasAdmin.forEach(d => {
      if (d.data_despesa) {
        const key = format(parseLocalDate(d.data_despesa), "yyyy-MM");
        if (months[key]) {
          months[key].despesasAdmin += d.valor || 0;
        }
      }
    });

    // 4. PARTICIPAÇÕES: distribuição de lucros a investidores PAGAS
    participacoesPagas.forEach(p => {
      if (p.data_pagamento) {
        const key = format(parseLocalDate(p.data_pagamento), "yyyy-MM");
        if (months[key]) {
          months[key].participacoes += p.valor_participacao || 0;
        }
      }
    });

    // 5. PATRIMÔNIO ACUMULADO: soma progressiva do resultado líquido
    let patrimonioAcumulado = 0;
    const monthsArray = Object.values(months);
    monthsArray.forEach((m, index) => {
      const lucroLiquido = m.lucroApostas - m.custosOperacionais - m.despesasAdmin - m.participacoes;
      patrimonioAcumulado += lucroLiquido;
      monthsArray[index].patrimonio = patrimonioAcumulado;
    });

    return monthsArray.map(m => ({
      ...m,
      // Mapeamento para compatibilidade com a UI existente
      resultado: m.lucroApostas,           // Agora é lucro operacional, não fluxo de caixa
      custos: m.custosOperacionais,        // Pagamentos reais, não compromissos
      despesas: m.despesasAdmin,
      lucroLiquido: m.lucroApostas - m.custosOperacionais - m.despesasAdmin - m.participacoes,
      totalCustos: m.custosOperacionais + m.despesasAdmin + m.participacoes,
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
      <PageHeader
        title="Dashboard Financeiro"
        description="Visão financeira estratégica: Liquidez, Custos e Sustentabilidade"
        pagePath="/financeiro"
        pageIcon="PieChart"
      />

      {/* Banner de Consolidação Multimoeda */}
      <MultiCurrencyWarningBanner
        hasUSD={hasBookmakersUSD || saldoUSD > 0}
        hasCrypto={totalCryptoUSD > 0}
        cotacaoUSD={cotacaoUSD}
      />

      {/* Filtros de Período - Padrão Unificado */}
      <DashboardPeriodFilterBar
        value={periodoPreset}
        onChange={setPeriodoPreset}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
        
      />

      {/* Tabs */}
      <Tabs defaultValue={tabFromUrl || "overview"} className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Visão Financeira
          </TabsTrigger>
          <TabsTrigger value="despesas" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Despesas Administrativas
          </TabsTrigger>
          <TabsTrigger value="participacoes" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Participações
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Histórico Mensal
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {/* LINHA 1: Visão Patrimonial - Onde está o dinheiro + Para onde vai */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MapaPatrimonioCard
              caixaOperacional={capitalOperacional}
              saldoBookmakers={saldoBookmakers}
              saldoBookmakersBRL={saldoBookmakersBRL}
              saldoBookmakersUSD={saldoBookmakersUSD}
              contasParceiros={totalContasParceiros}
              walletsCrypto={totalWalletsParceiros}
              formatCurrency={formatCurrency}
              bookmakersPorProjeto={bookmakersPorProjeto}
              contasPorBanco={contasPorBanco}
              walletsPorExchange={walletsPorExchange}
              caixaDetalhes={caixaDetalhes}
              cotacaoUSD={cotacaoUSD}
            />
            <ComposicaoCustosCard
              categorias={composicaoCustos}
              totalAtual={custoSustentacao}
              totalAnterior={totalCustosAnterior}
              formatCurrency={formatCurrency}
              custosAquisicaoDetalhes={custosAquisicaoDetalhes}
              comissoesDetalhes={comissoesDetalhes}
              bonusDetalhes={bonusDetalhes}
              infraestruturaDetalhes={infraestruturaDetalhes}
              operadoresDetalhes={operadoresDetalhes}
            />
          </div>

          {/* LINHA 2: Métricas Operacionais */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <EquilibrioOperacionalCard
              lucroOperacional={lucroOperacionalApostas}
              custoSustentacao={custoSustentacao}
              formatCurrency={formatCurrency}
              hasMultiCurrency={hasBookmakersUSD || totalCryptoUSD > 0}
              cotacaoUSD={cotacaoUSD}
            />
            <EficienciaCapitalCard
              lucroOperacional={lucroOperacionalApostas}
              capitalEmBookmakers={saldoBookmakers}
              formatCurrency={formatCurrency}
              hasMultiCurrency={hasBookmakersUSD}
              capitalBRL={saldoBookmakersBRL}
              capitalUSD={saldoBookmakersUSD}
              cotacaoUSD={cotacaoUSD}
            />
            <MovimentacaoCapitalCard
              depositosBookmakers={depositosBookmakersPeriodo}
              saquesBookmakers={saquesBookmakersPeriodo}
              capitalEmOperacao={saldoBookmakers}
              capitalEmOperacaoBRL={saldoBookmakersBRL}
              capitalEmOperacaoUSD={saldoBookmakersUSD}
              formatCurrency={formatCurrency}
            />
          </div>

          {/* LINHA 3: Custos e Rentabilidade */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <CustoSustentacaoCard
              custosOperacionais={totalCustosOperacionais}
              despesasAdministrativas={totalDespesasAdmin}
              pagamentosOperadores={totalPagamentosOperadores}
              formatCurrency={formatCurrency}
              operadoresDetalhes={operadoresDetalhes}
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
                  <thead className="sticky top-0 z-10 bg-background">
                    <tr className="border-b bg-muted/30">
                      <th className="text-left py-3 px-4 font-medium">Data</th>
                      <th className="text-left py-3 px-4 font-medium">Grupo</th>
                      <th className="text-left py-3 px-4 font-medium">Descrição</th>
                      <th className="text-right py-3 px-4 font-medium">Valor</th>
                      <th className="text-center py-3 px-4 font-medium">Recorrente</th>
                      <th className="text-center py-3 px-4 font-medium">Status</th>
                      <th className="text-center py-3 px-4 font-medium">Ações</th>
                    </tr>
                  </thead>
                </table>
                {/* Container com scroll quando houver 5+ registros */}
                <div className={despesasAdmin.length >= 5 ? "max-h-[320px] overflow-y-auto" : ""}>
                  <table className="w-full text-sm">
                    <tbody>
                      {despesasAdmin.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="text-center py-8 text-muted-foreground">
                            Nenhuma despesa administrativa cadastrada
                          </td>
                        </tr>
                      ) : (
                        [...despesasAdmin]
                          .sort((a, b) => parseLocalDate(b.data_despesa).getTime() - parseLocalDate(a.data_despesa).getTime())
                          .map((despesa) => (
                            <tr key={despesa.id} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="py-3 px-4 w-[120px]">
                                {format(parseLocalDate(despesa.data_despesa), "dd/MM/yyyy", { locale: ptBR })}
                              </td>
                              <td className="py-3 px-4">
                              {(() => {
                                  const grupoInfo = getGrupoInfo(despesa.grupo || "OUTROS");
                                  const IconComponent = grupoInfo.icon;
                                  return (
                                    <ShadcnTooltip>
                                      <TooltipTrigger asChild>
                                        <Badge 
                                          variant="outline" 
                                          className={`whitespace-nowrap ${grupoInfo.color}`}
                                        >
                                          <IconComponent className="h-3 w-3 mr-1" />
                                          {grupoInfo.label}
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">{grupoInfo.description}</p>
                                        {despesa.categoria && despesa.categoria !== grupoInfo.label && (
                                          <p className="text-xs text-muted-foreground mt-1">
                                            Categoria original: {despesa.categoria}
                                          </p>
                                        )}
                                      </TooltipContent>
                                    </ShadcnTooltip>
                                  );
                                })()}
                              </td>
                              <td className="py-3 px-4 text-muted-foreground">
                                {despesa.descricao || "—"}
                              </td>
                              <td className="py-3 px-4 text-right font-medium text-orange-500 w-[120px]">
                                {formatCurrency(despesa.valor)}
                              </td>
                              <td className="py-3 px-4 text-center w-[100px]">
                                {despesa.recorrente ? (
                                  <Badge variant="secondary" className="text-xs">Sim</Badge>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="py-3 px-4 text-center w-[100px]">
                                <Badge 
                                  variant={despesa.status === "CONFIRMADO" ? "default" : "secondary"}
                                  className="text-xs"
                                >
                                  {despesa.status}
                                </Badge>
                              </td>
                              <td className="py-3 px-4 w-[80px]">
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
              </div>
            </CardContent>
          </Card>

          {/* Resumo por Grupo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resumo por Grupo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(
                  despesasAdmin.reduce((acc, d) => {
                    const grupo = d.grupo || "OUTROS";
                    acc[grupo] = (acc[grupo] || 0) + d.valor;
                    return acc;
                  }, {} as Record<string, number>)
                ).sort((a, b) => b[1] - a[1]).map(([grupo, valor]) => {
                  const grupoInfo = getGrupoInfo(grupo);
                  const IconComponent = grupoInfo.icon;
                  return (
                    <div key={grupo} className="flex items-center justify-between">
                      <span className="text-sm flex items-center gap-2">
                        <IconComponent className="h-4 w-4" />
                        <span>{grupoInfo.label}</span>
                      </span>
                      <span className="font-medium text-orange-500">{formatCurrency(valor)}</span>
                    </div>
                  );
                })}
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

        {/* Tab: Participações de Investidores */}
        <TabsContent value="participacoes" className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Participações de Investidores</h2>
            <p className="text-sm text-muted-foreground">Gerencie distribuição de lucros para investidores vinculados a projetos</p>
          </div>
          <ParticipacaoInvestidoresTab 
            formatCurrency={formatCurrency}
            onRefresh={fetchData}
            investidorFiltroId={investidorFiltroId || undefined}
          />
        </TabsContent>

        <TabsContent value="historico" className="space-y-6">
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
                      <th className="text-right py-3 px-4 font-medium">
                        <TooltipProvider>
                          <ShadcnTooltip>
                            <TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">
                              Lucro Apostas
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">Soma do lucro/prejuízo de todas as apostas liquidadas no período. Representa o resultado operacional real.</p>
                            </TooltipContent>
                          </ShadcnTooltip>
                        </TooltipProvider>
                      </th>
                      <th className="text-right py-3 px-4 font-medium">
                        <TooltipProvider>
                          <ShadcnTooltip>
                            <TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">
                              Custos
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">Pagamentos confirmados: parceiros, comissões, bônus de indicadores e pagamentos a operadores.</p>
                            </TooltipContent>
                          </ShadcnTooltip>
                        </TooltipProvider>
                      </th>
                      <th className="text-right py-3 px-4 font-medium">
                        <TooltipProvider>
                          <ShadcnTooltip>
                            <TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">
                              Despesas
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">Despesas administrativas confirmadas: infraestrutura, ferramentas, serviços, etc.</p>
                            </TooltipContent>
                          </ShadcnTooltip>
                        </TooltipProvider>
                      </th>
                      <th className="text-right py-3 px-4 font-medium">
                        <TooltipProvider>
                          <ShadcnTooltip>
                            <TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">
                              Participações
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs">
                              <p className="text-xs">Distribuição de lucros pagas a investidores vinculados a projetos.</p>
                            </TooltipContent>
                          </ShadcnTooltip>
                        </TooltipProvider>
                      </th>
                      <th className="text-right py-3 px-4 font-medium">
                        <button
                          onClick={() => setHistoricoSort(prev => ({
                            field: "lucroLiquido",
                            direction: prev.field === "lucroLiquido" && prev.direction === "desc" ? "asc" : "desc"
                          }))}
                          className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${historicoSort.field === "lucroLiquido" ? "text-primary" : ""}`}
                        >
                          <TooltipProvider>
                            <ShadcnTooltip>
                              <TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">
                                Lucro Líq.
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="text-xs">Lucro Apostas − Custos − Despesas − Participações. Resultado econômico real após todas as deduções.</p>
                              </TooltipContent>
                            </ShadcnTooltip>
                          </TooltipProvider>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                      <th className="text-right py-3 px-4 font-medium">
                        <button
                          onClick={() => setHistoricoSort(prev => ({
                            field: "patrimonio",
                            direction: prev.field === "patrimonio" && prev.direction === "desc" ? "asc" : "desc"
                          }))}
                          className={`inline-flex items-center gap-1 hover:text-primary transition-colors ${historicoSort.field === "patrimonio" ? "text-primary" : ""}`}
                        >
                          <TooltipProvider>
                            <ShadcnTooltip>
                              <TooltipTrigger className="cursor-help border-b border-dotted border-muted-foreground/50">
                                Patrimônio
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-xs">
                                <p className="text-xs">Soma acumulada do Lucro Líquido. Representa o crescimento patrimonial total até o mês.</p>
                              </TooltipContent>
                            </ShadcnTooltip>
                          </TooltipProvider>
                          <ArrowUpDown className="h-3 w-3" />
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...historicoMensal].sort((a, b) => {
                      const { field, direction } = historicoSort;
                      let comparison = 0;
                      if (field === "mes") {
                        comparison = a.mes.localeCompare(b.mes);
                      } else if (field === "lucroLiquido") {
                        comparison = a.lucroLiquido - b.lucroLiquido;
                      } else if (field === "patrimonio") {
                        comparison = a.patrimonio - b.patrimonio;
                      }
                      return direction === "desc" ? -comparison : comparison;
                    }).map((m) => (
                      <tr key={m.mes} className="border-b border-border/50 hover:bg-muted/30">
                        <td className="py-3 px-4 font-medium">{m.label}</td>
                        <td className={`py-3 px-4 text-right ${m.resultado >= 0 ? 'text-success' : 'text-destructive'}`}>
                          {formatCurrency(m.resultado)}
                        </td>
                        <td className="py-3 px-4 text-right text-destructive">{formatCurrency(m.custos)}</td>
                        <td className="py-3 px-4 text-right text-muted-foreground">{formatCurrency(m.despesas + m.despesasAdmin)}</td>
                        <td className="py-3 px-4 text-right text-indigo-400">{formatCurrency(m.participacoes)}</td>
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
