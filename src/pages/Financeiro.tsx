import { useEffect, useState, useMemo } from "react";
import { useTabWorkspace } from "@/hooks/useTabWorkspace";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useFinanceiroData } from "@/hooks/useFinanceiroData";
import { useFinanceiroCalculations } from "@/hooks/useFinanceiroCalculations";
import { useToast } from "@/hooks/use-toast";
import { useCotacoes } from "@/hooks/useCotacoes";
import { useMultiCurrencyConversion } from "@/hooks/useMultiCurrencyConversion";
import { useCurrencySnapshot } from "@/hooks/useCurrencySnapshot";
import { useWorkspaceLucroOperacional } from "@/hooks/useWorkspaceLucroOperacional";
import { useCapitalMedioPeriodo } from "@/hooks/useCapitalMedioPeriodo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardPeriodFilterBar } from "@/components/shared/DashboardPeriodFilterBar";
import { DashboardPeriodFilter, getDashboardDateRangeAsStrings } from "@/types/dashboardFilters";
import { useTopBar } from "@/contexts/TopBarContext";
import {
  Loader2,
  BarChart3,
  History,
  Building2,
  Users,
} from "lucide-react";
import {
  Tooltip as ShadcnTooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { KpiExplanationDialog, KpiType } from "@/components/financeiro/KpiExplanationDialog";
import { RentabilidadeCaptacaoCard } from "@/components/financeiro/RentabilidadeCaptacaoCard";
import {
  ComposicaoCustosCard,
} from "@/components/financeiro/ComposicaoCustosCard";
import { MovimentacaoCapitalCard } from "@/components/financeiro/MovimentacaoCapitalCard";
import { CustoSustentacaoCard } from "@/components/financeiro/CustoSustentacaoCard";
import { EquilibrioOperacionalCard } from "@/components/financeiro/EquilibrioOperacionalCard";
import { EficienciaCapitalCard } from "@/components/financeiro/EficienciaCapitalCard";
import { MapaPatrimonioCard } from "@/components/financeiro/MapaPatrimonioCard";
import { ParticipacaoInvestidoresTab } from "@/components/financeiro/ParticipacaoInvestidoresTab";
import { MultiCurrencyWarningBanner } from "@/components/financeiro/MultiCurrencyIndicator";
import { FinanceiroDespesasTab } from "@/components/financeiro/FinanceiroDespesasTab";
import { FinanceiroHistoricoTab } from "@/components/financeiro/FinanceiroHistoricoTab";

export default function Financeiro() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { setContent: setTopBarContent } = useTopBar();
  const { workspaceId } = useTabWorkspace();
  
  // ==================== REACT QUERY ====================
  const { data: finData, loading, refetch: refetchFinanceiro } = useFinanceiroData();
  
  // Cotações
  const cryptoSymbols = useMemo(() => finData.caixaCrypto.map(c => c.coin), [finData.caixaCrypto]);
  const { cotacaoUSD, cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP, getCryptoUSDValue, refreshAll: refreshCotacoes, loading: loadingCotacoes, lastUpdate, source } = useCotacoes(cryptoSymbols);
  
  const cotacoesMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (cotacaoEUR > 0.001) map['EUR'] = cotacaoEUR;
    if (cotacaoGBP > 0.001) map['GBP'] = cotacaoGBP;
    if (cotacaoMYR > 0.001) map['MYR'] = cotacaoMYR;
    if (cotacaoMXN > 0.001) map['MXN'] = cotacaoMXN;
    if (cotacaoARS > 0.001) map['ARS'] = cotacaoARS;
    if (cotacaoCOP > 0.001) map['COP'] = cotacaoCOP;
    return map;
  }, [cotacaoEUR, cotacaoGBP, cotacaoMYR, cotacaoMXN, cotacaoARS, cotacaoCOP]);
  
  const { convertFromBRL } = useCurrencySnapshot({ cryptoSymbols });
  // Conversão unificada: mesma função usada pelo Caixa Operacional (PosicaoCapital)
  const { convert: convertUnified } = useMultiCurrencyConversion(cryptoSymbols);

  // Filtro de período
  const [periodoPreset, setPeriodoPreset] = useState<DashboardPeriodFilter>("mes");
  const [customRange, setCustomRange] = useState<{ start: Date; end: Date } | undefined>(undefined);
  const { dataInicio, dataFim } = useMemo(
    () => getDashboardDateRangeAsStrings(periodoPreset, customRange),
    [periodoPreset, customRange]
  );

  // Lucro operacional
  const { resultado: lucroOperacionalData, loading: loadingLucroOperacional, refresh: refreshLucroOperacional } = useWorkspaceLucroOperacional({
    dataInicio: dataInicio || null, dataFim: dataFim || null, cotacaoUSD, cotacoes: cotacoesMap,
  });
  const lucroOperacionalApostas = lucroOperacionalData?.lucroTotal ?? 0;
  const hasMultiCurrencyApostas = lucroOperacionalData?.hasMultiCurrency ?? false;

  // Capital médio
  const capitalMedioPeriodo = useCapitalMedioPeriodo({ dataInicio: dataInicio || null, dataFim: dataFim || null, capitalAtual: 0 });

  // Dialog states
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false);
  const [kpiType, setKpiType] = useState<KpiType>(null);

  // Tab
  const tabFromUrl = searchParams.get("tab");
  const [activeFinanceiroTab, setActiveFinanceiroTab] = useState(tabFromUrl || "overview");
  const investidorFiltroId = searchParams.get("investidor");

  // Auth check
  useEffect(() => {
    if (workspaceId) {
      const checkAuth = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) navigate("/auth");
      };
      checkAuth();
    }
  }, [workspaceId, navigate]);

  // ==================== CALCULATIONS (MEMOIZED) ====================
  const calc = useFinanceiroCalculations({
    finData,
    dataInicio: dataInicio || null,
    dataFim: dataFim || null,
    cotacaoUSD,
    cotacoesMap,
    lucroOperacionalApostas,
    getCryptoUSDValue,
    convertFromBRL,
    convertUnified,
  });

  const openKpiHelp = (type: KpiType) => { setKpiType(type); setKpiDialogOpen(true); };

  // Inject title into global TopBar
  useEffect(() => {
    setTopBarContent(
      <ShadcnTooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 cursor-default">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10">
              <BarChart3 className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-sm">Dashboard Financeiro</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">Visão financeira estratégica: Liquidez, Custos e Sustentabilidade</TooltipContent>
      </ShadcnTooltip>
    );
    return () => setTopBarContent(null);
  }, [setTopBarContent]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-3 py-4 md:px-6 md:py-6 space-y-4 md:space-y-6">
      <MultiCurrencyWarningBanner
        hasUSD={calc.saldos.hasBookmakersUSD || calc.saldos.saldoUSD > 0}
        hasCrypto={calc.saldos.totalCryptoUSD > 0}
        cotacaoUSD={cotacaoUSD}
      />

      <DashboardPeriodFilterBar
        value={periodoPreset}
        onChange={setPeriodoPreset}
        customRange={customRange}
        onCustomRangeChange={setCustomRange}
      />

      <Tabs value={activeFinanceiroTab} onValueChange={setActiveFinanceiroTab} className="space-y-4 md:space-y-6">
        {/* Sticky tab bar - mobile optimized */}
        <div className="sticky top-0 z-30 -mx-3 px-3 md:-mx-6 md:px-6 py-2 bg-background/95 backdrop-blur-sm border-b border-border/50">
          <TabsList className="w-full overflow-x-auto scrollbar-none flex gap-0 md:gap-8 border-b-0">
            <TabsTrigger value="overview" className="flex items-center gap-1.5 md:gap-2 min-w-0 px-2.5 md:px-4 text-xs md:text-sm">
              <BarChart3 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Visão Financeira</span>
              <span className="sm:hidden">Visão</span>
            </TabsTrigger>
            <TabsTrigger value="despesas" className="flex items-center gap-1.5 md:gap-2 min-w-0 px-2.5 md:px-4 text-xs md:text-sm">
              <Building2 className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Despesas Administrativas</span>
              <span className="sm:hidden">Despesas</span>
            </TabsTrigger>
            <TabsTrigger value="participacoes" className="flex items-center gap-1.5 md:gap-2 min-w-0 px-2.5 md:px-4 text-xs md:text-sm">
              <Users className="h-4 w-4 shrink-0" />
              Participações
            </TabsTrigger>
            <TabsTrigger value="historico" className="flex items-center gap-1.5 md:gap-2 min-w-0 px-2.5 md:px-4 text-xs md:text-sm">
              <History className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Histórico Mensal</span>
              <span className="sm:hidden">Histórico</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="space-y-4 md:space-y-6">
          {/* LINHA 1: Visão Patrimonial */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <MapaPatrimonioCard
              caixaOperacional={calc.saldos.capitalOperacional}
              saldoBookmakers={calc.saldos.saldoBookmakers}
              saldoBookmakersBRL={calc.saldos.saldoBookmakersBRL}
              saldoBookmakersUSD={calc.saldos.saldoBookmakersUSD}
              contasParceiros={calc.saldos.totalContasParceiros}
              walletsCrypto={calc.saldos.totalWalletsParceiros}
              formatCurrency={calc.formatCurrency}
              bookmakersPorProjeto={calc.bookmakersPorProjeto}
              contasPorBanco={calc.contasPorBanco}
              walletsPorExchange={calc.walletsPorExchange}
              caixaDetalhes={calc.caixaDetalhes}
              cotacaoUSD={cotacaoUSD}
            />
            <ComposicaoCustosCard
              categorias={calc.composicaoCustos}
              totalAtual={calc.costs.custoSustentacao}
              totalAnterior={calc.totalCustosAnterior}
              formatCurrency={calc.formatCurrency}
              custosAquisicaoDetalhes={calc.custosAquisicaoDetalhes}
              comissoesDetalhes={calc.comissoesDetalhes}
              bonusDetalhes={calc.bonusDetalhes}
              infraestruturaDetalhes={calc.infraestruturaDetalhes}
              operadoresDetalhes={calc.operadoresDetalhes}
            />
          </div>

          {/* LINHA 2: Métricas Operacionais */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            <EquilibrioOperacionalCard
              lucroOperacional={lucroOperacionalApostas}
              custoSustentacao={calc.costs.custoSustentacao}
              formatCurrency={calc.formatCurrency}
              hasMultiCurrency={calc.saldos.hasBookmakersUSD || calc.saldos.totalCryptoUSD > 0}
              cotacaoUSD={cotacaoUSD}
            />
            <EficienciaCapitalCard
              lucroOperacional={lucroOperacionalApostas}
              capitalEmBookmakers={calc.saldos.saldoBookmakers}
              formatCurrency={calc.formatCurrency}
              hasMultiCurrency={calc.saldos.hasBookmakersUSD}
              capitalBRL={calc.saldos.saldoBookmakersBRL}
              capitalUSD={calc.saldos.saldoBookmakersUSD}
              cotacaoUSD={cotacaoUSD}
              capitalMedio={capitalMedioPeriodo.capitalMedio}
              capitalMedioIsFallback={capitalMedioPeriodo.isFallback}
              snapshotsCount={capitalMedioPeriodo.snapshotsCount}
              volumeApostado={capitalMedioPeriodo.volumeApostado}
            />
            <MovimentacaoCapitalCard
              depositosBookmakers={calc.movimentacao.depositosBookmakersPeriodo}
              saquesBookmakers={calc.movimentacao.saquesBookmakersPeriodo}
              capitalEmOperacao={calc.saldos.saldoBookmakers}
              capitalEmOperacaoBRL={calc.saldos.saldoBookmakersBRL}
              capitalEmOperacaoUSD={calc.saldos.saldoBookmakersUSD}
              formatCurrency={calc.formatCurrency}
            />
          </div>

          {/* LINHA 3: Custos e Rentabilidade */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            <CustoSustentacaoCard
              custosOperacionais={calc.costs.totalCustosOperacionais}
              despesasAdministrativas={calc.costs.totalDespesasAdmin}
              pagamentosOperadores={calc.costs.totalPagamentosOperadores}
              formatCurrency={calc.formatCurrency}
              operadoresDetalhes={calc.operadoresDetalhes}
            />
            <RentabilidadeCaptacaoCard
              totalLucroParceiros={calc.totalLucroParceiros}
              totalCustosAquisicao={calc.costs.totalCustosOperacionais}
              totalParceirosAtivos={calc.totalParceirosAtivos}
              diasMedioAquisicao={calc.diasMedioAquisicao}
              lucroOperacional={lucroOperacionalApostas}
              formatCurrency={calc.formatCurrency}
            />
          </div>
        </TabsContent>

        <TabsContent value="despesas">
          <FinanceiroDespesasTab
            despesasAdmin={calc.despesasAdmin}
            totalDespesasAdmin={calc.costs.totalDespesasAdmin}
            totalPagamentosOperadores={calc.costs.totalPagamentosOperadores}
            formatCurrency={calc.formatCurrency}
            onRefresh={() => refetchFinanceiro()}
            dataInicio={calc.dataInicio}
            dataFim={calc.dataFim}
          />
        </TabsContent>

        <TabsContent value="participacoes" className="space-y-4 md:space-y-6">
          <div>
            <h2 className="text-base md:text-lg font-semibold">Participações de Investidores</h2>
            <p className="text-xs md:text-sm text-muted-foreground">Gerencie distribuição de lucros para investidores vinculados a projetos</p>
          </div>
          <ParticipacaoInvestidoresTab
            formatCurrency={calc.formatCurrency}
            onRefresh={() => refetchFinanceiro()}
            investidorFiltroId={investidorFiltroId || undefined}
          />
        </TabsContent>

        <TabsContent value="historico">
          <FinanceiroHistoricoTab
            historicoMensal={calc.historicoMensal}
            formatCurrency={calc.formatCurrency}
          />
        </TabsContent>
      </Tabs>

      <KpiExplanationDialog open={kpiDialogOpen} onOpenChange={setKpiDialogOpen} kpiType={kpiType} />
    </div>
  );
}
