import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, BarChart3, List, RefreshCw, Gift, History } from "lucide-react";
import { useGirosGratis } from "@/hooks/useGirosGratis";
import { useGirosDisponiveis } from "@/hooks/useGirosDisponiveis";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod } from "./StandardTimeFilter";
import { DateRange } from "react-day-picker";
import {
  GiroGratisDialog,
  GirosGratisChart,
  GirosGratisPorBookmaker,
  GirosGratisList,
  GiroDisponivelDialog,
  UsarPromocaoSheet,
} from "./giros-gratis";
import { GirosAtivosCard } from "./giros-gratis/GirosAtivosCard";
import { GirosGratisKPIsCompact } from "./giros-gratis/GirosGratisKPIsCompact";
import { PromocoesAtivasList } from "./giros-gratis/PromocoesAtivasList";
import { GiroGratisComBookmaker, GiroGratisFormData } from "@/types/girosGratis";
import { GiroDisponivelComBookmaker, GiroDisponivelFormData } from "@/types/girosGratisDisponiveis";

interface ProjetoGirosGratisTabProps {
  projetoId: string;
}

export function ProjetoGirosGratisTab({ projetoId }: ProjetoGirosGratisTabProps) {
  // Estados para dialog de resultado
  const [resultadoDialogOpen, setResultadoDialogOpen] = useState(false);
  const [editingGiro, setEditingGiro] = useState<GiroGratisComBookmaker | null>(null);
  
  // Estados para dialog de disponível
  const [disponivelDialogOpen, setDisponivelDialogOpen] = useState(false);
  const [editingDisponivel, setEditingDisponivel] = useState<GiroDisponivelComBookmaker | null>(null);
  
  // Estado para sheet de usar promoção
  const [usarSheetOpen, setUsarSheetOpen] = useState(false);
  const [usandoDisponivel, setUsandoDisponivel] = useState<GiroDisponivelComBookmaker | null>(null);
  
  // Estados gerais
  const [activeTab, setActiveTab] = useState("resumo");
  const [period, setPeriod] = useState<StandardPeriodFilter>("mes_atual");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [showHistorico, setShowHistorico] = useState(false);

  const { formatCurrency: formatCurrencyBase } = useProjectCurrencyFormat();

  // Calcular datas baseado no período
  const dateRange = useMemo(() => {
    return getDateRangeFromPeriod(period, customDateRange);
  }, [period, customDateRange]);

  // Hook para giros grátis (resultados)
  const {
    giros,
    loading: loadingGiros,
    metrics,
    porBookmaker,
    chartData,
    refresh: refreshGiros,
    createGiro,
    updateGiro,
    deleteGiro,
    moedaConsolidacao,
    cotacaoInfo,
  } = useGirosGratis({
    projetoId,
    dataInicio: dateRange?.start || null,
    dataFim: dateRange?.end || null,
  });

  // Formatador que usa a moeda de consolidação do projeto
  const formatCurrency = useCallback((valor: number) => {
    return formatCurrencyBase(valor, moedaConsolidacao || "BRL");
  }, [formatCurrencyBase, moedaConsolidacao]);

  // Hook para giros disponíveis (promoções pendentes)
  const {
    girosDisponiveis,
    giros: todosGirosDisponiveis,
    loading: loadingDisponiveis,
    metrics: metricsDisponiveis,
    refresh: refreshDisponiveis,
    createGiro: createDisponivel,
    updateGiro: updateDisponivel,
    marcarComoUtilizado,
    marcarComoExpirado,
    cancelarGiro: cancelarDisponivel,
  } = useGirosDisponiveis({ projetoId });

  const loading = loadingGiros || loadingDisponiveis;

  // Handlers para resultados
  const handleSaveResultado = async (data: GiroGratisFormData): Promise<boolean> => {
    if (editingGiro) {
      return await updateGiro(editingGiro.id, data);
    }
    
    const giroId = await createGiro(data);
    return !!giroId;
  };

  // Handler para confirmar utilização de promoção via Sheet
  const handleConfirmarUtilizacao = async (
    valorRetorno: number, 
    dataRegistro: Date, 
    observacoes?: string
  ): Promise<boolean> => {
    if (!usandoDisponivel) return false;

    const giroData: GiroGratisFormData = {
      bookmaker_id: usandoDisponivel.bookmaker_id,
      modo: "simples",
      data_registro: dataRegistro,
      valor_retorno: valorRetorno,
      observacoes,
      giro_disponivel_id: usandoDisponivel.id,
    };

    const giroId = await createGiro(giroData);
    
    if (giroId) {
      await marcarComoUtilizado(usandoDisponivel.id, giroId);
      setUsandoDisponivel(null);
      return true;
    }
    
    return false;
  };

  const handleEditResultado = (giro: GiroGratisComBookmaker) => {
    setEditingGiro(giro);
    setResultadoDialogOpen(true);
  };

  const handleResultadoDialogClose = (open: boolean) => {
    setResultadoDialogOpen(open);
    if (!open) {
      setEditingGiro(null);
      setUsandoDisponivel(null);
    }
  };

  // Handlers para disponíveis
  const handleSaveDisponivel = async (data: GiroDisponivelFormData): Promise<boolean> => {
    if (editingDisponivel) {
      return await updateDisponivel(editingDisponivel.id, data);
    }
    return await createDisponivel(data);
  };

  // Handler para lançamento rápido (giro já utilizado - vai direto para resultados)
  const handleSaveRapido = async (data: { 
    bookmaker_id: string; 
    valor_retorno: number; 
    data_registro: Date; 
    observacoes?: string 
  }): Promise<boolean> => {
    const giroData: GiroGratisFormData = {
      bookmaker_id: data.bookmaker_id,
      modo: "simples",
      data_registro: data.data_registro,
      valor_retorno: data.valor_retorno,
      observacoes: data.observacoes,
    };
    const giroId = await createGiro(giroData);
    return !!giroId;
  };

  const handleEditDisponivel = (giro: GiroDisponivelComBookmaker) => {
    setEditingDisponivel(giro);
    setDisponivelDialogOpen(true);
  };

  const handleDisponivelDialogClose = (open: boolean) => {
    setDisponivelDialogOpen(open);
    if (!open) {
      setEditingDisponivel(null);
    }
  };

  const handleUsarDisponivel = (giro: GiroDisponivelComBookmaker) => {
    setUsandoDisponivel(giro);
    setUsarSheetOpen(true);
  };

  const handleUsarSheetClose = (open: boolean) => {
    setUsarSheetOpen(open);
    if (!open) {
      setUsandoDisponivel(null);
    }
  };

  const handleRefreshAll = () => {
    refreshGiros();
    refreshDisponiveis();
  };

  // Lista de promoções para exibir
  const promocoesParaExibir = showHistorico ? todosGirosDisponiveis : girosDisponiveis;

  if (loading && giros.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-20" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header - Uma única ação primária */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Giros Grátis</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie promoções e acompanhe retornos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefreshAll}
            disabled={loading}
            className="text-muted-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setDisponivelDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Promoção
          </Button>
        </div>
      </div>

      {/* Card de Status - Giros Ativos (sem ação de criação) */}
      <GirosAtivosCard
        metrics={metricsDisponiveis}
        formatCurrency={formatCurrency}
        onViewDetails={() => setActiveTab("promocoes")}
      />

      {/* Filtro de tempo */}
      <StandardTimeFilter
        period={period}
        onPeriodChange={setPeriod}
        customDateRange={customDateRange}
        onCustomDateRangeChange={setCustomDateRange}
        projetoId={projetoId}
      />

      {/* KPIs de Performance - Compactos */}
      <GirosGratisKPIsCompact metrics={metrics} formatCurrency={formatCurrency} moedaConsolidacao={moedaConsolidacao} />

      {/* Navegação por Sub-abas */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="resumo" className="text-xs px-3">
            <BarChart3 className="h-3.5 w-3.5 mr-1.5" />
            Resumo
          </TabsTrigger>
          <TabsTrigger value="resultados" className="text-xs px-3">
            <List className="h-3.5 w-3.5 mr-1.5" />
            Resultados
          </TabsTrigger>
          <TabsTrigger value="promocoes" className="text-xs px-3">
            <Gift className="h-3.5 w-3.5 mr-1.5" />
            Promoções Ativas
          </TabsTrigger>
          <TabsTrigger value="historico" className="text-xs px-3">
            <History className="h-3.5 w-3.5 mr-1.5" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* Tab: Resumo (default) */}
        <TabsContent value="resumo" className="space-y-5 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <GirosGratisChart data={chartData} formatCurrency={formatCurrency} />
            <GirosGratisPorBookmaker 
              data={porBookmaker} 
              formatCurrency={formatCurrency} 
              moedaConsolidacao={moedaConsolidacao}
            />
          </div>
        </TabsContent>

        {/* Tab: Resultados */}
        <TabsContent value="resultados" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {giros.length} resultado(s) no período
              </p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setResultadoDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                Registrar Resultado
              </Button>
            </div>
            <GirosGratisList
              giros={giros}
              formatCurrency={formatCurrency}
              onEdit={handleEditResultado}
              onDelete={deleteGiro}
            />
          </div>
        </TabsContent>

        {/* Tab: Promoções Ativas */}
        <TabsContent value="promocoes" className="mt-4">
          <PromocoesAtivasList
            giros={girosDisponiveis}
            formatCurrency={formatCurrency}
            onUsar={handleUsarDisponivel}
            onEdit={handleEditDisponivel}
            onMarcarExpirado={marcarComoExpirado}
            onCancelar={cancelarDisponivel}
          />
        </TabsContent>

        {/* Tab: Histórico */}
        <TabsContent value="historico" className="mt-4">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant={showHistorico ? "default" : "outline"}
                size="sm"
                onClick={() => setShowHistorico(!showHistorico)}
              >
                {showHistorico ? "Mostrando todas" : "Mostrar finalizadas"}
              </Button>
            </div>
            <PromocoesAtivasList
              giros={promocoesParaExibir}
              formatCurrency={formatCurrency}
              onUsar={handleUsarDisponivel}
              onEdit={handleEditDisponivel}
              onMarcarExpirado={marcarComoExpirado}
              onCancelar={cancelarDisponivel}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de criação/edição de resultado */}
      <GiroGratisDialog
        open={resultadoDialogOpen}
        onOpenChange={handleResultadoDialogClose}
        projetoId={projetoId}
        giro={editingGiro}
        onSave={handleSaveResultado}
      />

      {/* Dialog de criação/edição de disponível */}
      <GiroDisponivelDialog
        open={disponivelDialogOpen}
        onOpenChange={handleDisponivelDialogClose}
        projetoId={projetoId}
        giro={editingDisponivel}
        onSave={handleSaveDisponivel}
        onSaveRapido={handleSaveRapido}
      />

      {/* Sheet para usar promoção pendente */}
      <UsarPromocaoSheet
        open={usarSheetOpen}
        onOpenChange={handleUsarSheetClose}
        promocao={usandoDisponivel}
        onConfirm={handleConfirmarUtilizacao}
      />
    </div>
  );
}
