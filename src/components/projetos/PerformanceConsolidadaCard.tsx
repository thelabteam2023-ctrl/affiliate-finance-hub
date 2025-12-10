import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePerformanceConsolidada } from "@/hooks/usePerformanceConsolidada";
import { PeriodoAnalise } from "@/types/performance";
import { 
  TrendingUp, 
  TrendingDown, 
  Building2, 
  Users, 
  BarChart3,
  Wallet,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

interface PerformanceConsolidadaCardProps {
  periodo: PeriodoAnalise;
}

function KpiMini({ 
  icon, 
  label, 
  value, 
  valueClass = "",
  subValue
}: { 
  icon: React.ReactNode; 
  label: string; 
  value: string;
  valueClass?: string;
  subValue?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="h-4 w-4">{icon}</span>
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className={`text-lg font-bold font-mono ${valueClass}`}>{value}</span>
      {subValue && (
        <span className="text-xs text-muted-foreground">{subValue}</span>
      )}
    </div>
  );
}

function CardSkeleton() {
  return (
    <Card className="mb-4 border-primary/20">
      <CardHeader className="pb-2">
        <Skeleton className="h-6 w-64" />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function PerformanceConsolidadaCard({ periodo }: PerformanceConsolidadaCardProps) {
  const { consolidada, loading } = usePerformanceConsolidada(periodo);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { 
      style: "currency", 
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  if (loading) return <CardSkeleton />;
  if (!consolidada) return null;

  const isPositive = consolidada.lucroTotal >= 0;
  const roiPositive = consolidada.roi !== null && consolidada.roi >= 0;

  return (
    <Card className="mb-4 border-primary/20 bg-card/50 backdrop-blur">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5 text-primary" />
          Performance Consolidada
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Saldo Total Bookmakers */}
          <KpiMini 
            icon={<Building2 className="h-4 w-4" />} 
            label="Saldo Bookmakers" 
            value={formatCurrency(consolidada.saldoFinal)} 
          />
          
          {/* Lucro do Período */}
          <KpiMini 
            icon={isPositive 
              ? <TrendingUp className="h-4 w-4 text-emerald-500" /> 
              : <TrendingDown className="h-4 w-4 text-red-500" />
            } 
            label="Lucro Operacional" 
            value={`${isPositive ? '+' : ''}${formatCurrency(consolidada.lucroTotal)}`}
            valueClass={isPositive ? 'text-emerald-500' : 'text-red-500'}
          />
          
          {/* ROI */}
          <KpiMini 
            icon={roiPositive 
              ? <ArrowUpRight className="h-4 w-4 text-emerald-500" />
              : <ArrowDownRight className="h-4 w-4 text-red-500" />
            } 
            label="ROI" 
            value={consolidada.roi !== null ? `${consolidada.roi.toFixed(2)}%` : '—'}
            valueClass={roiPositive ? 'text-emerald-500' : consolidada.roi !== null ? 'text-red-500' : ''}
          />
          
          {/* Projetos Ativos */}
          <KpiMini 
            icon={<Wallet className="h-4 w-4" />} 
            label="Projetos Ativos" 
            value={`${consolidada.projetosAtivos}`}
            subValue={`de ${consolidada.totalProjetos} total`}
          />
          
          {/* Total Bookmakers */}
          <KpiMini 
            icon={<Building2 className="h-4 w-4" />} 
            label="Bookmakers" 
            value={String(consolidada.totalBookmakers)} 
          />
          
          {/* Operadores */}
          <KpiMini 
            icon={<Users className="h-4 w-4" />} 
            label="Operadores Ativos" 
            value={String(consolidada.totalOperadores)} 
          />
        </div>
      </CardContent>
    </Card>
  );
}
