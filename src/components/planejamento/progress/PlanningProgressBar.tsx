 import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { TrendingDown, TrendingUp, AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { calculatePlanningMetrics, getProgressBarColor } from "@/utils/planningFinancialUtils";
import { useFormatProjetoCurrency } from "@/hooks/useProjetoCurrency";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
 import { Button } from "@/components/ui/button";

 import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
 import { useMultiCurrencyConversion } from "@/hooks/useMultiCurrencyConversion";
 import { Badge } from "@/components/ui/badge";
 import { PlusCircle } from "lucide-react";
 
 interface PlanningProgressBarProps {
   campanhas: any[];
   extras: any[];
   year: number;
   month: number;
   projetoId?: string;
   className?: string;
   convertToConsolidation: (valor: number, moedaOrigem: string) => number;
   onAddExtra?: () => void;
   displayCurrency?: "BRL" | "USD";
   onDisplayCurrencyChange?: (currency: "BRL" | "USD") => void;
 }
 
 export function PlanningProgressBar({
   campanhas,
   extras = [],
   year,
   month,
   projetoId,
   className,
   convertToConsolidation,
   onAddExtra,
   displayCurrency = "BRL",
   onDisplayCurrencyChange
 }: PlanningProgressBarProps) {
   const { format: formatOriginal, symbol: symbolOriginal } = useFormatProjetoCurrency(projetoId);
   const { convert, formatCurrency } = useMultiCurrencyConversion();
 
   const metrics = useMemo(() => {
     return calculatePlanningMetrics(campanhas, extras, year, month, convertToConsolidation);
   }, [campanhas, extras, year, month, convertToConsolidation]);
 
   const formatDisplay = (val: number) => {
     if (displayCurrency === "BRL") {
       return formatOriginal(val);
     }
     // Se estiver visualizando em USD, converter de BRL (moeda de consolidação padrão) para USD
     const valUSD = convert(val, "BRL", "USD");
     return formatCurrency(valUSD, "USD");
   };
 
   if (metrics.totalPlanned === 0) {
    return (
      <div className={cn("p-4 border rounded-xl bg-card/30 flex items-center justify-center gap-2 text-muted-foreground italic text-sm", className)}>
        <AlertCircle className="h-4 w-4" />
        Nenhuma campanha planejada para este período
      </div>
    );
  }

   const barColor = getProgressBarColor(metrics.completed, metrics.expectedToday);
   const gapColor = metrics.isAtrasado ? "text-red-500" : "text-emerald-500";
   const gapIcon = metrics.isAtrasado ? <TrendingDown className="h-3 w-3" /> : <TrendingUp className="h-3 w-3" />;
 
   return (
     <div className={cn("space-y-3 p-4 border rounded-xl bg-card/50 shadow-sm", className)}>
       <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
         <div className="space-y-1 flex-1">
           <div className="flex items-center gap-3">
             <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
               Progresso Operacional
               <span className="text-[10px] font-normal lowercase opacity-70">
                 ({metrics.currentDay}/{metrics.daysInMonth} dias)
               </span>
             </h4>
             {metrics.totalExtras > 0 && (
               <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-blue-500/10 text-blue-500 border-blue-500/20 font-bold uppercase">
                 +{formatDisplay(metrics.totalExtras)} em extras
               </Badge>
             )}
           </div>
           <div className="flex items-baseline gap-1.5">
             <span className="text-xl font-black tracking-tight">{formatDisplay(metrics.completed)}</span>
             <span className="text-xs text-muted-foreground font-medium">
               executados de {formatDisplay(metrics.totalPlanned)}
             </span>
           </div>
         </div>
 
         <div className="flex flex-col sm:items-end gap-2">
           <div className="flex items-center gap-2">
             <ToggleGroup 
               type="single" 
               value={displayCurrency} 
               onValueChange={(val) => val && onDisplayCurrencyChange?.(val as "BRL" | "USD")}
               className="h-7 border rounded-md p-0.5 bg-muted/30"
             >
               <ToggleGroupItem value="BRL" className="text-[10px] px-2 h-full rounded-sm data-[state=on]:bg-background data-[state=on]:shadow-sm">BRL</ToggleGroupItem>
               <ToggleGroupItem value="USD" className="text-[10px] px-2 h-full rounded-sm data-[state=on]:bg-background data-[state=on]:shadow-sm">USD</ToggleGroupItem>
             </ToggleGroup>
             <Button 
               variant="outline" 
               size="sm" 
               className="h-7 px-2 text-[10px] font-bold gap-1 bg-primary/5 border-primary/20 hover:bg-primary/10 text-primary"
               onClick={onAddExtra}
             >
               <PlusCircle className="h-3 w-3" />
               CASA EXTRA
             </Button>
           </div>
           <div className="flex items-center gap-2">
             <div className={cn("flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border", 
               metrics.isAtrasado ? "bg-red-500/10 border-red-500/20 text-red-500" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
             )}>
               {gapIcon}
               {metrics.isAtrasado ? "ATRASO OPERACIONAL" : "RITMO ACELERADO"}
             </div>
             <span className={cn("text-xs font-bold", gapColor)}>
               {formatDisplay(Math.abs(metrics.gap))} {metrics.isAtrasado ? "abaixo" : "acima"}
             </span>
           </div>
         </div>
       </div>

      <div className="relative h-3 w-full bg-muted rounded-full overflow-hidden">
        {/* Barra de Fundo (Meta Esperada) */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${metrics.expectedPercentage}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="absolute inset-y-0 left-0 bg-primary/20 z-10"
        />
        
        {/* Barra da Frente (Progresso Real) */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${metrics.realPercentage}%` }}
          transition={{ duration: 1.2, ease: "backOut" }}
          className={cn("absolute inset-y-0 left-0 bg-gradient-to-r z-20 shadow-[0_0_10px_rgba(0,0,0,0.2)]", barColor)}
        />
        
        {/* Marcador de meta hoje (opcional, visual) */}
        <div 
          className="absolute inset-y-0 w-0.5 bg-foreground/30 z-30" 
          style={{ left: `${metrics.expectedPercentage}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-tight text-muted-foreground px-0.5">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <div className={cn("h-1.5 w-1.5 rounded-full", metrics.realPercentage >= metrics.expectedPercentage ? "bg-emerald-500" : "bg-red-500")} />
            {metrics.realPercentage.toFixed(1)}% Real
          </span>
          <span className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-primary/40" />
            {metrics.expectedPercentage.toFixed(1)}% Esperado
          </span>
        </div>
         <span className="opacity-60">Faltam {formatDisplay(metrics.totalPlanned - metrics.completed)}</span>
      </div>
    </div>
  );
}