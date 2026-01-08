import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, BarChart3, List, Building2, RefreshCw } from "lucide-react";
import { useGirosGratis } from "@/hooks/useGirosGratis";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod } from "./StandardTimeFilter";
import { DateRange } from "react-day-picker";
import {
  GiroGratisDialog,
  GirosGratisKPIs,
  GirosGratisChart,
  GirosGratisPorBookmaker,
  GirosGratisList,
} from "./giros-gratis";
import { GiroGratisComBookmaker, GiroGratisFormData } from "@/types/girosGratis";

interface ProjetoGirosGratisTabProps {
  projetoId: string;
}

export function ProjetoGirosGratisTab({ projetoId }: ProjetoGirosGratisTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGiro, setEditingGiro] = useState<GiroGratisComBookmaker | null>(null);
  const [activeTab, setActiveTab] = useState("visao-geral");
  const [period, setPeriod] = useState<StandardPeriodFilter>("30dias");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);

  const { formatCurrency } = useProjectCurrencyFormat(projetoId);

  // Calcular datas baseado no período
  const dateRange = useMemo(() => {
    return getDateRangeFromPeriod(period, customDateRange);
  }, [period, customDateRange]);

  const {
    giros,
    loading,
    error,
    metrics,
    porBookmaker,
    chartData,
    refresh,
    createGiro,
    updateGiro,
    deleteGiro,
  } = useGirosGratis({
    projetoId,
    dataInicio: dateRange?.start || null,
    dataFim: dateRange?.end || null,
  });

  const handleSave = async (data: GiroGratisFormData): Promise<boolean> => {
    if (editingGiro) {
      return await updateGiro(editingGiro.id, data);
    }
    return await createGiro(data);
  };

  const handleEdit = (giro: GiroGratisComBookmaker) => {
    setEditingGiro(giro);
    setDialogOpen(true);
  };

  const handleDialogClose = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      setEditingGiro(null);
    }
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
            Registre e analise o retorno de giros promocionais
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Registro
          </Button>
        </div>
      </div>

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
            Registros
          </TabsTrigger>
          <TabsTrigger value="por-casa" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Por Casa
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
            onEdit={handleEdit}
            onDelete={deleteGiro}
          />
        </TabsContent>

        <TabsContent value="por-casa" className="mt-4">
          <GirosGratisPorBookmaker data={porBookmaker} formatCurrency={formatCurrency} />
        </TabsContent>
      </Tabs>

      {/* Dialog de criação/edição */}
      <GiroGratisDialog
        open={dialogOpen}
        onOpenChange={handleDialogClose}
        projetoId={projetoId}
        giro={editingGiro}
        onSave={handleSave}
      />
    </div>
  );
}
