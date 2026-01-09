import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, AlertTriangle, ChevronRight, Building2 } from "lucide-react";
import { GirosDisponiveisMetrics } from "@/types/girosGratisDisponiveis";

interface GirosAtivosCardProps {
  metrics: GirosDisponiveisMetrics;
  formatCurrency: (value: number) => string;
  onViewDetails: () => void;
}

export function GirosAtivosCard({
  metrics,
  formatCurrency,
  onViewDetails,
}: GirosAtivosCardProps) {
  const hasDisponiveis = metrics.totalDisponiveis > 0;
  const hasExpiringWarning = metrics.girosProximosExpirar > 0;

  if (!hasDisponiveis) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-muted">
              <Gift className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Nenhum giro ativo</p>
              <p className="text-xs text-muted-foreground/70">Adicione uma promoção para começar</p>
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
              <Gift className="h-5 w-5 text-primary" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Giros Ativos</span>
                {hasExpiringWarning && (
                  <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-4 mt-0.5">
                <span className="text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{metrics.totalDisponiveis}</span> promoções
                </span>
                <span className="text-xs text-muted-foreground hidden sm:inline-flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {metrics.casasComGiros} casas
                </span>
              </div>
            </div>
          </div>

          {/* Lado direito - Valor e ação */}
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-muted-foreground">Valor estimado</p>
              <p className="text-lg font-bold text-primary">
                {formatCurrency(metrics.valorTotalDisponivel)}
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

        {/* Alerta de expiração - só aparece se houver */}
        {hasExpiringWarning && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-warning/10 border border-warning/20 text-xs">
            <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
            <span className="text-warning-foreground">
              {metrics.girosProximosExpirar} promoção(ões) expirando em breve
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
