import { useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ContaminatedBookmaker {
  id: string;
  nome: string;
  estrategias: string[];
  totalApostas: number;
}

interface BonusContaminationAlertProps {
  contaminatedBookmakers: ContaminatedBookmaker[];
  totalNonBonusBets: number;
}

const STRATEGY_LABELS: Record<string, string> = {
  SUREBET: "Surebet",
  VALUE_BET: "Value Bet",
  DUPLO_GREEN: "Duplo Green",
  FREEBET: "Freebet",
  PROTECAO: "Proteção",
  SIMPLES: "Aposta Simples",
  MULTIPLA: "Múltipla",
  EXTRACAO_BONUS: "Extração Bônus",
};

export function BonusContaminationAlert({ 
  contaminatedBookmakers, 
  totalNonBonusBets 
}: BonusContaminationAlertProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (contaminatedBookmakers.length === 0) return null;

  const getStrategyLabel = (strategy: string) => STRATEGY_LABELS[strategy] || strategy;

  return (
    <Alert className="border-amber-500/50 bg-amber-500/10">
      <AlertTriangle className="h-4 w-4 text-amber-500" />
      <AlertTitle className="text-amber-500 font-semibold flex items-center gap-2">
        Métricas com influência externa
        <Badge variant="outline" className="border-amber-500/50 text-amber-500 text-xs">
          {totalNonBonusBets} apostas
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        <p className="text-sm text-muted-foreground">
          As casas em modo bônus foram utilizadas em outras estratégias além de extração de bônus. 
          Os valores de <strong>Saldo Operável</strong> e <strong>Saldo Ajustado</strong> podem incluir 
          resultados de operações não relacionadas a bônus.
        </p>

        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-amber-500 hover:text-amber-400">
              {isOpen ? (
                <>
                  <ChevronUp className="h-3 w-3 mr-1" />
                  Ocultar detalhes
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3 mr-1" />
                  Ver casas afetadas ({contaminatedBookmakers.length})
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <div className="rounded-md bg-background/50 p-3 space-y-2">
              {contaminatedBookmakers.map((bk) => (
                <div 
                  key={bk.id} 
                  className="flex items-center justify-between gap-2 text-sm py-1 border-b border-border/50 last:border-0"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium truncate">{bk.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      ({bk.totalApostas} apostas)
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {bk.estrategias.map((est) => (
                      <Badge 
                        key={est} 
                        variant="secondary" 
                        className="text-[10px] px-1.5 py-0"
                      >
                        {getStrategyLabel(est)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-background/30 rounded-md p-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Para métricas puras de bônus, considere criar um projeto dedicado exclusivamente 
            para extração de bônus, vinculando apenas as casas que serão utilizadas nessa estratégia.
          </span>
        </div>
      </AlertDescription>
    </Alert>
  );
}
