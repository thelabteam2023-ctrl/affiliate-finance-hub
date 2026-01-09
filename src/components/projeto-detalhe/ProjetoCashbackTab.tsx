import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, BarChart3, List, Building2, RefreshCw, History, RotateCcw } from "lucide-react";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod } from "./StandardTimeFilter";
import { DateRange } from "react-day-picker";
import {
  CashbackKPIsCompact,
  CashbackStatusCard,
  CashbackRegrasList,
  CashbackRegistrosList,
  CashbackPorCasaSection,
  CashbackRegraDialog,
} from "./cashback";
import { 
  CashbackMetrics, 
  CashbackRegraComBookmaker, 
  CashbackRegistroComDetalhes, 
  CashbackPorBookmaker,
  CashbackRegraFormData
} from "@/types/cashback";
import { toast } from "sonner";

interface ProjetoCashbackTabProps {
  projetoId: string;
}

// TODO: Substituir por hook real quando tabela for criada
function useCashbackMock(projetoId: string) {
  const [loading, setLoading] = useState(false);
  
  // Dados mock para demonstração
  const regras: CashbackRegraComBookmaker[] = [];
  const registros: CashbackRegistroComDetalhes[] = [];
  const porBookmaker: CashbackPorBookmaker[] = [];
  
  const metrics: CashbackMetrics = {
    totalRecebido: 0,
    totalPendente: 0,
    volumeElegivel: 0,
    percentualMedioRetorno: 0,
    totalRegistros: 0,
    regrasAtivas: regras.filter(r => r.status === 'ativo').length,
  };

  const refresh = useCallback(() => {
    setLoading(true);
    setTimeout(() => setLoading(false), 500);
  }, []);

  const createRegra = useCallback(async (data: CashbackRegraFormData): Promise<boolean> => {
    // TODO: Implementar criação real
    toast.info("Funcionalidade de criação será implementada após criação da tabela");
    return false;
  }, []);

  const updateRegra = useCallback(async (id: string, data: CashbackRegraFormData): Promise<boolean> => {
    // TODO: Implementar atualização real
    toast.info("Funcionalidade de edição será implementada após criação da tabela");
    return false;
  }, []);

  return {
    regras,
    registros,
    metrics,
    porBookmaker,
    loading,
    refresh,
    createRegra,
    updateRegra,
  };
}

export function ProjetoCashbackTab({ projetoId }: ProjetoCashbackTabProps) {
  // Estados para dialog
  const [regraDialogOpen, setRegraDialogOpen] = useState(false);
  const [editingRegra, setEditingRegra] = useState<CashbackRegraComBookmaker | null>(null);
  
  // Estados gerais
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [period, setPeriod] = useState<StandardPeriodFilter>("30dias");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);

  const { formatCurrency } = useProjectCurrencyFormat();

  // Calcular datas baseado no período
  const dateRange = useMemo(() => {
    return getDateRangeFromPeriod(period, customDateRange);
  }, [period, customDateRange]);

  // Hook para cashback (mock por enquanto)
  const {
    regras,
    registros,
    metrics,
    porBookmaker,
    loading,
    refresh,
    createRegra,
    updateRegra,
  } = useCashbackMock(projetoId);

  // Handlers
  const handleSaveRegra = async (data: CashbackRegraFormData): Promise<boolean> => {
    if (editingRegra) {
      return await updateRegra(editingRegra.id, data);
    }
    return await createRegra(data);
  };

  const handleEditRegra = (regra: CashbackRegraComBookmaker) => {
    setEditingRegra(regra);
    setRegraDialogOpen(true);
  };

  const handleViewDetails = (regra: CashbackRegraComBookmaker) => {
    // TODO: Implementar visualização de detalhes
    toast.info("Visualização de detalhes será implementada");
  };

  const handleRegraDialogClose = (open: boolean) => {
    setRegraDialogOpen(open);
    if (!open) {
      setEditingRegra(null);
    }
  };

  const handleViewRegistroDetails = (registro: CashbackRegistroComDetalhes) => {
    // TODO: Implementar visualização de detalhes do registro
    toast.info("Visualização de detalhes será implementada");
  };

  const handleConfirmRegistro = (registro: CashbackRegistroComDetalhes) => {
    // TODO: Implementar confirmação de recebimento
    toast.info("Confirmação de recebimento será implementada");
  };

  if (loading && regras.length === 0) {
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
          <h2 className="text-lg font-semibold">Cashback</h2>
          <p className="text-sm text-muted-foreground">
            Gerencie regras e acompanhe retornos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={refresh}
            disabled={loading}
            className="text-muted-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setRegraDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Cashback
          </Button>
        </div>
      </div>

      {/* Card de Status - Regras Ativas */}
      <CashbackStatusCard
        metrics={metrics}
        formatCurrency={formatCurrency}
        onViewDetails={() => setActiveTab("visao-geral")}
      />

      {/* Filtro de tempo */}
      <StandardTimeFilter
        period={period}
        onPeriodChange={setPeriod}
        customDateRange={customDateRange}
        onCustomDateRangeChange={setCustomDateRange}
      />

      {/* KPIs de Performance - Compactos */}
      <CashbackKPIsCompact metrics={metrics} formatCurrency={formatCurrency} />

      {/* Navegação por Sub-abas */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="visao-geral" className="text-xs px-3">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Visão Geral
          </TabsTrigger>
          <TabsTrigger value="registros" className="text-xs px-3">
            <List className="h-3.5 w-3.5 mr-1.5" />
            Registros
          </TabsTrigger>
          <TabsTrigger value="por-casa" className="text-xs px-3">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />
            Por Casa
          </TabsTrigger>
          <TabsTrigger value="historico" className="text-xs px-3">
            <History className="h-3.5 w-3.5 mr-1.5" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* Tab: Visão Geral (default) - Lista de Regras */}
        <TabsContent value="visao-geral" className="space-y-5 mt-4">
          <CashbackRegrasList
            regras={regras.filter(r => r.status !== 'encerrado')}
            formatCurrency={formatCurrency}
            onViewDetails={handleViewDetails}
            onEdit={handleEditRegra}
          />
        </TabsContent>

        {/* Tab: Registros */}
        <TabsContent value="registros" className="mt-4">
          <CashbackRegistrosList
            registros={registros}
            formatCurrency={formatCurrency}
            onViewDetails={handleViewRegistroDetails}
            onConfirm={handleConfirmRegistro}
          />
        </TabsContent>

        {/* Tab: Por Casa */}
        <TabsContent value="por-casa" className="mt-4">
          <CashbackPorCasaSection
            data={porBookmaker}
            formatCurrency={formatCurrency}
          />
        </TabsContent>

        {/* Tab: Histórico */}
        <TabsContent value="historico" className="mt-4">
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Regras encerradas
            </p>
            <CashbackRegrasList
              regras={regras.filter(r => r.status === 'encerrado')}
              formatCurrency={formatCurrency}
              onViewDetails={handleViewDetails}
              onEdit={handleEditRegra}
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de criação/edição de regra */}
      <CashbackRegraDialog
        open={regraDialogOpen}
        onOpenChange={handleRegraDialogClose}
        projetoId={projetoId}
        regra={editingRegra}
        onSave={handleSaveRegra}
      />
    </div>
  );
}
