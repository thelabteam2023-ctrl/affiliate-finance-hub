import { AlertTriangle, ChevronDown, ChevronUp, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface ContaminatedBookmaker {
  id: string;
  nome: string;
  estrategias: string[];
  totalApostas: number;
}

interface FreebetContaminationAlertProps {
  isContaminated: boolean;
  contaminatedBookmakers: ContaminatedBookmaker[];
  totalContaminatedBets: number;
  estrategiasEncontradas: string[];
}

const ESTRATEGIA_LABELS: Record<string, string> = {
  SUREBET: "Surebet",
  VALUEBET: "Valuebet",
  PUNTER: "Punter",
  DUPLO_GREEN: "Duplo Green",
  TRADING: "Trading",
  QUALIFICADORA_BONUS: "Qualificadora Bonus",
  EXTRACAO_BONUS: "Extração Bonus",
};

export function FreebetContaminationAlert({
  isContaminated,
  contaminatedBookmakers,
  totalContaminatedBets,
  estrategiasEncontradas,
}: FreebetContaminationAlertProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isContaminated) return null;

  return (
    <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10">
      <AlertTriangle className="h-4 w-4 text-amber-500" />
      <AlertTitle className="text-amber-500 flex items-center gap-2">
        Dados Misturados Detectados
        <Badge variant="outline" className="text-amber-500 border-amber-500/50">
          {totalContaminatedBets} aposta{totalContaminatedBets > 1 ? "s" : ""}
        </Badge>
      </AlertTitle>
      <AlertDescription className="text-amber-200/80 space-y-3">
        <p>
          Encontramos apostas usando saldo de freebet com estratégias diferentes de "Extração Freebet".
          Isso pode distorcer as métricas desta aba.
        </p>

        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">Estratégias encontradas:</span>
          {estrategiasEncontradas.map((estrategia) => (
            <Badge
              key={estrategia}
              variant="outline"
              className="text-xs border-amber-500/30 text-amber-400"
            >
              {ESTRATEGIA_LABELS[estrategia] || estrategia}
            </Badge>
          ))}
        </div>

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-between text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 p-2 h-auto"
            >
              <span className="text-xs">
                Ver casas afetadas ({contaminatedBookmakers.length})
              </span>
              {isOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {contaminatedBookmakers.map((bk) => (
                <div
                  key={bk.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-amber-500/5 border border-amber-500/20"
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{bk.nome}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {bk.estrategias.map((e) => (
                        <Badge
                          key={e}
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {ESTRATEGIA_LABELS[e] || e}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-amber-400 border-amber-500/30">
                    {bk.totalApostas} aposta{bk.totalApostas > 1 ? "s" : ""}
                  </Badge>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex items-start gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 mt-3">
          <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-300">
            <strong>Recomendação:</strong> Para operações de matched betting com freebet, 
            use a estratégia "Extração Freebet" para manter as métricas precisas.
          </p>
        </div>
      </AlertDescription>
    </Alert>
  );
}
