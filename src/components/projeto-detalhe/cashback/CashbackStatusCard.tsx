import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RotateCcw, ChevronRight, AlertTriangle, Clock } from "lucide-react";
import { CashbackMetrics } from "@/types/cashback";

interface CashbackStatusCardProps {
  metrics: CashbackMetrics;
  formatCurrency: (value: number) => string;
  onViewDetails: () => void;
}

export function CashbackStatusCard({
  metrics,
  formatCurrency,
  onViewDetails,
}: CashbackStatusCardProps) {
  const hasRegras = metrics.regrasAtivas > 0;
  const hasPendente = metrics.totalPendente > 0;

  if (!hasRegras) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-muted">
              <RotateCcw className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Nenhuma regra ativa</p>
              <p className="text-xs text-muted-foreground/70">Configure uma regra de cashback para começar</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-primary/3 to-transparent">
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          {/* Lado esquerdo - Info principal */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="p-2.5 rounded-lg bg-primary/10">
              <RotateCcw className="h-5 w-5 text-primary" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Regras Ativas</span>
                {hasPendente && (
                  <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-4 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{metrics.regrasAtivas}</span> regra(s) configurada(s)
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {metrics.totalRegistros} registros
                </span>
              </div>
            </div>
          </div>

          {/* Lado direito - Valor e ação */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">Pendente</p>
              <p className="text-lg font-bold text-amber-500">
                {formatCurrency(metrics.totalPendente)}
              </p>
            </div>
            
            <Button 
              variant="ghost" 
              size="sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={onViewDetails}
            >
              Ver detalhes
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>

        {/* Alerta de pendente - só aparece se houver */}
        {hasPendente && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <span className="text-amber-200">
              {formatCurrency(metrics.totalPendente)} em cashback aguardando confirmação
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
