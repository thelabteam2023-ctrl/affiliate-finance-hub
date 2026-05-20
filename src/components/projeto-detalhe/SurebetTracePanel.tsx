/**
 * SurebetTracePanel — Componente visual para auditoria matemática em tempo real.
 * Exibe as conversões e agregações que compõem o cálculo final do card.
 */

import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info, Calculator, ArrowRight, DollarSign, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { CURRENCIES_THAT_CANNOT_BE_1 } from "@/utils/exchangeRateGuard";


interface RateUsed {
  currency: string;
  workingRate: number;
  officialRate?: number;
  source: string;
}

export interface TraceStep {
  label: string;
  original: string;
  rate?: number;
  result: string;
  type: 'conversion' | 'aggregation' | 'adjustment' | 'pnl_projection';
  // Novos campos para P&L
  pnlUSD?: number;
  winnerReturnUSD?: number;
  totalInvestedUSD?: number;
  ratesUsed?: RateUsed[];
  legId?: string;
  isContaminated?: boolean;
}

interface SurebetTracePanelProps {
  steps: TraceStep[];
  baseCurrency: string;
  isOpen?: boolean;
  workingRates?: Record<string, number>;
  officialRates?: Record<string, number>;
}

export function SurebetTracePanel({ 
  steps, 
  baseCurrency, 
  isOpen = false,
  workingRates = {},
  officialRates = {}
}: SurebetTracePanelProps) {
  if (!isOpen || steps.length === 0) return null;

  return (
    <Card className="mt-4 border-dashed border-primary/30 bg-primary/5 animate-in slide-in-from-top-2 duration-300">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3 text-primary">
          <Calculator className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Rastreabilidade Matemática (Audit Trace)</span>
        </div>
        
        <div className="space-y-3">
          {steps.map((step, idx) => {
            const isPnl = step.type === 'pnl_projection';
            
            return (
              <div 
                key={idx} 
                className="flex items-start gap-3 text-[11px] leading-relaxed border-b border-primary/10 pb-2 last:border-0 last:pb-0"
                data-testid={isPnl && step.legId ? `pnl-projection-${step.legId}` : undefined}
                data-pnl-usd={isPnl ? step.pnlUSD?.toFixed(4) : undefined}
                data-currency-contamination={isPnl ? (step.isContaminated ? 'true' : 'false') : undefined}
              >
                <div className={cn(
                  "mt-0.5 p-1 rounded",
                  step.type === 'conversion' ? "bg-blue-500/10 text-blue-500" : 
                  step.type === 'aggregation' ? "bg-purple-500/10 text-purple-500" : 
                  isPnl ? "bg-emerald-500/10 text-emerald-500" :
                  "bg-amber-500/10 text-amber-500"
                )}>
                  {step.type === 'conversion' ? <Currency className="h-3 w-3" /> : <Calculator className="h-3 w-3" />}
                </div>
                
                <div className="flex-1">
                  <span className="font-semibold text-muted-foreground">{step.label}:</span>
                  
                  {isPnl ? (
                    <div className="mt-1 space-y-1">
                      <div className="flex flex-wrap gap-2">
                        {step.ratesUsed?.map(r => (
                          <Badge key={r.currency} variant="outline" className="text-[9px] h-4 bg-background px-1">
                            {r.currency}→BRL: {r.workingRate.toFixed(4)}
                          </Badge>
                        ))}
                        <Badge variant="outline" className="text-[9px] h-4 bg-background px-1">
                          BRL→USD: {(1 / (workingRates['USD'] || 1)).toFixed(4)}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <span>Retorno: ${step.winnerReturnUSD?.toFixed(2)}</span>
                        <span>Total: ${step.totalInvestedUSD?.toFixed(2)}</span>
                        <ArrowRight className="h-3 w-3 text-primary" />
                        <Badge variant="secondary" className={cn(
                          "text-[10px] h-5 font-bold px-1.5",
                          (step.pnlUSD || 0) >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
                        )}>
                          {(step.pnlUSD || 0) >= 0 ? '+' : ''}{step.pnlUSD?.toFixed(2)} USD
                        </Badge>
                      </div>
                      
                      {step.isContaminated && (
                        <div className="text-orange-400 font-bold flex items-center gap-1 mt-1" data-testid={step.legId ? `pnl-contamination-warning-${step.legId}` : undefined}>
                          <Info className="h-3 w-3" />
                          Contaminação de moeda detectada
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-[10px] h-5 bg-background">{step.original}</Badge>
                      {step.rate && (
                        <>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="text-muted-foreground italic">taxa {step.rate.toFixed(4)}</span>
                        </>
                      )}
                      <ArrowRight className="h-3 w-3 text-primary" />
                      <Badge variant="secondary" className="text-[10px] h-5 bg-primary/20 text-primary border-primary/30 font-bold">
                        {step.result} {baseCurrency}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Drift Warnings */}
        <div className="mt-3 space-y-1">
          {Object.entries(workingRates).map(([currency, workRate]) => {
            const officialRate = officialRates[currency];
            if (!officialRate || currency === 'BRL') return null;
            const drift = Math.abs((workRate - officialRate) / officialRate) * 100;
            if (drift < 3) return null;

            return (
              <div 
                key={currency} 
                className="text-[10px] text-orange-400 flex items-center gap-1 bg-orange-500/5 p-1 rounded border border-orange-500/20"
                data-testid={`rate-drift-warning-${currency.toLowerCase()}`}
                data-drift={drift.toFixed(2)}
              >
                <Info className="h-3 w-3" />
                <span>{currency}: cotação de trabalho ({workRate.toFixed(4)}) difere {drift.toFixed(1)}% da oficial ({officialRate.toFixed(4)})</span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 pt-2 border-t border-primary/20 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground italic">
            <div className="flex items-center gap-1">
              <Info className="h-3 w-3" />
              Cálculo determinístico baseado em snapshots de cotação de trabalho.
            </div>
          </div>
          
          <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground" data-testid="trace-rates-snapshot">
            <span className="font-semibold">Snapshot taxas:</span>
            {Object.entries(workingRates).map(([currency, rate]) => {
              const isInvalid = CURRENCIES_THAT_CANNOT_BE_1.includes(currency) &&
                Math.abs(rate - 1.0) < 0.001;

              return (
                <span 
                  key={currency} 
                  data-testid={`trace-rate-${currency.toLowerCase()}`} 
                  data-rate={rate}
                  data-is-invalid={isInvalid ? 'true' : 'false'}
                  className={cn(
                    "border-r border-muted-foreground/30 pr-2 last:border-0 flex items-center gap-1",
                    isInvalid && "text-red-400 font-bold"
                  )}
                >
                  {currency}: {rate.toFixed(4)}
                  {isInvalid && <AlertTriangle className="h-2 w-2" />}
                  {isInvalid && <span className="text-[8px] uppercase">Inválida</span>}
                </span>
              );
            })}
          </div>

        </div>
      </CardContent>
    </Card>
  );
}
