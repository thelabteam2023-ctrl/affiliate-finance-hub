/**
 * SurebetTracePanel — Componente visual para auditoria matemática em tempo real.
 * Exibe as conversões e agregações que compõem o cálculo final do card.
 */

import React from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Info, Calculator, ArrowRight, Currency } from "lucide-react";
import { cn } from "@/lib/utils";

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

export function SurebetTracePanel({ steps, baseCurrency, isOpen = false }: SurebetTracePanelProps) {
  if (!isOpen || steps.length === 0) return null;

  return (
    <Card className="mt-4 border-dashed border-primary/30 bg-primary/5 animate-in slide-in-from-top-2 duration-300">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3 text-primary">
          <Calculator className="h-4 w-4" />
          <span className="text-xs font-bold uppercase tracking-wider">Rastreabilidade Matemática (Audit Trace)</span>
        </div>
        
        <div className="space-y-2">
          {steps.map((step, idx) => (
            <div key={idx} className="flex items-start gap-3 text-[11px] leading-relaxed border-b border-primary/10 pb-2 last:border-0 last:pb-0">
              <div className={cn(
                "mt-0.5 p-1 rounded",
                step.type === 'conversion' ? "bg-blue-500/10 text-blue-500" : 
                step.type === 'aggregation' ? "bg-purple-500/10 text-purple-500" : 
                "bg-amber-500/10 text-amber-500"
              )}>
                {step.type === 'conversion' ? <Currency className="h-3 w-3" /> : <Calculator className="h-3 w-3" />}
              </div>
              
              <div className="flex-1">
                <span className="font-semibold text-muted-foreground">{step.label}:</span>
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
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 pt-2 border-t border-primary/20 flex items-center justify-between text-[10px] text-muted-foreground italic">
          <div className="flex items-center gap-1">
            <Info className="h-3 w-3" />
            Cálculo determinístico baseado em snapshots de cotação.
          </div>
          <span>ID: {Math.random().toString(36).substring(7).toUpperCase()}</span>
        </div>
      </CardContent>
    </Card>
  );
}
