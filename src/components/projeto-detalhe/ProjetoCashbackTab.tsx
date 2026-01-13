import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, List, Building2, RefreshCw, DollarSign } from "lucide-react";
import { useProjectCurrencyFormat } from "@/hooks/useProjectCurrencyFormat";
import { useCashbackManual } from "@/hooks/useCashbackManual";
import { StandardTimeFilter, StandardPeriodFilter, getDateRangeFromPeriod } from "./StandardTimeFilter";
import { DateRange } from "react-day-picker";
import {
  CashbackManualDialog,
  CashbackManualList,
  CashbackManualKPIs,
  CashbackManualPorCasa,
} from "./cashback";
import { CashbackManualFormData } from "@/types/cashback-manual";

interface ProjetoCashbackTabProps {
  projetoId: string;
}

export function ProjetoCashbackTab({ projetoId }: ProjetoCashbackTabProps) {
  // Estados para dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  
  // Estados gerais
  const [activeTab, setActiveTab] = useState("lancamentos");
  const [period, setPeriod] = useState<StandardPeriodFilter>("30dias");
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);

  const { formatCurrency } = useProjectCurrencyFormat();

  // Calcular datas baseado no período
  const dateRange = useMemo(() => {
    return getDateRangeFromPeriod(period, customDateRange);
  }, [period, customDateRange]);

  // Hook para cashback manual
  const {
    registros,
    metrics,
    porBookmaker,
    loading,
    refresh,
    criarCashback,
    deletarCashback,
  } = useCashbackManual({
    projetoId,
    dataInicio: dateRange?.start,
    dataFim: dateRange?.end,
  });

  // Handler para salvar
  const handleSaveCashback = async (data: CashbackManualFormData): Promise<boolean> => {
    return await criarCashback(data);
  };

  if (loading && registros.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Cashback</h2>
          <p className="text-sm text-muted-foreground">
            Lance cashbacks recebidos e acompanhe os retornos
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
          <Button onClick={() => setDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Lançar Cashback
          </Button>
        </div>
      </div>

      {/* Card Principal - Total Recebido */}
      <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20">
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/20">
              <DollarSign className="h-6 w-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Recebido no Período</p>
              <p className="text-3xl font-bold text-emerald-500">
                {formatCurrency(metrics.totalRecebido)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filtro de tempo */}
      <StandardTimeFilter
        period={period}
        onPeriodChange={setPeriod}
        customDateRange={customDateRange}
        onCustomDateRangeChange={setCustomDateRange}
      />

      {/* KPIs */}
      <CashbackManualKPIs metrics={metrics} formatCurrency={formatCurrency} />

      {/* Navegação por Sub-abas */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          <TabsTrigger value="lancamentos" className="text-xs px-3">
            <List className="h-3.5 w-3.5 mr-1.5" />
            Lançamentos
          </TabsTrigger>
          <TabsTrigger value="por-casa" className="text-xs px-3">
            <Building2 className="h-3.5 w-3.5 mr-1.5" />
            Por Casa
          </TabsTrigger>
        </TabsList>

        {/* Tab: Lançamentos */}
        <TabsContent value="lancamentos" className="space-y-5 mt-4">
          <CashbackManualList
            registros={registros}
            formatCurrency={formatCurrency}
            onDelete={deletarCashback}
            loading={loading}
          />
        </TabsContent>

        {/* Tab: Por Casa */}
        <TabsContent value="por-casa" className="mt-4">
          <CashbackManualPorCasa
            data={porBookmaker}
            formatCurrency={formatCurrency}
          />
        </TabsContent>
      </Tabs>

      {/* Dialog de lançamento */}
      <CashbackManualDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        projetoId={projetoId}
        onSave={handleSaveCashback}
      />
    </div>
  );
}
