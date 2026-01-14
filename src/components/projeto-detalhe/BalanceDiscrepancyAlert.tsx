/**
 * Componente que exibe um alerta discreto quando há discrepâncias de saldo
 * detectadas entre o saldo registrado e o calculado
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { AlertTriangle, ChevronDown, RefreshCw, Check, Loader2 } from "lucide-react";
import { useBookmakerBalanceVerification, BookmakerDiscrepancy } from "@/hooks/useBookmakerBalanceVerification";
import { cn } from "@/lib/utils";

interface BalanceDiscrepancyAlertProps {
  projetoId: string;
  formatCurrency: (value: number, moeda?: string) => string;
  onFixed?: () => void;
}

export function BalanceDiscrepancyAlert({
  projetoId,
  formatCurrency,
  onFixed,
}: BalanceDiscrepancyAlertProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  
  const {
    loading,
    discrepancies,
    hasDiscrepancies,
    totalDiscrepancy,
    checkProject,
    fixBookmaker,
    fixAllProject,
  } = useBookmakerBalanceVerification({ projetoId });

  // Verificar discrepâncias ao montar o componente
  useEffect(() => {
    checkProject();
  }, [checkProject]);

  const handleFix = async (bookmakerId: string) => {
    setFixing(bookmakerId);
    const success = await fixBookmaker(bookmakerId);
    setFixing(null);
    if (success) {
      onFixed?.();
    }
  };

  const handleFixAll = async () => {
    setFixing('all');
    const success = await fixAllProject();
    setFixing(null);
    if (success) {
      onFixed?.();
    }
  };

  // Não exibir se não houver discrepâncias
  if (!hasDiscrepancies && !loading) {
    return null;
  }

  // Loading inicial
  if (loading && discrepancies.length === 0) {
    return null; // Não mostrar nada durante a verificação inicial
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-amber-500">
                {discrepancies.length} saldo{discrepancies.length !== 1 ? 's' : ''} com discrepância
              </span>
              <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-500">
                Δ {formatCurrency(totalDiscrepancy)}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-amber-500 hover:text-amber-400 hover:bg-amber-500/10"
                      onClick={(e) => {
                        e.stopPropagation();
                        checkProject();
                      }}
                      disabled={loading}
                    >
                      <RefreshCw className={cn("h-3 w-3 mr-1", loading && "animate-spin")} />
                      Verificar
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Recalcular e verificar saldos</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <ChevronDown className={cn(
                "h-4 w-4 text-amber-500 transition-transform",
                isOpen && "rotate-180"
              )} />
            </div>
          </div>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="mt-3 pt-3 border-t border-amber-500/20">
          <div className="space-y-3">
            {discrepancies.map((d) => {
              // Use a moeda nativa do bookmaker para exibição correta
              const moedaBookmaker = d.moeda || 'BRL';
              
              return (
                <div 
                  key={d.bookmaker_id} 
                  className="py-2 px-3 rounded bg-background/50 border border-border/50"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{d.nome}</p>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {moedaBookmaker}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className={cn(
                          "text-xs",
                          d.diferenca > 0 
                            ? "text-amber-500 border-amber-500/30" 
                            : "text-red-500 border-red-500/30"
                        )}
                      >
                        Δ {d.diferenca > 0 ? '+' : ''}{formatCurrency(d.diferenca, moedaBookmaker)}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => handleFix(d.bookmaker_id)}
                        disabled={fixing !== null}
                      >
                        {fixing === d.bookmaker_id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        <span className="ml-1">Corrigir</span>
                      </Button>
                    </div>
                  </div>
                  
                  {/* Breakdown do cálculo - usando a moeda nativa */}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Depósitos:</span>
                      <span className="text-green-500">+{formatCurrency(d.depositos, moedaBookmaker)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Saques:</span>
                      <span className="text-red-500">-{formatCurrency(d.saques, moedaBookmaker)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Transf. entrada:</span>
                      <span className="text-green-500">+{formatCurrency(d.transferencias_entrada, moedaBookmaker)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Transf. saída:</span>
                      <span className="text-red-500">-{formatCurrency(d.transferencias_saida, moedaBookmaker)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Lucro apostas:</span>
                      <span className={d.lucro_apostas >= 0 ? "text-green-500" : "text-red-500"}>
                        {d.lucro_apostas >= 0 ? '+' : ''}{formatCurrency(d.lucro_apostas, moedaBookmaker)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cashback:</span>
                      <span className="text-green-500">+{formatCurrency(d.cashback, moedaBookmaker)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Giros grátis:</span>
                      <span className="text-green-500">+{formatCurrency(d.giros_gratis, moedaBookmaker)}</span>
                    </div>
                  </div>
                  
                  {/* Resultado - usando a moeda nativa */}
                  <div className="mt-2 pt-2 border-t border-border/50 flex justify-between text-xs">
                    <span>
                      <span className="text-muted-foreground">Registrado:</span>{' '}
                      <span className="font-medium">{formatCurrency(d.saldo_anterior, moedaBookmaker)}</span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Calculado:</span>{' '}
                      <span className="font-medium text-green-500">{formatCurrency(d.saldo_calculado, moedaBookmaker)}</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
          
          {discrepancies.length > 1 && (
            <div className="mt-3 pt-3 border-t border-amber-500/20 flex justify-end">
              <Button
                variant="default"
                size="sm"
                className="text-xs bg-amber-500 hover:bg-amber-600 text-white"
                onClick={handleFixAll}
                disabled={fixing !== null}
              >
                {fixing === 'all' ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Check className="h-3 w-3 mr-1" />
                )}
                Corrigir Todos
              </Button>
            </div>
          )}
          
          <p className="text-[10px] text-muted-foreground mt-2">
            Discrepâncias podem ocorrer por erros de sincronização. Corrigir irá ajustar o saldo para o valor calculado.
          </p>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
