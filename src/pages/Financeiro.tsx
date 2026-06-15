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
import {
  DashboardPeriodFilter,
  getDashboardDateRangeAsStrings,
  getDashboardPeriodDescription,
} from "@/types/dashboardFilters";
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
import { ComposicaoCustosCard } from "@/components/financeiro/ComposicaoCustosCard";
import { HeaderKpiCard } from "@/components/financeiro/HeaderKpiCard";
import { PeriodScopeBadge } from "@/components/financeiro/PeriodScopeBadge";
import { ExposicaoFinanceiraCard } from "@/components/financeiro/ExposicaoFinanceiraCard";
import { PosicaoCapital } from "@/components/caixa/PosicaoCapital";
import { useCapitalEmDisputa } from "@/hooks/useCapitalEmDisputa";
import { Wallet, TrendingUp, Percent } from "lucide-react";
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
   const cryptoSymbols = useMemo(() => {
     const caixaCoins = finData.caixaCrypto.map(c => c.coin);
     const partnerCoins = finData.walletsDetalhadas.map(w => w.coin);
     return Array.from(new Set([...caixaCoins, ...partnerCoins])).filter(Boolean);
   }, [finData.caixaCrypto, finData.walletsDetalhadas]);
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

  // Capital em disputa (para sobreposição no donut da Posição de Capital)
  const { bySegment: capitalEmDisputa } = useCapitalEmDisputa();

  const periodBadge = (
    <PeriodScopeBadge scope="periodo" filter={periodoPreset} customRange={customRange} />
  );
  const realtimeBadge = <PeriodScopeBadge scope="atual" />;

  // Adaptadores para reutilizar <PosicaoCapital /> dentro do Financeiro
  const posicaoCapitalProps = useMemo(() => {
    const aggByMoeda = (rows: Array<{ moeda?: string | null; saldo: number }>) => {
      const m: Record<string, number> = {};
      rows.forEach(r => {
        const moeda = (r.moeda || "BRL").toUpperCase();
        m[moeda] = (m[moeda] || 0) + Math.max(0, Number(r.saldo) || 0);
      });
      return Object.entries(m).map(([moeda, saldo]) => ({ moeda, saldo }));
    };
    const saldosFiat = (finData.caixaFiat || []).map((f: any) => ({
      moeda: f.moeda || "BRL",
      saldo: Math.max(0, Number(f.saldo) || 0),
    }));
    const saldosBookmakers = aggByMoeda(
      (finData.bookmakersSaldos || []).map((b: any) => ({ moeda: b.moeda, saldo: b.saldo_atual || 0 }))
    );
    const saldosContasParceiros = aggByMoeda(
      (finData.contasParceiros || []).map((c: any) => ({ moeda: c.moeda, saldo: c.saldo || 0 }))
    );
    const saldoCaixaCrypto = (finData.caixaCrypto || []).reduce(
      (acc: number, c: any) => acc + getCryptoUSDValue(c.coin, c.saldo_coin, c.saldo_usd),
      0
    );
    const saldoWalletsParceiros = (finData.walletsParceiros || []).reduce(
      (acc: number, w: any) => acc + Math.max(0, Number(w.saldo_usd) || 0),
      0
    );
    return {
      saldosFiat,
      saldoCaixaCrypto,
      saldosBookmakers,
      saldosBroker: [] as Array<{ moeda: string; saldo: number }>,
      saldosContasParceiros,
      saldoWalletsParceiros,
    };
  }, [finData, getCryptoUSDValue]);

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
          {/* LINHA 1: Header KPIs */}
          {(() => {
            const patrimonioTotal =
              calc.saldos.capitalOperacional +
              calc.saldos.saldoBookmakers +
              calc.saldos.totalContasParceiros +
              calc.saldos.totalWalletsParceiros;
            const custoSust = calc.costs.custoSustentacao;
            const margemOp =
              lucroOperacionalApostas + custoSust > 0
                ? (lucroOperacionalApostas / (lucroOperacionalApostas + custoSust)) * 100
                : 0;
            return (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                <HeaderKpiCard
                  label="Patrimônio Total"
                  value={calc.formatCurrency(patrimonioTotal)}
                  hint="Soma consolidada (BRL) de todos os segmentos"
                  icon={<Wallet className="h-4 w-4" />}
                />
                <HeaderKpiCard
                  label="Lucro Operacional"
                  value={calc.formatCurrency(lucroOperacionalApostas)}
                  hint="Resultado das apostas no período"
                  icon={<TrendingUp className="h-4 w-4" />}
                  tone={lucroOperacionalApostas >= 0 ? "positive" : "negative"}
                  periodBadge={periodBadge}
                />
                <HeaderKpiCard
                  label="Margem Operacional"
                  value={`${margemOp.toFixed(1)}%`}
                  hint="Lucro Op. / (Lucro Op. + Custo de Sustentação)"
                  icon={<Percent className="h-4 w-4" />}
                  tone={margemOp >= 50 ? "positive" : margemOp > 0 ? "warning" : "negative"}
                  periodBadge={periodBadge}
                />
              </div>
            );
          })()}

          {/* LINHA 2: Posição de Capital (reaproveitada do Caixa Operacional) + Exposição & Perdas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
            <div className="lg:col-span-2">
              <PosicaoCapital
                saldosFiat={posicaoCapitalProps.saldosFiat}
                saldoCaixaCrypto={posicaoCapitalProps.saldoCaixaCrypto}
                saldosBookmakers={posicaoCapitalProps.saldosBookmakers}
                saldosBroker={posicaoCapitalProps.saldosBroker}
                saldosContasParceiros={posicaoCapitalProps.saldosContasParceiros}
                saldoWalletsParceiros={posicaoCapitalProps.saldoWalletsParceiros}
                cotacaoUSD={cotacaoUSD}
                capitalEmDisputa={capitalEmDisputa}
              />
            </div>
            <ExposicaoFinanceiraCard
              dataInicio={dataInicio || null}
              dataFim={dataFim || null}
              patrimonioTotal={
                calc.saldos.capitalOperacional +
                calc.saldos.saldoBookmakers +
                calc.saldos.totalContasParceiros +
                calc.saldos.totalWalletsParceiros
              }
              lucroOperacional={lucroOperacionalApostas}
              formatCurrency={calc.formatCurrency}
              periodBadge={periodBadge}
              realtimeBadge={realtimeBadge}
            />
          </div>

          {/* LINHA 3: Composição de Custos (largura total) */}
          <div className="grid grid-cols-1 gap-4 md:gap-6">
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
              periodBadge={periodBadge}
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
            contasBancarias={finData.contasDetalhadas}
            walletsCrypto={finData.walletsDetalhadas}
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
