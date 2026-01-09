import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gift, Clock, AlertTriangle, ChevronRight } from "lucide-react";
import { GirosDisponiveisMetrics } from "@/types/girosGratisDisponiveis";

interface GirosDisponiveisCardProps {
  metrics: GirosDisponiveisMetrics;
  formatCurrency: (value: number) => string;
  onViewAll: () => void;
  onAddNew: () => void;
}

export function GirosDisponiveisCard({
  metrics,
  formatCurrency,
  onViewAll,
  onAddNew,
}: GirosDisponiveisCardProps) {
  const hasDisponiveis = metrics.totalDisponiveis > 0;
  const hasExpiringWarning = metrics.girosProximosExpirar > 0;

  if (!hasDisponiveis) {
    return null;
  }

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          Giros Disponíveis
          <Badge variant="default" className="ml-auto">
            {metrics.totalDisponiveis}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Valor total</span>
          <span className="font-semibold text-lg">
            {formatCurrency(metrics.valorTotalDisponivel)}
          </span>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Casas com promoções</span>
          <span>{metrics.casasComGiros}</span>
        </div>

        {hasExpiringWarning && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/30 text-sm">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            <span className="text-warning-foreground">
              {metrics.girosProximosExpirar} promoção(ões) expirando em breve!
            </span>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={onViewAll}
          >
            Ver todas
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
          <Button 
            size="sm" 
            className="flex-1"
            onClick={onAddNew}
          >
            Nova promoção
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
