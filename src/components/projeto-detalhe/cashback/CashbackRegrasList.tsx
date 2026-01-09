import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  RotateCcw, 
  Building2, 
  Percent, 
  ChevronRight,
  TrendingDown,
  BarChart3,
  Pause,
  XCircle
} from "lucide-react";
import { CashbackRegraComBookmaker } from "@/types/cashback";
import { cn } from "@/lib/utils";

interface CashbackRegrasListProps {
  regras: CashbackRegraComBookmaker[];
  formatCurrency: (value: number) => string;
  onViewDetails: (regra: CashbackRegraComBookmaker) => void;
  onEdit: (regra: CashbackRegraComBookmaker) => void;
}

const statusConfig = {
  ativo: { label: "Ativo", variant: "default" as const, className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  pausado: { label: "Pausado", variant: "secondary" as const, className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  encerrado: { label: "Encerrado", variant: "outline" as const, className: "bg-muted text-muted-foreground border-border" },
};

const tipoConfig = {
  sobre_perda: { label: "Sobre Perda", icon: TrendingDown },
  sobre_volume: { label: "Sobre Volume", icon: BarChart3 },
};

const categoriaConfig = {
  promocional: "Promocional",
  permanente: "Permanente",
  estrategia: "Estratégia",
};

export function CashbackRegrasList({
  regras,
  formatCurrency,
  onViewDetails,
  onEdit,
}: CashbackRegrasListProps) {
  if (regras.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8">
          <div className="text-center">
            <RotateCcw className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhuma regra de cashback cadastrada
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Configure sua primeira regra para começar
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {regras.map((regra) => {
        const status = statusConfig[regra.status];
        const tipo = tipoConfig[regra.tipo];
        const TipoIcon = tipo.icon;

        return (
          <Card 
            key={regra.id} 
            className={cn(
              "transition-colors hover:border-primary/30",
              regra.status === 'encerrado' && "opacity-60"
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                {/* Info principal */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                    <RotateCcw className="h-4 w-4 text-primary" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {/* Nome e Casa */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold truncate">{regra.nome}</h3>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        <Building2 className="h-2.5 w-2.5 mr-1" />
                        {regra.bookmaker?.nome || "Casa"}
                      </Badge>
                    </div>
                    
                    {/* Detalhes */}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <TipoIcon className="h-3 w-3" />
                        {tipo.label}
                      </span>
                      <span className="flex items-center gap-1">
                        <Percent className="h-3 w-3" />
                        {regra.percentual}%
                      </span>
                      {regra.limite_maximo && (
                        <span>
                          Limite: {formatCurrency(regra.limite_maximo)}
                        </span>
                      )}
                      <span className="text-muted-foreground/70">
                        {categoriaConfig[regra.categoria]}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Status e Ação */}
                <div className="flex items-center gap-2">
                  <Badge className={cn("text-[10px]", status.className)}>
                    {regra.status === 'pausado' && <Pause className="h-2.5 w-2.5 mr-1" />}
                    {regra.status === 'encerrado' && <XCircle className="h-2.5 w-2.5 mr-1" />}
                    {status.label}
                  </Badge>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => regra.status === 'encerrado' ? onViewDetails(regra) : onEdit(regra)}
                  >
                    {regra.status === 'encerrado' ? 'Ver histórico' : 'Editar'}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
