import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, Target, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { calcularDuracaoReal, calcularMetaDiaria } from "./useCicloSorting";

interface CicloDuracaoProps {
  ciclo: {
    id: string;
    data_inicio: string;
    data_fim_prevista: string;
    data_fim_real: string | null;
    status: string;
    meta_volume: number | null;
    tipo_gatilho: string;
  };
  formatCurrency: (value: number) => string;
}

export function CicloDuracao({ ciclo, formatCurrency }: CicloDuracaoProps) {
  const duracao = calcularDuracaoReal(ciclo);
  
  const getLabel = () => {
    switch (duracao.tipo) {
      case "concluido":
        return `Concluído em ${duracao.dias} dia${duracao.dias !== 1 ? 's' : ''}`;
      case "em_andamento":
        return `${duracao.dias} dia${duracao.dias !== 1 ? 's' : ''} decorrido${duracao.dias !== 1 ? 's' : ''}`;
      case "previsto":
        return `${duracao.dias} dia${duracao.dias !== 1 ? 's' : ''} previstos`;
    }
  };
  
  const getClassName = () => {
    switch (duracao.tipo) {
      case "concluido":
        return "bg-blue-500/10 text-blue-400 border-blue-500/30";
      case "em_andamento":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
      case "previsto":
        return "bg-muted/50 text-muted-foreground border-muted";
    }
  };

  return (
    <Badge variant="outline" className={`text-xs gap-1 ${getClassName()}`}>
      <Clock className="h-3 w-3" />
      {getLabel()}
    </Badge>
  );
}

interface CicloMetaDiariaProps {
  ciclo: {
    id: string;
    data_inicio: string;
    data_fim_prevista: string;
    data_fim_real: string | null;
    status: string;
    meta_volume: number | null;
    tipo_gatilho: string;
    metrica_acumuladora: string;
  };
  valorAtual: number;
  formatCurrency: (value: number) => string;
}

export function CicloMetaDiaria({ ciclo, valorAtual, formatCurrency }: CicloMetaDiariaProps) {
  const metaDiaria = calcularMetaDiaria(ciclo, valorAtual);
  
  if (!metaDiaria) return null;
  
  // Se já atingiu a meta
  if (metaDiaria.metaDiaria <= 0) {
    return (
      <Badge variant="outline" className="text-xs gap-1 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
        <Target className="h-3 w-3" />
        Meta atingida!
      </Badge>
    );
  }
  
  const metricaLabel = ciclo.metrica_acumuladora === "LUCRO" ? "lucro" : "volume";
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`text-xs gap-1 cursor-help ${
              metaDiaria.atrasado 
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30" 
                : "bg-purple-500/10 text-purple-400 border-purple-500/30"
            }`}
          >
            <Target className="h-3 w-3" />
            {formatCurrency(metaDiaria.metaDiaria)}/dia
            {metaDiaria.atrasado && <AlertTriangle className="h-3 w-3 ml-0.5" />}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-2 text-xs">
            <p className="font-medium">Meta Diária Necessária</p>
            <div className="space-y-1">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Meta total:</span>
                <span>{formatCurrency(ciclo.meta_volume || 0)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{metricaLabel.charAt(0).toUpperCase() + metricaLabel.slice(1)} atual:</span>
                <span>{formatCurrency(valorAtual)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Falta atingir:</span>
                <span>{formatCurrency((ciclo.meta_volume || 0) - valorAtual)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Dias restantes:</span>
                <span>{metaDiaria.diasRestantes} de {metaDiaria.diasTotais}</span>
              </div>
            </div>
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2">
                {metaDiaria.projecao >= (ciclo.meta_volume || 0) ? (
                  <>
                    <TrendingUp className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-400">
                      Projeção: {formatCurrency(metaDiaria.projecao)} (no ritmo)
                    </span>
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-3 w-3 text-amber-400" />
                    <span className="text-amber-400">
                      Projeção: {formatCurrency(metaDiaria.projecao)} (abaixo)
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
