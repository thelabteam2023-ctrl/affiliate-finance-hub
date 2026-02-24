/**
 * SurebetColumnsLayout - Layout horizontal (colunas lado a lado)
 * 
 * Cada perna (1, 2, 3) é uma coluna vertical.
 * Sub-entradas empilham dentro da coluna (Casa + Odd + Stake compactos).
 * Lucro e ROI consolidados no rodapé de cada coluna.
 */
import React, { useMemo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2 } from 'lucide-react';
import type { SupportedCurrency } from '@/hooks/useCurrencySnapshot';
import type { Leg, LegEntry } from './SurebetExecutionTable';
import { cn } from '@/lib/utils';

interface BookmakerOption {
  id: string;
  nome: string;
  moeda: SupportedCurrency;
  saldo_operavel: number;
}

interface SurebetColumnsLayoutProps {
  legs: Leg[];
  setLegs: React.Dispatch<React.SetStateAction<Leg[]>>;
  bookmakers: BookmakerOption[];
  formatCurrency: (valor: number, moeda?: string) => string;
  getBookmakerMoeda: (id: string) => SupportedCurrency;
}

const MAX_ENTRIES_PER_LEG = 5;
const generateId = () => Math.random().toString(36).substring(2, 9);

function formatValue(value: number, showSign = false): string {
  const formatted = value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (showSign && value > 0) return `+${formatted}`;
  return formatted;
}

export function SurebetColumnsLayout({
  legs,
  setLegs,
  bookmakers,
  formatCurrency,
  getBookmakerMoeda,
}: SurebetColumnsLayoutProps) {

  const stakeTotal = useMemo(() => {
    return legs.reduce((acc, leg) => {
      return acc + leg.entries.reduce((sum, e) => sum + (parseFloat(e.stake) || 0), 0);
    }, 0);
  }, [legs]);

  const calculateWeightedOdd = useCallback((entries: LegEntry[]): number => {
    const totalStake = entries.reduce((sum, e) => sum + (parseFloat(e.stake) || 0), 0);
    if (totalStake <= 0) return 0;
    const weightedSum = entries.reduce((sum, e) => {
      return sum + (parseFloat(e.stake) || 0) * (parseFloat(e.odd) || 0);
    }, 0);
    return weightedSum / totalStake;
  }, []);

  const calculateLegProfit = useCallback((leg: Leg): { lucro: number; roi: number; retorno: number; stakeTotal: number } => {
    const legStake = leg.entries.reduce((sum, e) => sum + (parseFloat(e.stake) || 0), 0);
    const retorno = leg.entries.reduce((sum, e) => {
      return sum + (parseFloat(e.stake) || 0) * (parseFloat(e.odd) || 0);
    }, 0);
    const lucro = retorno - stakeTotal;
    const roi = stakeTotal > 0 ? (lucro / stakeTotal) * 100 : 0;
    return { lucro, roi, retorno, stakeTotal: legStake };
  }, [stakeTotal]);

  const updateEntry = useCallback((legIndex: number, entryIndex: number, field: keyof LegEntry, value: string | boolean) => {
    setLegs(prev => {
      const updated = [...prev];
      const leg = { ...updated[legIndex] };
      const entries = [...leg.entries];
      entries[entryIndex] = { ...entries[entryIndex], [field]: value };
      if (field === 'bookmaker_id' && typeof value === 'string') {
        const bk = bookmakers.find(b => b.id === value);
        if (bk) entries[entryIndex].moeda = bk.moeda;
      }
      leg.entries = entries;
      updated[legIndex] = leg;
      return updated;
    });
  }, [bookmakers, setLegs]);

  const addEntry = useCallback((legIndex: number) => {
    setLegs(prev => {
      const updated = [...prev];
      const leg = { ...updated[legIndex] };
      if (leg.entries.length >= MAX_ENTRIES_PER_LEG) return prev;
      leg.entries = [...leg.entries, {
        id: generateId(),
        bookmaker_id: '',
        moeda: 'BRL' as SupportedCurrency,
        odd: '',
        stake: '',
        isTargeted: false
      }];
      updated[legIndex] = leg;
      return updated;
    });
  }, [setLegs]);

  const removeEntry = useCallback((legIndex: number, entryIndex: number) => {
    setLegs(prev => {
      const updated = [...prev];
      const leg = { ...updated[legIndex] };
      if (leg.entries.length <= 1) return prev;
      leg.entries = leg.entries.filter((_, idx) => idx !== entryIndex);
      updated[legIndex] = leg;
      return updated;
    });
  }, [setLegs]);

  const lucroMinimo = useMemo(() => {
    if (stakeTotal <= 0) return 0;
    const lucros = legs.map(leg => calculateLegProfit(leg).lucro);
    return lucros.length > 0 ? Math.min(...lucros) : 0;
  }, [legs, stakeTotal, calculateLegProfit]);

  return (
    <div className="w-full space-y-3">
      {/* Colunas lado a lado */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${legs.length}, 1fr)` }}>
        {legs.map((leg, legIndex) => {
          const weightedOdd = calculateWeightedOdd(leg.entries);
          const { lucro, roi, stakeTotal: legStake } = calculateLegProfit(leg);
          const hasData = leg.entries.some(e => e.bookmaker_id && parseFloat(e.odd) > 1 && parseFloat(e.stake) > 0);
          const isPositive = lucro >= 0;
          const canAddMore = leg.entries.length < MAX_ENTRIES_PER_LEG;

          return (
            <div key={legIndex} className="flex flex-col rounded-lg border border-border/40 bg-card/50 overflow-hidden">
              {/* Header da coluna */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-7 h-7 rounded font-bold text-sm flex items-center justify-center",
                    "bg-primary/10 text-primary"
                  )}>
                    {leg.label}
                  </span>
                  {leg.entries.length > 1 && weightedOdd > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono tabular-nums" title="Odd média ponderada">
                      ø {weightedOdd.toFixed(3)}
                    </span>
                  )}
                </div>
                {canAddMore && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                    onClick={() => addEntry(legIndex)}
                    title={`Adicionar casa (${leg.entries.length}/${MAX_ENTRIES_PER_LEG})`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              {/* Sub-entradas */}
              <div className="flex-1 divide-y divide-border/20">
                {leg.entries.map((entry, entryIndex) => (
                  <div key={entry.id} className="px-2 py-1.5 space-y-1">
                    {/* Casa */}
                    <Select
                      value={entry.bookmaker_id}
                      onValueChange={(val) => updateEntry(legIndex, entryIndex, 'bookmaker_id', val)}
                    >
                      <SelectTrigger className="h-7 text-xs border-0 bg-muted/20 hover:bg-muted/40 focus:ring-1">
                        <SelectValue placeholder="Casa..." />
                      </SelectTrigger>
                      <SelectContent>
                        {bookmakers.map(bk => (
                          <SelectItem key={bk.id} value={bk.id} className="text-xs">
                            <span className="truncate">{bk.nome}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Odd + Stake em linha */}
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={entry.odd}
                        onChange={(e) => updateEntry(legIndex, entryIndex, 'odd', e.target.value)}
                        placeholder="Odd"
                        className="h-7 text-right text-xs font-mono border-0 bg-muted/20 hover:bg-muted/40 focus:ring-1 tabular-nums flex-1 px-1.5"
                      />
                      <div className="flex items-center gap-0.5 flex-1">
                        <span className="text-[8px] text-muted-foreground">{entry.moeda}</span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={entry.stake}
                          onChange={(e) => updateEntry(legIndex, entryIndex, 'stake', e.target.value)}
                          placeholder="Stake"
                          className="h-7 text-right text-xs font-mono border-0 bg-muted/20 hover:bg-muted/40 focus:ring-1 tabular-nums flex-1 px-1.5"
                        />
                      </div>
                      {leg.entries.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-destructive shrink-0"
                          onClick={() => removeEntry(legIndex, entryIndex)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer: Lucro e ROI consolidados da perna */}
              <div className="px-3 py-2 bg-muted/20 border-t border-border/30 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Lucro</span>
                  <span className={cn(
                    "text-sm font-bold tabular-nums",
                    hasData ? (isPositive ? "text-emerald-500" : "text-red-500") : "text-muted-foreground"
                  )}>
                    {hasData ? formatValue(lucro, true) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">ROI</span>
                  <span className={cn(
                    "text-[11px] tabular-nums",
                    hasData ? (isPositive ? "text-emerald-400" : "text-red-400") : "text-muted-foreground"
                  )}>
                    {hasData ? `${formatValue(roi, true)}%` : "—"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rodapé global */}
      <div className="flex items-center justify-end gap-6 pt-3 border-t border-border/40">
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Lucro Mínimo</p>
          <p className={cn(
            "text-base font-bold tabular-nums",
            lucroMinimo >= 0 ? "text-emerald-500" : "text-red-500"
          )}>
            {stakeTotal > 0 ? formatValue(lucroMinimo, true) : "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total Apostado</p>
          <p className="text-base font-semibold tabular-nums">
            {stakeTotal > 0 ? formatValue(stakeTotal) : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}
