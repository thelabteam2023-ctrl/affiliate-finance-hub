import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, BarChart3, List, Building2, RefreshCw, Gift, History } from "lucide-react";
import { useGirosGratis } from "@/hooks/useGirosGratis";
import { useGirosDisponiveis } from "@/hooks/useGirosDisponiveis";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod } from "./StandardTimeFilter";
import { DateRange } from "react-day-picker";
import {
  GiroGratisDialog,
  GirosGratisKPIs,
  GirosGratisChart,
  GirosGratisPorBookmaker,
  GirosGratisList,
  GiroDisponivelDialog,
  GirosDisponiveisCard,
  GirosDisponiveisList,
} from "./giros-gratis";
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
  const [usandoDisponivel, setUsandoDisponivel] = useState<GiroDisponivelComBookmaker | null>(null);
  
  // Estados gerais
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [period, setPeriod] = useState<StandardPeriodFilter>("30dias");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [showAllDisponiveis, setShowAllDisponiveis] = useState(false);

  const { formatCurrency } = useProjectCurrencyFormat();

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
  } = useGirosGratis({
    projetoId,
    dataInicio: dateRange?.start || null,
    dataFim: dateRange?.end || null,
  });

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
    let success: boolean;
    if (editingGiro) {
      success = await updateGiro(editingGiro.id, data);
    } else {
      success = await createGiro(data);
    }
    
    // Se estava usando uma promoção disponível, marcar como utilizada
    if (success && usandoDisponivel) {
      // Buscar o ID do giro criado seria ideal, mas por simplicidade
      // vamos apenas atualizar o status
      await marcarComoUtilizado(usandoDisponivel.id, "");
      setUsandoDisponivel(null);
    }
    
    return success;
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
    // Ao clicar em "Usar", abrir o dialog de resultado pré-preenchido
    setUsandoDisponivel(giro);
    setEditingGiro(null);
    setResultadoDialogOpen(true);
  };

  const handleRefreshAll = () => {
    refreshGiros();
    refreshDisponiveis();
  };

  if (loading && giros.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Giros Grátis</h2>
          <p className="text-sm text-muted-foreground">
            Registre promoções e analise o retorno de giros grátis
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefreshAll}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button 
            variant="outline"
            onClick={() => setDisponivelDialogOpen(true)}
          >
            <Gift className="h-4 w-4 mr-2" />
            Nova Promoção
          </Button>
          <Button onClick={() => setResultadoDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Resultado
          </Button>
        </div>
      </div>

      {/* Card de Giros Disponíveis (destaque) */}
      <GirosDisponiveisCard
        metrics={metricsDisponiveis}
        formatCurrency={formatCurrency}
        onViewAll={() => setActiveTab("disponiveis")}
        onAddNew={() => setDisponivelDialogOpen(true)}
      />

      {/* Filtro de tempo */}
      <StandardTimeFilter
        period={period}
        onPeriodChange={setPeriod}
        customDateRange={customDateRange}
        onCustomDateRangeChange={setCustomDateRange}
      />

      {/* KPIs */}
      <GirosGratisKPIs metrics={metrics} formatCurrency={formatCurrency} />

      {/* Tabs de conteúdo */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="visao-geral" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="registros" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Resultados
          </TabsTrigger>
          <TabsTrigger value="por-casa" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Por Casa
          </TabsTrigger>
          <TabsTrigger value="disponiveis" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            Disponíveis
            {metricsDisponiveis.totalDisponiveis > 0 && (
              <Badge variant="default" className="ml-1 h-5 px-1.5 text-xs">
                {metricsDisponiveis.totalDisponiveis}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visao-geral" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <GirosGratisChart data={chartData} formatCurrency={formatCurrency} />
            <GirosGratisPorBookmaker data={porBookmaker} formatCurrency={formatCurrency} />
          </div>
        </TabsContent>

        <TabsContent value="registros" className="mt-4">
          <GirosGratisList
            giros={giros}
            formatCurrency={formatCurrency}
            onEdit={handleEditResultado}
            onDelete={deleteGiro}
          />
        </TabsContent>

        <TabsContent value="por-casa" className="mt-4">
          <GirosGratisPorBookmaker data={porBookmaker} formatCurrency={formatCurrency} />
        </TabsContent>

        <TabsContent value="disponiveis" className="mt-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant={showAllDisponiveis ? "default" : "outline"}
                size="sm"
                onClick={() => setShowAllDisponiveis(!showAllDisponiveis)}
              >
                <History className="h-4 w-4 mr-1" />
                {showAllDisponiveis ? "Mostrando todas" : "Ver histórico"}
              </Button>
            </div>
            <Button onClick={() => setDisponivelDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Promoção
            </Button>
          </div>
          <GirosDisponiveisList
            giros={showAllDisponiveis ? todosGirosDisponiveis : girosDisponiveis}
            formatCurrency={formatCurrency}
            onEdit={handleEditDisponivel}
            onUsar={handleUsarDisponivel}
            onMarcarExpirado={marcarComoExpirado}
            onCancelar={cancelarDisponivel}
            showAll={showAllDisponiveis}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog de criação/edição de resultado */}
      <GiroGratisDialog
        open={resultadoDialogOpen}
        onOpenChange={handleResultadoDialogClose}
        projetoId={projetoId}
        giro={editingGiro}
        onSave={handleSaveResultado}
        // Se estiver usando uma promoção disponível, passar para pré-preencher
        giroDisponivel={usandoDisponivel}
      />

      {/* Dialog de criação/edição de disponível */}
      <GiroDisponivelDialog
        open={disponivelDialogOpen}
        onOpenChange={handleDisponivelDialogClose}
        projetoId={projetoId}
        giro={editingDisponivel}
        onSave={handleSaveDisponivel}
      />
    </div>
  );
}
