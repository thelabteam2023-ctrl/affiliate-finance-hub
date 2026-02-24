/**
 * SurebetColumnsView - Layout horizontal (colunas lado a lado)
 * para SurebetModalRoot
 * 
 * Cada perna é uma coluna vertical com inputs compactos.
 * Lucro e ROI consolidados no rodapé de cada coluna.
 * 
 * Usa os mesmos tipos e handlers do SurebetModalRoot (OddEntry[]).
 */
import { KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Check } from 'lucide-react';
import { BookmakerSearchableSelectContent } from '@/components/bookmakers/BookmakerSearchableSelectContent';
import { formatCurrency } from '@/components/bookmakers/BookmakerSelectOption';
import { type OddEntry, type LegScenario } from '@/hooks/useSurebetCalculator';
import { type SupportedCurrency } from '@/hooks/useCurrencySnapshot';
import { cn } from '@/lib/utils';
import type { PernaResultado } from './SurebetTableRow';

interface BookmakerOption {
  id: string;
  nome: string;
  parceiro_nome?: string | null;
  moeda: string;
  saldo_operavel: number;
  saldo_disponivel: number;
  saldo_freebet: number;
  saldo_bonus?: number;
  logo_url?: string | null;
  bonus_rollover_started?: boolean;
  instance_identifier?: string | null;
}

interface SurebetColumnsViewProps {
  odds: OddEntry[];
  scenarios: (LegScenario | undefined)[];
  isEditing: boolean;
  bookmakersByLeg: (legIndex: number) => BookmakerOption[];
  directedProfitLegs: number[];
  numPernas: number;
  moedaDominante: SupportedCurrency;
  insufficientLegs: number[];
  onResultadoChange?: (index: number, resultado: PernaResultado) => void;
  onUpdateOdd: (index: number, field: keyof OddEntry, value: string | boolean) => void;
  onSetReference: (index: number) => void;
  onToggleDirected: (index: number) => void;
  onAddEntry: (index: number) => void;
  onDeletePerna?: (index: number) => void;
  canDeletePerna?: boolean;
  onFocus: (index: number) => void;
  onBlur: () => void;
  onFieldKeyDown: (e: KeyboardEvent<HTMLInputElement>, fieldType: 'odd' | 'stake') => void;
  getPernaLabel: (index: number, total: number) => string;
}

function formatCompactValue(value: number, showSign = true): string {
  const absValue = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  
  if (absValue >= 100000) {
    const thousands = absValue / 1000;
    const formatted = thousands.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${sign}${formatted}K`;
  }
  
  const formatted = absValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return showSign ? `${sign}${formatted}` : formatted;
}

const PERNA_COLORS = [
  "bg-blue-500/20 text-blue-400",
  "bg-amber-500/20 text-amber-400",
  "bg-emerald-500/20 text-emerald-400",
  "bg-purple-500/20 text-purple-400",
  "bg-pink-500/20 text-pink-400",
];

function getPernaColor(index: number, total: number) {
  if (index === 0) return PERNA_COLORS[0];
  if (index === total - 1) return PERNA_COLORS[2];
  if (total === 3 && index === 1) return PERNA_COLORS[1];
  return PERNA_COLORS[Math.min(index, PERNA_COLORS.length - 1)];
}

export function SurebetColumnsView({
  odds,
  scenarios,
  isEditing,
  bookmakersByLeg,
  directedProfitLegs,
  numPernas,
  moedaDominante,
  insufficientLegs,
  onResultadoChange,
  onUpdateOdd,
  onSetReference,
  onToggleDirected,
  onAddEntry,
  onDeletePerna,
  canDeletePerna = false,
  onFocus,
  onBlur,
  onFieldKeyDown,
  getPernaLabel,
}: SurebetColumnsViewProps) {

  return (
    <div className="w-full space-y-3">
      {/* Colunas lado a lado */}
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${odds.length}, 1fr)` }}>
        {odds.map((entry, pernaIndex) => {
          const scenario = scenarios[pernaIndex];
          const lucro = scenario?.lucro ?? 0;
          const roi = scenario?.roi ?? 0;
          const hasData = parseFloat(String(entry.odd)) > 0 && parseFloat(entry.stake) > 0;
          const isPositive = lucro >= 0;
          const bookmakers = bookmakersByLeg(pernaIndex);
          const selectedBookmaker = bookmakers.find(b => b.id === entry.bookmaker_id);
          const isDirected = directedProfitLegs.includes(pernaIndex);
          const hasInsufficientBalance = insufficientLegs.includes(pernaIndex);

          return (
            <div 
              key={pernaIndex} 
              className="flex flex-col rounded-lg border border-border/40 bg-card/50 overflow-hidden"
              onMouseEnter={() => !isEditing && onFocus(pernaIndex)}
              onMouseLeave={() => !isEditing && onBlur()}
            >
              {/* Header da coluna */}
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "w-8 h-8 rounded-lg font-bold text-sm flex items-center justify-center",
                    getPernaColor(pernaIndex, numPernas)
                  )}>
                    {pernaIndex + 1}
                  </span>
                  {entry.selecaoLivre?.trim() && (
                    <span className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                      {entry.selecaoLivre}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {/* Referência */}
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => onSetReference(pernaIndex)}
                      className={cn(
                        "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                        entry.isReference 
                          ? "border-primary bg-primary" 
                          : "border-muted-foreground/30 hover:border-muted-foreground/50"
                      )}
                      title="Referência"
                    >
                      {entry.isReference && <div className="w-2 h-2 rounded-full bg-white" />}
                    </button>
                  )}
                  {/* Distribuição */}
                  {!isEditing && (
                    <button
                      type="button"
                      onClick={() => onToggleDirected(pernaIndex)}
                      className={cn(
                        "w-5 h-5 rounded border flex items-center justify-center transition-colors",
                        isDirected 
                          ? "border-primary bg-primary text-primary-foreground" 
                          : "border-muted-foreground/30 hover:border-muted-foreground/50"
                      )}
                      title={isDirected ? "Lucro direcionado" : "Lucro não direcionado"}
                    >
                      {isDirected && <Check className="h-3 w-3" />}
                    </button>
                  )}
                </div>
              </div>

              {/* Corpo - inputs compactos */}
              <div className="flex-1 px-3 py-2 space-y-2">
                {/* Casa (Bookmaker) */}
                <Select 
                  value={entry.bookmaker_id}
                  onValueChange={(v) => onUpdateOdd(pernaIndex, "bookmaker_id", v)}
                >
                  <SelectTrigger className="h-8 text-[10px] w-full">
                    <SelectValue placeholder="Selecione">
                      {selectedBookmaker?.nome && (
                        <span className="truncate uppercase">
                          {selectedBookmaker.nome}
                          {selectedBookmaker.instance_identifier && (
                            <span className="text-primary/80 ml-1 normal-case text-[9px]">({selectedBookmaker.instance_identifier})</span>
                          )}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <BookmakerSearchableSelectContent
                    bookmakers={bookmakers}
                    className="max-w-[300px]"
                  />
                </Select>

                {/* Saldo info */}
                {selectedBookmaker && (
                  <div className="text-[9px] text-muted-foreground flex items-center gap-1 px-0.5">
                    <span>{selectedBookmaker.moeda}</span>
                    <span>{formatCurrency(selectedBookmaker.saldo_operavel, selectedBookmaker.moeda)}</span>
                    {selectedBookmaker.saldo_freebet > 0 && (
                      <span className="text-amber-400">🎁 {formatCurrency(selectedBookmaker.saldo_freebet, selectedBookmaker.moeda)}</span>
                    )}
                  </div>
                )}

                {/* Odd + Stake */}
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5 block">Odd</label>
                    <Input 
                      type="number"
                      step="0.001"
                      placeholder="0.00"
                      value={entry.odd}
                      onChange={(e) => onUpdateOdd(pernaIndex, "odd", e.target.value)}
                      className="h-8 text-xs text-center tabular-nums"
                      onWheel={(e) => e.currentTarget.blur()}
                      data-field-type="odd"
                      onKeyDown={(e) => onFieldKeyDown(e, 'odd')}
                    />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground uppercase tracking-wide mb-0.5 block">Stake</label>
                    <MoneyInput 
                      value={entry.stake}
                      onChange={(val) => onUpdateOdd(pernaIndex, "stake", val)}
                      currency={entry.moeda}
                      minDigits={5}
                      className={cn(
                        "h-8 text-xs text-center tabular-nums",
                        hasInsufficientBalance && "border-destructive focus-visible:ring-destructive/50"
                      )}
                      data-field-type="stake"
                      onKeyDown={(e) => onFieldKeyDown(e as any, 'stake')}
                    />
                    {hasInsufficientBalance && (
                      <span className="text-[9px] text-destructive font-medium mt-0.5 block text-center">Saldo insuf.</span>
                    )}
                  </div>
                </div>

                {/* Linha */}
                <Input
                  placeholder="Linha"
                  value={entry.selecaoLivre}
                  onChange={(e) => onUpdateOdd(pernaIndex, "selecaoLivre", e.target.value)}
                  className="h-7 text-xs px-2 border-dashed"
                />

                {/* Resultado (modo edição) */}
                {isEditing && (
                  <div className="flex flex-wrap gap-0.5">
                    {([
                      { tipo: 'GREEN' as PernaResultado, label: 'Green', cls: 'bg-emerald-500/20 text-emerald-500', hover: 'hover:bg-emerald-500/20 hover:text-emerald-500' },
                      { tipo: 'RED' as PernaResultado, label: 'Red', cls: 'bg-red-500/20 text-red-500', hover: 'hover:bg-red-500/20 hover:text-red-500' },
                      { tipo: 'VOID' as PernaResultado, label: 'Void', cls: 'bg-slate-500/20 text-slate-400', hover: 'hover:bg-slate-500/20 hover:text-slate-400' },
                    ]).map(({ tipo, label, cls, hover }) => {
                      const resultado = (entry as any).resultado as PernaResultado;
                      const isActive = resultado === tipo;
                      return (
                        <button
                          key={tipo}
                          type="button"
                          onClick={() => onResultadoChange?.(pernaIndex, isActive ? null : tipo)}
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                            isActive ? cls : `text-muted-foreground/60 ${hover}`
                          )}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Add entry / Delete perna */}
                <div className="flex items-center justify-between pt-1">
                  {!isEditing && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onAddEntry(pernaIndex)}
                      className="h-6 text-[10px] px-2 text-muted-foreground hover:text-primary"
                      title="Adicionar casa"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Casa
                    </Button>
                  )}
                  {isEditing && canDeletePerna && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeletePerna?.(pernaIndex)}
                      className="h-6 text-[10px] px-2 text-muted-foreground hover:text-destructive"
                      title="Excluir perna"
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Excluir
                    </Button>
                  )}
                </div>
              </div>

              {/* Footer: Lucro e ROI */}
              <div className="px-3 py-2 bg-muted/20 border-t border-border/30 space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Lucro</span>
                  <span className={cn(
                    "text-sm font-bold tabular-nums",
                    hasData && scenario ? (isPositive ? "text-emerald-500" : "text-red-500") : "text-muted-foreground"
                  )}>
                    {hasData && scenario ? formatCompactValue(lucro) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide">ROI</span>
                  <span className={cn(
                    "text-[11px] tabular-nums",
                    hasData && scenario ? (isPositive ? "text-emerald-400" : "text-red-400") : "text-muted-foreground"
                  )}>
                    {hasData && scenario ? `${roi > 0 ? "+" : ""}${roi.toFixed(2)}%` : "—"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
