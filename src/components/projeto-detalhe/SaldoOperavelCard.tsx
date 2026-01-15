import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Wallet } from "lucide-react";
import { useSaldoOperavel } from "@/hooks/useSaldoOperavel";
import { useProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Skeleton } from "@/components/ui/skeleton";

interface SaldoOperavelCardProps {
  projetoId: string;
  variant?: "default" | "compact";
}

/**
 * Card do KPI "Saldo Operável"
 * 
 * Definição canônica:
 * Saldo Operável = Saldo Disponível + Freebet + Bônus Creditado
 * 
 * Onde Saldo Disponível = Saldo Real - Saldo em Aposta
 * 
 * Este é o valor TOTAL disponível para apostas agora.
 */
export function SaldoOperavelCard({ projetoId, variant = "default" }: SaldoOperavelCardProps) {
  const { 
    saldoOperavel, 
    saldoReal, 
    saldoBonus, 
    saldoFreebet, 
    saldoEmAposta,
    totalCasas, 
    isLoading 
  } = useSaldoOperavel(projetoId);
  const { formatCurrency } = useProjetoCurrency(projetoId);

  if (isLoading) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
          <Skeleton className="h-4 w-24" />
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    );
  }

  // Verifica se há bônus ou freebet para mostrar breakdown detalhado
  const hasBonus = saldoBonus > 0;
  const hasFreebet = saldoFreebet > 0;
  const hasEmAposta = saldoEmAposta > 0;

  if (variant === "compact") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary/10 border border-primary/20 cursor-help">
              <Wallet className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                {formatCurrency(saldoOperavel)}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-[280px]">
            <p className="text-xs font-medium mb-2">Saldo Operável</p>
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>Saldo Real: {formatCurrency(saldoReal)}</p>
              {hasBonus && <p>Bônus Creditado: {formatCurrency(saldoBonus)}</p>}
              {hasFreebet && <p>Freebet: {formatCurrency(saldoFreebet)}</p>}
              {hasEmAposta && <p className="text-amber-400">Em Aposta: -{formatCurrency(saldoEmAposta)}</p>}
            </div>
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
              {totalCasas} casa{totalCasas !== 1 ? 's' : ''} vinculada{totalCasas !== 1 ? 's' : ''}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
          <CardTitle className="text-xs md:text-sm font-medium flex items-center gap-1.5">
            Saldo Operável
            <Tooltip>
              <TooltipTrigger asChild>
                <Wallet className="h-3.5 w-3.5 md:h-4 md:w-4 text-primary cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-[300px]">
                <p className="text-xs font-medium mb-2">Composição do Saldo</p>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Saldo Real:</span>
                    <span>{formatCurrency(saldoReal)}</span>
                  </div>
                  {hasBonus && (
                    <div className="flex justify-between">
                      <span className="text-yellow-400">+ Bônus Creditado:</span>
                      <span className="text-yellow-400">{formatCurrency(saldoBonus)}</span>
                    </div>
                  )}
                  {hasFreebet && (
                    <div className="flex justify-between">
                      <span className="text-amber-400">+ Freebet:</span>
                      <span className="text-amber-400">{formatCurrency(saldoFreebet)}</span>
                    </div>
                  )}
                  {hasEmAposta && (
                    <div className="flex justify-between">
                      <span className="text-red-400">- Em Aposta:</span>
                      <span className="text-red-400">{formatCurrency(saldoEmAposta)}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-1.5 border-t border-border/50 font-medium">
                    <span>= Operável:</span>
                    <span className="text-primary">{formatCurrency(saldoOperavel)}</span>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-2">
                  Valor total disponível para apostas agora
                </p>
              </TooltipContent>
            </Tooltip>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
          <div className="text-lg md:text-2xl font-bold text-primary">
            {formatCurrency(saldoOperavel)}
          </div>
          <p className="text-[10px] md:text-xs text-muted-foreground">
            {totalCasas} casa{totalCasas !== 1 ? 's' : ''} • Real{hasBonus ? ' + Bônus' : ''}{hasFreebet ? ' + FB' : ''}
          </p>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
