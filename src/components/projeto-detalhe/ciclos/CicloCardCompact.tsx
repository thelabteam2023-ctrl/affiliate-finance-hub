import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, TrendingUp, TrendingDown, Target, CheckCircle2, Clock } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CicloCardCompactProps {
  ciclo: {
    id: string;
    numero_ciclo: number;
    data_inicio: string;
    data_fim_prevista: string;
    data_fim_real: string | null;
    status: string;
    tipo_gatilho: string;
    meta_volume: number | null;
    valor_acumulado: number;
    lucro_liquido: number;
    lucro_bruto: number;
    observacoes: string | null;
    metrica_acumuladora: string;
    gatilho_fechamento: string | null;
  };
  formatCurrency: (value: number) => string;
  onViewDetails: () => void;
  parseLocalDate: (dateString: string) => Date;
}

export function CicloCardCompact({ ciclo, formatCurrency, onViewDetails, parseLocalDate }: CicloCardCompactProps) {
  const getTipoGatilhoBadge = () => {
    const temDataLimite = ciclo.data_fim_prevista && ciclo.data_fim_prevista !== ciclo.data_inicio;
    const isMetaPrazo = (ciclo.tipo_gatilho === "META" || ciclo.tipo_gatilho === "VOLUME") && temDataLimite;
    
    if (isMetaPrazo) {
      return (
        <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
          <Target className="h-3 w-3 mr-1" />
          Meta + Prazo
        </Badge>
      );
    }
    
    if (ciclo.tipo_gatilho === "TEMPO") {
      return (
        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
          <Clock className="h-3 w-3 mr-1" />
          Por Prazo
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-400 border-purple-500/30">
        <Target className="h-3 w-3 mr-1" />
        Por Meta
      </Badge>
    );
  };

  const getStatusBadge = () => {
    if (ciclo.status === "FECHADO") {
      return (
        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Concluído
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-400 border-amber-500/30">
        <Clock className="h-3 w-3 mr-1" />
        Futuro
      </Badge>
    );
  };

  // Calcular meta diária para display
  const calcularMetaDiaria = () => {
    if (!ciclo.meta_volume) return null;
    const dataInicio = parseLocalDate(ciclo.data_inicio);
    const dataFim = parseLocalDate(ciclo.data_fim_prevista);
    const diasTotais = Math.ceil((dataFim.getTime() - dataInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diasTotais <= 0) return null;
    return ciclo.meta_volume / diasTotais;
  };

  const metaDiaria = calcularMetaDiaria();

  return (
    <Card className="hover:border-primary/30 transition-colors">
      <CardContent className="p-4">
        {/* Header compacto */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-sm">
              {ciclo.numero_ciclo}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm">Ciclo {ciclo.numero_ciclo}</span>
                {getTipoGatilhoBadge()}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                {format(parseLocalDate(ciclo.data_inicio), "dd/MM", { locale: ptBR })} → {format(parseLocalDate(ciclo.data_fim_prevista), "dd/MM", { locale: ptBR })}
              </div>
            </div>
          </div>
          {getStatusBadge()}
        </div>

        {/* Métricas compactas */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-muted/30 rounded-md p-2">
            <p className="text-xs text-muted-foreground">
              {ciclo.status === "FECHADO" ? "Lucro" : "Meta"}
            </p>
            {ciclo.status === "FECHADO" ? (
              <p className={`text-sm font-semibold ${ciclo.lucro_liquido >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {ciclo.lucro_liquido >= 0 ? <TrendingUp className="h-3 w-3 inline mr-0.5" /> : <TrendingDown className="h-3 w-3 inline mr-0.5" />}
                {formatCurrency(ciclo.lucro_liquido)}
              </p>
            ) : (
              <p className="text-sm font-semibold">
                {ciclo.meta_volume ? formatCurrency(ciclo.meta_volume) : "—"}
              </p>
            )}
          </div>
          <div className="bg-muted/30 rounded-md p-2">
            <p className="text-xs text-muted-foreground">
              {ciclo.status === "FECHADO" ? "Resultado" : "Meta/dia"}
            </p>
            {ciclo.status === "FECHADO" ? (
              <p className="text-sm font-medium">
                {ciclo.gatilho_fechamento === "META_ATINGIDA" ? (
                  <span className="text-emerald-400">Meta atingida</span>
                ) : ciclo.gatilho_fechamento === "PRAZO" ? (
                  <span className="text-blue-400">Por prazo</span>
                ) : (
                  <span className="text-muted-foreground">Manual</span>
                )}
              </p>
            ) : (
              <p className="text-sm font-medium text-purple-400">
                {metaDiaria ? `${formatCurrency(metaDiaria)}/dia` : "—"}
              </p>
            )}
          </div>
        </div>

        {/* Botão */}
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full text-xs"
          onClick={onViewDetails}
        >
          Ver Detalhes
        </Button>
      </CardContent>
    </Card>
  );
}
