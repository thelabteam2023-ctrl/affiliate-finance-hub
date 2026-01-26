/**
 * SurebetExecutionTable - Tabela de execução com múltiplas entradas por perna
 * 
 * Design: Layout tabular minimalista para apostas ao vivo
 * - Cada perna (1, X, 2) pode ter múltiplas casas
 * - Colunas: Perna | Casa | Odd | Stake | 🎯 | Lucro | ROI
 * - Botão rádio 🎯 entre Stake e Lucro para direcionar lucro
 * - Valores positivos em verde, negativos em vermelho
 */
import React, { useMemo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Plus, Trash2, Target } from 'lucide-react';
import type { SupportedCurrency } from '@/hooks/useCurrencySnapshot';
import { cn } from '@/lib/utils';

interface BookmakerOption {
  id: string;
  nome: string;
  moeda: SupportedCurrency;
  saldo_operavel: number;
}

// Entrada individual (uma casa dentro de uma perna)
export interface LegEntry {
  id: string;
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  isTargeted: boolean; // Se o lucro está direcionado para esta entrada
}

// Perna completa (pode ter múltiplas entradas)
export interface Leg {
  label: string; // "1", "X", "2"
  selecao: string;
  entries: LegEntry[];
}

interface SurebetExecutionTableProps {
  legs: Leg[];
  setLegs: React.Dispatch<React.SetStateAction<Leg[]>>;
  modelo: "1-X-2" | "1-2";
  bookmakers: BookmakerOption[];
  isEditing: boolean;
  arredondarAtivado: boolean;
  setArredondarAtivado: (value: boolean) => void;
  arredondarValor: string;
  setArredondarValor: (value: string) => void;
  formatCurrency: (valor: number, moeda?: string) => string;
  getBookmakerMoeda: (id: string) => SupportedCurrency;
}

// Gera ID único
const generateId = () => Math.random().toString(36).substring(2, 9);

// Formata valor para exibição
function formatValue(value: number, showSign: boolean = false): string {
  const formatted = value.toLocaleString('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
  if (showSign && value > 0) return `+${formatted}`;
  return formatted;
}

export function SurebetExecutionTable({
  legs,
  setLegs,
  modelo,
  bookmakers,
  isEditing,
  arredondarAtivado,
  setArredondarAtivado,
  arredondarValor,
  setArredondarValor,
  formatCurrency,
  getBookmakerMoeda,
}: SurebetExecutionTableProps) {
  
  // Calcular stake total de todas as entradas
  const stakeTotal = useMemo(() => {
    return legs.reduce((acc, leg) => {
      return acc + leg.entries.reduce((sum, entry) => sum + (parseFloat(entry.stake) || 0), 0);
    }, 0);
  }, [legs]);

  // Calcular lucro e ROI por entrada
  const calculateEntryProfit = useCallback((entry: LegEntry, legEntries: LegEntry[]): { lucro: number; roi: number } => {
    const stake = parseFloat(entry.stake) || 0;
    const odd = parseFloat(entry.odd) || 0;
    
    if (stake <= 0 || odd <= 1 || stakeTotal <= 0) {
      return { lucro: 0, roi: 0 };
    }
    
    // Lucro = (stake * odd) - stake total de todas as pernas
    const retorno = stake * odd;
    const lucro = retorno - stakeTotal;
    const roi = (lucro / stakeTotal) * 100;
    
    return { lucro, roi };
  }, [stakeTotal]);

  // Lucro total mínimo (cenário pessimista)
  const lucroTotal = useMemo(() => {
    if (stakeTotal <= 0) return 0;
    
    // Para cada perna, calcular o retorno total se aquela perna ganhar
    const lucrosPorPerna = legs.map(leg => {
      const retornoTotal = leg.entries.reduce((sum, entry) => {
        const stake = parseFloat(entry.stake) || 0;
        const odd = parseFloat(entry.odd) || 0;
        return sum + (stake * odd);
      }, 0);
      return retornoTotal - stakeTotal;
    });
    
    // Retorna o menor lucro (pior cenário)
    return lucrosPorPerna.length > 0 ? Math.min(...lucrosPorPerna) : 0;
  }, [legs, stakeTotal]);

  // Handler para atualizar entrada
  const updateEntry = useCallback((legIndex: number, entryIndex: number, field: keyof LegEntry, value: string | boolean) => {
    setLegs(prev => {
      const updated = [...prev];
      const leg = { ...updated[legIndex] };
      const entries = [...leg.entries];
      entries[entryIndex] = { ...entries[entryIndex], [field]: value };
      
      // Se está definindo moeda pelo bookmaker
      if (field === 'bookmaker_id' && typeof value === 'string') {
        const bk = bookmakers.find(b => b.id === value);
        if (bk) {
          entries[entryIndex].moeda = bk.moeda;
        }
      }
      
      leg.entries = entries;
      updated[legIndex] = leg;
      return updated;
    });
  }, [bookmakers, setLegs]);

  // Handler para direcionar lucro para uma entrada
  const setTargetedEntry = useCallback((legIndex: number, entryIndex: number) => {
    setLegs(prev => {
      const updated = [...prev];
      const leg = { ...updated[legIndex] };
      leg.entries = leg.entries.map((entry, idx) => ({
        ...entry,
        isTargeted: idx === entryIndex
      }));
      updated[legIndex] = leg;
      return updated;
    });
  }, [setLegs]);

  // Handler para adicionar entrada em uma perna
  const addEntry = useCallback((legIndex: number) => {
    setLegs(prev => {
      const updated = [...prev];
      const leg = { ...updated[legIndex] };
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

  // Handler para remover entrada
  const removeEntry = useCallback((legIndex: number, entryIndex: number) => {
    setLegs(prev => {
      const updated = [...prev];
      const leg = { ...updated[legIndex] };
      if (leg.entries.length <= 1) return prev; // Manter pelo menos 1 entrada
      leg.entries = leg.entries.filter((_, idx) => idx !== entryIndex);
      updated[legIndex] = leg;
      return updated;
    });
  }, [setLegs]);

  // Flatten entries para renderização com rowspan
  const flatRows = useMemo(() => {
    const rows: Array<{
      legIndex: number;
      entryIndex: number;
      leg: Leg;
      entry: LegEntry;
      isFirstInLeg: boolean;
      legRowSpan: number;
    }> = [];

    legs.forEach((leg, legIndex) => {
      leg.entries.forEach((entry, entryIndex) => {
        rows.push({
          legIndex,
          entryIndex,
          leg,
          entry,
          isFirstInLeg: entryIndex === 0,
          legRowSpan: leg.entries.length
        });
      });
    });

    return rows;
  }, [legs]);

  return (
    <div className="w-full space-y-3">
      {/* Tabela de Execução */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-center py-2 px-1.5 text-xs font-medium text-muted-foreground w-8">Perna</th>
              <th className="text-left py-2 px-1.5 text-xs font-medium text-muted-foreground min-w-[120px]">Casa</th>
              <th className="text-right py-2 px-1.5 text-xs font-medium text-muted-foreground w-16">Odd</th>
              <th className="text-right py-2 px-1.5 text-xs font-medium text-muted-foreground w-20">Stake</th>
              <th className="text-center py-2 px-1.5 text-xs font-medium text-muted-foreground w-8" title="Direcionar lucro">🎯</th>
              <th className="text-right py-2 px-1.5 text-xs font-medium text-muted-foreground w-20">Lucro</th>
              <th className="text-right py-2 px-1.5 text-xs font-medium text-muted-foreground w-16">ROI</th>
              <th className="w-16"></th>
            </tr>
          </thead>
          <tbody>
            {flatRows.map((row, rowIndex) => {
              const { legIndex, entryIndex, leg, entry, isFirstInLeg, legRowSpan } = row;
              const { lucro, roi } = calculateEntryProfit(entry, leg.entries);
              const isPositive = lucro >= 0;
              const hasData = entry.bookmaker_id && parseFloat(entry.odd) > 1 && parseFloat(entry.stake) > 0;
              
              return (
                <tr 
                  key={`${legIndex}-${entryIndex}`}
                  className={cn(
                    "border-b border-border/20 hover:bg-muted/20 transition-colors",
                    isFirstInLeg && "border-t border-border/40"
                  )}
                >
                  {/* Perna (com rowspan) */}
                  {isFirstInLeg && (
                    <td 
                      rowSpan={legRowSpan}
                      className="py-1.5 px-1.5 text-center align-middle border-r border-border/30"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className={cn(
                          "w-7 h-7 rounded font-bold text-sm flex items-center justify-center",
                          "bg-primary/10 text-primary"
                        )}>
                          {leg.label}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 text-muted-foreground hover:text-primary"
                          onClick={() => addEntry(legIndex)}
                          title="Adicionar casa"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </td>
                  )}
                  
                  {/* Casa (Bookmaker) */}
                  <td className="py-1 px-1.5">
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
                  </td>
                  
                  {/* Odd */}
                  <td className="py-1 px-1.5">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={entry.odd}
                      onChange={(e) => updateEntry(legIndex, entryIndex, 'odd', e.target.value)}
                      placeholder="0.00"
                      className="h-7 text-right text-xs font-mono border-0 bg-muted/20 hover:bg-muted/40 focus:ring-1 tabular-nums"
                    />
                  </td>
                  
                  {/* Stake */}
                  <td className="py-1 px-1.5">
                    <div className="flex items-center gap-0.5">
                      <span className="text-[9px] text-muted-foreground">{entry.moeda}</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={entry.stake}
                        onChange={(e) => updateEntry(legIndex, entryIndex, 'stake', e.target.value)}
                        placeholder="0"
                        className="h-7 text-right text-xs font-mono border-0 bg-muted/20 hover:bg-muted/40 focus:ring-1 tabular-nums flex-1"
                      />
                    </div>
                  </td>
                  
                  {/* Target (direcionar lucro) */}
                  <td className="py-1 px-1.5 text-center">
                    <button
                      type="button"
                      onClick={() => setTargetedEntry(legIndex, entryIndex)}
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                        entry.isTargeted 
                          ? "border-primary bg-primary text-primary-foreground" 
                          : "border-muted-foreground/30 hover:border-muted-foreground/60"
                      )}
                      title="Direcionar lucro para esta entrada"
                    >
                      {entry.isTargeted && <Target className="h-3 w-3" />}
                    </button>
                  </td>
                  
                  {/* Lucro */}
                  <td className="py-1 px-1.5 text-right">
                    <span className={cn(
                      "text-xs font-medium tabular-nums",
                      hasData ? (isPositive ? "text-emerald-500" : "text-red-500") : "text-muted-foreground"
                    )}>
                      {hasData ? formatValue(lucro, true) : "—"}
                    </span>
                  </td>
                  
                  {/* ROI */}
                  <td className="py-1 px-1.5 text-right">
                    <span className={cn(
                      "text-xs tabular-nums",
                      hasData ? (isPositive ? "text-emerald-400" : "text-red-400") : "text-muted-foreground"
                    )}>
                      {hasData ? `${formatValue(roi, true)}%` : "—"}
                    </span>
                  </td>
                  
                  {/* Ações */}
                  <td className="py-1 px-1.5">
                    {leg.entries.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => removeEntry(legIndex, entryIndex)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rodapé: Totais */}
      <div className="flex items-center justify-between pt-3 border-t border-border/40">
        {/* Lado esquerdo: Controles */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="arredondar-table"
              checked={arredondarAtivado}
              onCheckedChange={setArredondarAtivado}
              className="scale-75"
            />
            <Label htmlFor="arredondar-table" className="text-[11px] text-muted-foreground cursor-pointer">
              Arredondar
            </Label>
            {arredondarAtivado && (
              <Input
                type="number"
                min="0"
                max="2"
                value={arredondarValor}
                onChange={(e) => setArredondarValor(e.target.value)}
                className="h-5 w-10 text-center text-[10px] border-muted bg-muted/30 px-1"
              />
            )}
          </div>
          
        </div>
        
        {/* Lado direito: Totais */}
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Lucro Total</p>
            <p className={cn(
              "text-base font-bold tabular-nums",
              lucroTotal >= 0 ? "text-emerald-500" : "text-red-500"
            )}>
              {stakeTotal > 0 ? formatValue(lucroTotal, true) : "—"}
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
    </div>
  );
}