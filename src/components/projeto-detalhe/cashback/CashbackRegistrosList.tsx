import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  RotateCcw, 
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  XCircle,
  Eye
} from "lucide-react";
import { CashbackRegistroComDetalhes } from "@/types/cashback";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CashbackRegistrosListProps {
  registros: CashbackRegistroComDetalhes[];
  formatCurrency: (value: number) => string;
  onViewDetails: (registro: CashbackRegistroComDetalhes) => void;
  onConfirm?: (registro: CashbackRegistroComDetalhes) => void;
}

const statusConfig = {
  pendente: { 
    label: "Pendente", 
    icon: Clock, 
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30" 
  },
  recebido: { 
    label: "Recebido", 
    icon: CheckCircle2, 
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" 
  },
  cancelado: { 
    label: "Cancelado", 
    icon: XCircle, 
    className: "bg-red-500/20 text-red-400 border-red-500/30" 
  },
  expirado: { 
    label: "Expirado", 
    icon: XCircle, 
    className: "bg-muted text-muted-foreground border-border" 
  },
};

export function CashbackRegistrosList({
  registros,
  formatCurrency,
  onViewDetails,
  onConfirm,
}: CashbackRegistrosListProps) {
  if (registros.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8">
          <div className="text-center">
            <RotateCcw className="h-10 w-10 mx-auto text-muted-foreground/50" />
            <p className="mt-3 text-sm text-muted-foreground">
              Nenhum registro de cashback encontrado
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Os registros aparecem conforme as regras calculam elegibilidade
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {registros.map((registro) => {
        const status = statusConfig[registro.status];
        const StatusIcon = status.icon;

        return (
          <Card 
            key={registro.id} 
            className={cn(
              "transition-colors hover:border-primary/30",
              (registro.status === 'cancelado' || registro.status === 'expirado') && "opacity-60"
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                {/* Info principal */}
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={cn(
                    "p-2 rounded-lg shrink-0",
                    registro.status === 'recebido' ? "bg-emerald-500/10" : 
                    registro.status === 'pendente' ? "bg-amber-500/10" : "bg-muted"
                  )}>
                    <RotateCcw className={cn(
                      "h-4 w-4",
                      registro.status === 'recebido' ? "text-emerald-500" : 
                      registro.status === 'pendente' ? "text-amber-500" : "text-muted-foreground"
                    )} />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    {/* Nome da regra e Casa */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold truncate">
                        {registro.regra?.nome || "Cashback"}
                      </h3>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        <Building2 className="h-2.5 w-2.5 mr-1" />
                        {registro.bookmaker?.nome || "Casa"}
                      </Badge>
                    </div>
                    
                    {/* Período e valores */}
                    <div className="flex items-center gap-3 mt-1.5 flex-wrap text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(parseISO(registro.periodo_inicio), "dd/MM", { locale: ptBR })} - {format(parseISO(registro.periodo_fim), "dd/MM", { locale: ptBR })}
                      </span>
                      <span>
                        Volume: {formatCurrency(registro.volume_elegivel)}
                      </span>
                      <span>
                        {registro.percentual_aplicado}%
                      </span>
                    </div>
                  </div>
                </div>

                {/* Valor e Status */}
                <div className="flex flex-col items-end gap-2">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {registro.status === 'recebido' ? 'Recebido' : 'Calculado'}
                    </p>
                    <p className={cn(
                      "text-base font-bold",
                      registro.status === 'recebido' ? "text-emerald-500" : 
                      registro.status === 'pendente' ? "text-amber-500" : "text-muted-foreground"
                    )}>
                      {formatCurrency(registro.valor_recebido ?? registro.valor_calculado)}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Badge className={cn("text-[10px]", status.className)}>
                      <StatusIcon className="h-2.5 w-2.5 mr-1" />
                      {status.label}
                    </Badge>
                    
                    {registro.status === 'pendente' && onConfirm && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs h-7"
                        onClick={() => onConfirm(registro)}
                      >
                        Confirmar
                      </Button>
                    )}
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground h-7"
                      onClick={() => onViewDetails(registro)}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
