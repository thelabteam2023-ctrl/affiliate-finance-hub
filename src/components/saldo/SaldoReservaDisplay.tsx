/**
 * Componente para exibir saldo com breakdown de reservas
 * 
 * Mostra:
 * - Saldo Contábil (total operável)
 * - Saldo Reservado (por outros operadores)
 * - Saldo Disponível (o que pode ser apostado agora)
 * 
 * Atualiza em tempo real quando outros operadores criam reservas.
 */

import { useMemo } from "react";
import { AlertTriangle, Users, Lock, Unlock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SaldoReservaDisplayProps {
  saldoContabil: number;
  saldoReservado: number;
  saldoDisponivel: number;
  moeda?: string;
  stakeAtual?: number;
  loading?: boolean;
  compact?: boolean;
  className?: string;
}

function formatCurrency(value: number, moeda: string = 'BRL'): string {
  const symbol = moeda === 'USD' || moeda === 'USDT' ? '$' : 'R$';
  return `${symbol} ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Display compacto de saldo com reservas (para uso inline)
 */
export function SaldoReservaCompact({
  saldoContabil,
  saldoReservado,
  saldoDisponivel,
  moeda = 'BRL',
  stakeAtual = 0,
  loading = false,
  className
}: SaldoReservaDisplayProps) {
  const hasReservations = saldoReservado > 0;
  const isInsuficiente = stakeAtual > saldoDisponivel;
  
  if (loading) {
    return (
      <div className={cn("text-xs text-muted-foreground animate-pulse", className)}>
        Carregando saldo...
      </div>
    );
  }
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            "flex items-center gap-1.5 text-xs",
            isInsuficiente ? "text-destructive" : "text-muted-foreground",
            className
          )}>
            {hasReservations ? (
              <Lock className="h-3 w-3 text-amber-500" />
            ) : (
              <Unlock className="h-3 w-3 text-emerald-500" />
            )}
            <span className={cn(
              "font-medium",
              isInsuficiente && "text-destructive"
            )}>
              {formatCurrency(saldoDisponivel, moeda)}
            </span>
            {hasReservations && (
              <Badge variant="outline" className="h-4 px-1 text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30">
                <Users className="h-2.5 w-2.5 mr-0.5" />
                -{formatCurrency(saldoReservado, moeda).replace(/R\$|USD|\$/g, '')}
              </Badge>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[280px]">
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Saldo Operável:</span>
              <span className="font-medium">{formatCurrency(saldoContabil, moeda)}</span>
            </div>
            {hasReservations && (
              <div className="flex justify-between gap-4 text-amber-500">
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Reservado por outros:
                </span>
                <span className="font-medium">-{formatCurrency(saldoReservado, moeda)}</span>
              </div>
            )}
            <div className="border-t border-border/50 pt-1.5 flex justify-between gap-4">
              <span className="text-muted-foreground">Disponível agora:</span>
              <span className={cn(
                "font-bold",
                isInsuficiente ? "text-destructive" : "text-emerald-500"
              )}>
                {formatCurrency(saldoDisponivel, moeda)}
              </span>
            </div>
            {isInsuficiente && (
              <div className="flex items-center gap-1 text-destructive pt-1">
                <AlertTriangle className="h-3 w-3" />
                <span>Stake excede saldo disponível!</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Display expandido de saldo com reservas (para card/seção)
 */
export function SaldoReservaCard({
  saldoContabil,
  saldoReservado,
  saldoDisponivel,
  moeda = 'BRL',
  stakeAtual = 0,
  loading = false,
  className
}: SaldoReservaDisplayProps) {
  const hasReservations = saldoReservado > 0;
  const isInsuficiente = stakeAtual > saldoDisponivel;
  
  if (loading) {
    return (
      <div className={cn("p-3 rounded-lg border border-border/50 bg-muted/20 animate-pulse", className)}>
        <div className="h-4 bg-muted rounded w-24 mb-2" />
        <div className="h-6 bg-muted rounded w-32" />
      </div>
    );
  }
  
  return (
    <div className={cn(
      "p-3 rounded-lg border bg-gradient-to-br",
      hasReservations 
        ? "border-amber-500/30 from-amber-500/5 to-transparent" 
        : "border-emerald-500/30 from-emerald-500/5 to-transparent",
      isInsuficiente && "border-destructive/50 from-destructive/10",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          {hasReservations ? (
            <>
              <Lock className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs font-medium text-amber-600">Saldo Parcialmente Reservado</span>
            </>
          ) : (
            <>
              <Unlock className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600">Saldo Livre</span>
            </>
          )}
        </div>
        {hasReservations && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 cursor-help">
                  <Users className="h-3 w-3 mr-1" />
                  Outros operadores
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Outros operadores estão digitando apostas nesta casa</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      
      {/* Breakdown */}
      <div className="space-y-1 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Operável</span>
          <span className="font-medium">{formatCurrency(saldoContabil, moeda)}</span>
        </div>
        
        {hasReservations && (
          <div className="flex justify-between items-center text-amber-500">
            <span className="flex items-center gap-1">
              <Lock className="h-3 w-3" />
              Reservado
            </span>
            <span className="font-medium">-{formatCurrency(saldoReservado, moeda)}</span>
          </div>
        )}
        
        <div className="border-t border-border/50 pt-1 mt-1 flex justify-between items-center">
          <span className="font-medium">Disponível</span>
          <span className={cn(
            "font-bold text-sm",
            isInsuficiente ? "text-destructive" : "text-emerald-500"
          )}>
            {formatCurrency(saldoDisponivel, moeda)}
          </span>
        </div>
      </div>
      
      {/* Warning */}
      {isInsuficiente && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 px-2 py-1.5 rounded">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>Stake ({formatCurrency(stakeAtual, moeda)}) excede o disponível!</span>
        </div>
      )}
    </div>
  );
}

/**
 * Badge simples para exibir reservas ativas
 */
export function ReservaBadge({
  saldoReservado,
  moeda = 'BRL',
  className
}: {
  saldoReservado: number;
  moeda?: string;
  className?: string;
}) {
  if (saldoReservado <= 0) return null;
  
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={cn(
              "h-5 px-1.5 text-[10px] bg-amber-500/10 text-amber-600 border-amber-500/30 cursor-help",
              className
            )}
          >
            <Lock className="h-3 w-3 mr-1" />
            {formatCurrency(saldoReservado, moeda)} reservado
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">Este valor está sendo digitado por outros operadores</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default SaldoReservaCompact;
