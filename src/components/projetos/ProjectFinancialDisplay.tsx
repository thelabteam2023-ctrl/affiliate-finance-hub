import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Wallet, TrendingUp, TrendingDown, Info, DollarSign, CircleDollarSign } from "lucide-react";
import { getFinancialDisplay } from "@/lib/financial-display";

interface CurrencyBreakdown {
  BRL: number;
  USD: number;
}

interface ProjectFinancialDisplayProps {
  type: "saldo" | "lucro";
  breakdown: CurrencyBreakdown;
  totalConsolidado: number;
  cotacaoPTAX: number;
  isMultiCurrency?: boolean;
}

/**
 * Componente de exibição financeira com hierarquia visual clara:
 * 1. Badges de moeda (valores reais) - posição dominante
 * 2. Valor consolidado aproximado (via cotação oficial) - referência secundária
 * 
 * REGRAS:
 * - Conversão via cotação oficial (FastForex > PTAX > Trabalho)
 * - Conversão sempre marcada como ≈ aproximação
 * - Valores reais por moeda sempre visíveis
 */
export function ProjectFinancialDisplay({
  type,
  breakdown,
  totalConsolidado,
  cotacaoPTAX,
  isMultiCurrency = false,
}: ProjectFinancialDisplayProps) {
  const isSaldo = type === "saldo";
  
  // Para lucro, usar o utilitário de display financeiro (precisa calcular antes da label)
  const lucroDisplay = !isSaldo ? getFinancialDisplay(totalConsolidado) : null;
  const isPositive = isSaldo ? true : (lucroDisplay?.isPositive || lucroDisplay?.isZero);
  
  // Label dinâmica: "Lucro" ou "Prejuízo" baseado no sinal
  const label = isSaldo 
    ? "Saldo Bookmakers" 
    : (lucroDisplay?.isNegative ? "Prejuízo" : "Lucro");
  
  const hasBRL = breakdown.BRL !== 0;
  const hasUSD = breakdown.USD !== 0;
  const showMultiCurrency = isMultiCurrency || (hasBRL && hasUSD) || hasUSD;
  
  // Formatação de moeda
  const formatBRL = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Math.abs(value));
  };
  
  const formatUSD = (value: number) => {
    return `$ ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Ícone baseado no tipo
  const Icon = isSaldo 
    ? Wallet 
    : (isPositive ? TrendingUp : TrendingDown);
  
  const iconColor = isSaldo 
    ? "text-muted-foreground" 
    : (isPositive ? "text-emerald-500" : "text-red-500");

  // Se não for multimoeda (apenas BRL), exibir layout simplificado
  if (!showMultiCurrency) {
    const displayValue = isSaldo 
      ? formatBRL(totalConsolidado)
      : `${lucroDisplay?.isPositive ? '+' : ''}${formatBRL(totalConsolidado)}`;
    
    return (
      <div className="flex flex-col items-center gap-1 py-2">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Icon className={`h-4 w-4 ${iconColor}`} />
          <span>{label}</span>
        </div>
        <span className={`text-lg font-semibold ${!isSaldo ? lucroDisplay?.colorClass : ''}`}>
          {displayValue}
        </span>
        {/* Badge BRL mesmo em mono-moeda para consistência visual */}
        {hasBRL && (
          <Badge 
            variant="outline" 
            className={`text-sm px-3 py-1 ${
              !isSaldo && breakdown.BRL < 0 
                ? 'border-red-500/40 text-red-400 bg-red-500/10' 
                : !isSaldo && breakdown.BRL > 0
                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                  : 'border-border'
            }`}
          >
            <CircleDollarSign className="h-3.5 w-3.5 mr-1" />
            <span className="font-medium">BRL:</span>
            <span className="ml-1.5 font-semibold">
              {!isSaldo && breakdown.BRL > 0 ? '+' : ''}{formatBRL(breakdown.BRL)}
            </span>
          </Badge>
        )}
      </div>
    );
  }

  // Layout multimoeda com hierarquia visual clara - CENTRALIZADO
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      {/* Header com label e ícone - CENTRALIZADO */}
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Icon className={`h-4 w-4 ${iconColor}`} />
        <span>{label}</span>
      </div>
      
      {/* Badges de moeda - VALORES REAIS (elemento dominante) - CENTRALIZADOS */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {hasBRL && (
          <Badge 
            variant="outline" 
            className={`text-sm px-3 py-1 ${
              !isSaldo && breakdown.BRL < 0 
                ? 'border-red-500/40 text-red-400 bg-red-500/10' 
                : !isSaldo && breakdown.BRL > 0
                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                  : 'border-border'
            }`}
          >
            <CircleDollarSign className="h-3.5 w-3.5 mr-1" />
            <span className="font-medium">BRL:</span>
            <span className="ml-1.5 font-semibold">
              {!isSaldo && breakdown.BRL > 0 ? '+' : ''}{formatBRL(breakdown.BRL)}
            </span>
          </Badge>
        )}
        
        {hasUSD && (
          <Badge 
            variant="outline" 
            className={`text-sm px-3 py-1 ${
              !isSaldo && breakdown.USD < 0 
                ? 'border-red-500/40 text-red-400 bg-red-500/10' 
                : !isSaldo && breakdown.USD > 0
                  ? 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10'
                  : 'border-emerald-500/30 text-emerald-400'
            }`}
          >
            <DollarSign className="h-3.5 w-3.5 mr-1" />
            <span className="font-medium">USD:</span>
            <span className="ml-1.5 font-semibold">
              {!isSaldo && breakdown.USD > 0 ? '+' : ''}{formatUSD(breakdown.USD)}
            </span>
          </Badge>
        )}
      </div>
      
      {/* Valor consolidado aproximado (referência analítica) - CENTRALIZADO */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex items-center gap-1.5 text-sm cursor-help ${
            isSaldo 
              ? 'text-muted-foreground' 
              : lucroDisplay?.colorClass
          }`}>
            <span className="opacity-70">≈</span>
            <span className="font-semibold">
              {!isSaldo && totalConsolidado > 0 ? '+' : ''}{formatBRL(totalConsolidado)}
            </span>
            <Info className="h-3.5 w-3.5 opacity-50" />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" sideOffset={8} className="max-w-[300px] z-[100]">
          <div className="space-y-2 text-xs">
            <div className="font-medium">Valor Aproximado (Conversão Analítica)</div>
            <div className="text-muted-foreground">
              Este valor é uma <strong>referência aproximada</strong> calculada 
              via cotação oficial em tempo real.
            </div>
            <div className="pt-1 border-t border-border/50 space-y-1">
              <div className="flex justify-between">
                <span>Cotação USD/BRL:</span>
                <span className="font-mono">R$ {cotacaoPTAX.toFixed(4)}</span>
              </div>
              {hasUSD && (
                <div className="flex justify-between text-muted-foreground">
                  <span>{formatUSD(breakdown.USD)} × {cotacaoPTAX.toFixed(2)} =</span>
                  <span>{formatBRL(breakdown.USD * cotacaoPTAX)}</span>
                </div>
              )}
            </div>
            <div className="text-[10px] text-muted-foreground/70 pt-1">
              ⚠️ Não substitui os valores reais por moeda
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
