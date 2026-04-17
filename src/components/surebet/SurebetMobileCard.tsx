/**
 * SurebetMobileCard - Layout mobile para pernas de arbitragem
 * 
 * Renderiza cada perna como um card vertical empilhado.
 * Visível apenas em viewports < 768px (md breakpoint).
 * Mantém 100% das funcionalidades da tabela desktop.
 */

import { KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, Check, Trash2 } from 'lucide-react';
import { BookmakerMetaRow } from '@/components/bookmakers/BookmakerSelectOption';
import { BookmakerSearchableSelectContent } from '@/components/bookmakers/BookmakerSearchableSelectContent';
import { type OddEntry, type LegScenario } from '@/hooks/useSurebetCalculator';
import { type SupportedCurrency } from '@/hooks/useCurrencySnapshot';
import { cn } from '@/lib/utils';
import { formatCurrency } from '@/components/bookmakers/BookmakerSelectOption';
import { type PernaResultado } from './SurebetTableRow';

/**
 * Formata valores monetários de forma compacta
 */
function formatCompactCurrency(value: number, currency: string): string {
  const absValue = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  
  if (absValue >= 100000) {
    const thousands = absValue / 1000;
    const formatted = thousands.toLocaleString('pt-BR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    return `${sign}${formatted}K`;
  }
  
  return sign + formatCurrency(absValue, currency);
}

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

interface SurebetMobileCardProps {
  entry: OddEntry;
  pernaIndex: number;
  label: string;
  scenario: LegScenario | undefined;
  isEditing: boolean;
  canEditStructure: boolean;
  isProcessing: boolean;
  bookmakers: BookmakerOption[];
  directedProfitLegs: number[];
  numPernas: number;
  moedaDominante: SupportedCurrency;
  hasInsufficientBalance?: boolean;
  insufficientEntries?: Map<string, boolean>;
  onResultadoChange?: (index: number, resultado: PernaResultado) => void;
  onUpdateOdd: (index: number, field: keyof OddEntry, value: string | boolean) => void;
  onSetReference: (index: number) => void;
  onToggleDirected: (index: number) => void;
  onAddEntry: (index: number) => void;
  onUpdateAdditionalEntry: (pernaIndex: number, entryIndex: number, field: string, value: string) => void;
  onRemoveAdditionalEntry: (pernaIndex: number, entryIndex: number) => void;
  onDeletePerna?: (index: number) => void;
  canDeletePerna?: boolean;
  onFieldKeyDown: (e: KeyboardEvent<HTMLInputElement>, fieldType: 'odd' | 'stake') => void;
}

export function SurebetMobileCard({
  entry,
  pernaIndex,
  label,
  scenario,
  isEditing,
  canEditStructure,
  isProcessing,
  bookmakers,
  directedProfitLegs,
  numPernas,
  moedaDominante,
  hasInsufficientBalance = false,
  insufficientEntries,
  onResultadoChange,
  onUpdateOdd,
  onSetReference,
  onToggleDirected,
  onAddEntry,
  onUpdateAdditionalEntry,
  onRemoveAdditionalEntry,
  onDeletePerna,
  canDeletePerna = false,
  onFieldKeyDown,
}: SurebetMobileCardProps) {
  const selectedBookmaker = bookmakers.find(b => b.id === entry.bookmaker_id);
  const lucro = scenario?.lucro ?? 0;
  const roi = scenario?.roi ?? 0;
  const hasScenarioData = scenario != null && (parseFloat(String(entry.odd)) > 0 && parseFloat(entry.stake) > 0);
  const isDirected = directedProfitLegs.includes(pernaIndex);
  const resultado = (entry as any).resultado as PernaResultado;
  const additionalEntries = entry.additionalEntries || [];
  const totalEntries = 1 + additionalEntries.length;
  const canAddMore = totalEntries < 5;

  // Cores por posição da perna
  const getPernaColor = () => {
    if (pernaIndex === 0) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (pernaIndex === numPernas - 1) return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    if (numPernas === 3 && pernaIndex === 1) return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  };

  const ResultadoButton = ({ 
    tipo, 
    btnLabel,
    selectedClass, 
    hoverClass,
  }: { 
    tipo: PernaResultado; 
    btnLabel: string;
    selectedClass: string;
    hoverClass: string;
  }) => {
    const isActive = resultado === tipo;
    return (
      <button
        type="button"
        onClick={() => onResultadoChange?.(pernaIndex, isActive ? null : tipo)}
        className={cn(
          "px-3 py-1.5 rounded text-xs font-medium transition-colors flex-1",
          isActive ? selectedClass : `text-muted-foreground/60 ${hoverClass}`
        )}
      >
        {btnLabel}
      </button>
    );
  };

  return (
    <div className={cn(
      "rounded-lg border border-border/50 bg-card/50 overflow-hidden",
      isProcessing && "opacity-60"
    )}>
      {/* Card Header: Perna number + controls */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border/30">
        <div className="flex items-center gap-2">
          <span className={cn(
            "inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm",
            getPernaColor()
          )}>
            {pernaIndex + 1}
          </span>
          <span className="text-xs text-muted-foreground">Perna {pernaIndex + 1}</span>
          {entry.selecaoLivre?.trim() && (
            <span className="text-[10px] text-muted-foreground/70">• {entry.selecaoLivre}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Referência */}
          {!isEditing && (
            <button
              type="button"
              onClick={() => onSetReference(pernaIndex)}
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                entry.isReference 
                  ? "border-primary bg-primary" 
                  : "border-muted-foreground/30"
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
                  : "border-muted-foreground/30"
              )}
              title="Distribuição"
            >
              {isDirected && <Check className="h-3 w-3" />}
            </button>
          )}
          {/* Delete perna */}
          {isEditing && canDeletePerna && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDeletePerna?.(pernaIndex)}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="p-3 space-y-3">
        {/* Casa (Bookmaker Select) */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Casa</label>
          <Select 
            value={entry.bookmaker_id}
            onValueChange={(v) => onUpdateOdd(pernaIndex, "bookmaker_id", v)}
          >
            <SelectTrigger className="h-9 text-xs w-full">
              <SelectValue placeholder="Selecione a casa">
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
            />
          </Select>
          <BookmakerMetaRow 
            bookmaker={selectedBookmaker ? {
              parceiro_nome: selectedBookmaker.parceiro_nome || null,
              moeda: selectedBookmaker.moeda,
              saldo_operavel: selectedBookmaker.saldo_operavel,
              saldo_freebet: selectedBookmaker.saldo_freebet,
              saldo_disponivel: selectedBookmaker.saldo_disponivel,
            } : null}
          />
        </div>

        {/* Odd + Stake lado a lado */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Odd</label>
            <Input 
              type="number"
              step="0.00001"
              placeholder="0.00"
              value={entry.odd}
              onChange={(e) => onUpdateOdd(pernaIndex, "odd", e.target.value)}
              className="h-9 text-sm text-center tabular-nums"
              onWheel={(e) => e.currentTarget.blur()}
              data-field-type="odd"
              onKeyDown={(e) => onFieldKeyDown(e, 'odd')}
            />
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Stake</label>
            {(() => {
              const mainInsuf = insufficientEntries?.get(`main-${pernaIndex}`) || false;
              const hasFBAvail = (selectedBookmaker?.saldo_freebet ?? 0) > 0;
              return (
                <>
                  <MoneyInput 
                    value={entry.stake}
                    onChange={(val) => onUpdateOdd(pernaIndex, "stake", val)}
                    currency={entry.moeda}
                    minDigits={6}
                    className={cn(
                      "h-9 text-sm text-center tabular-nums",
                      mainInsuf && "border-destructive focus-visible:ring-destructive/50"
                    )}
                    data-field-type="stake"
                    onKeyDown={(e) => onFieldKeyDown(e as any, 'stake')}
                  />
                  {mainInsuf && (
                    <span className="text-[9px] text-destructive font-medium mt-0.5 block text-center">
                      {entry.fonteSaldo === 'FREEBET' ? 'FB insuficiente' : 'Saldo insuficiente'}
                    </span>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Linha */}
        <div>
          <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Linha / Seleção</label>
          <Input
            placeholder="Ex: Mais de 2.5"
            value={entry.selecaoLivre}
            onChange={(e) => onUpdateOdd(pernaIndex, "selecaoLivre", e.target.value)}
            className="h-9 text-xs border-dashed"
          />
        </div>

        {/* Resultado (modo edição) */}
        {isEditing && (
          <div>
            <label className="text-[10px] text-muted-foreground uppercase mb-1 block">Resultado</label>
            <div className="flex rounded-md border border-border/40 bg-muted/20 p-0.5 gap-0.5">
              <ResultadoButton tipo="GREEN" btnLabel="Green" selectedClass="bg-emerald-500/20 text-emerald-500" hoverClass="hover:bg-emerald-500/20 hover:text-emerald-500" />
              <ResultadoButton tipo="RED" btnLabel="Red" selectedClass="bg-red-500/20 text-red-500" hoverClass="hover:bg-red-500/20 hover:text-red-500" />
              <ResultadoButton tipo="VOID" btnLabel="Void" selectedClass="bg-slate-500/20 text-slate-400" hoverClass="hover:bg-slate-500/20 hover:text-slate-400" />
            </div>
          </div>
        )}

        {/* Lucro + ROI */}
        <div className="flex items-center justify-between pt-2 border-t border-border/20">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-[10px] text-muted-foreground uppercase">Lucro</span>
              <div className={cn(
                "font-medium tabular-nums text-sm",
                lucro >= 0 ? "text-emerald-500" : "text-red-500"
              )}>
                {hasScenarioData ? formatCompactCurrency(lucro, moedaDominante) : "—"}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground uppercase">ROI</span>
              <div className={cn(
                "text-xs font-medium",
                roi >= 0 ? "text-emerald-500" : "text-red-500"
              )}>
                {hasScenarioData ? `${roi > 0 ? "+" : ""}${roi.toFixed(2)}%` : "—"}
              </div>
            </div>
          </div>
          {/* Add entry button */}
          {!isEditing && canAddMore && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onAddEntry(pernaIndex)}
              className="h-7 text-[10px]"
            >
              <Plus className="h-3 w-3 mr-1" />
              Casa
            </Button>
          )}
        </div>

        {/* Sub-entradas adicionais */}
        {additionalEntries.map((addEntry: any, addIndex: number) => {
          const addBookmaker = bookmakers.find(b => b.id === addEntry.bookmaker_id);
          return (
            <div key={`add-${pernaIndex}-${addIndex}`} className="pt-2 border-t border-border/20 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">Sub-entrada {addIndex + 1}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveAdditionalEntry(pernaIndex, addIndex)}
                  className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
              <Select 
                value={addEntry.bookmaker_id}
                onValueChange={(v) => onUpdateAdditionalEntry(pernaIndex, addIndex, 'bookmaker_id', v)}
              >
                <SelectTrigger className="h-8 text-xs w-full">
                  <SelectValue placeholder="Casa...">
                    {addBookmaker?.nome && (
                      <span className="truncate uppercase text-[10px]">{addBookmaker.nome}</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <BookmakerSearchableSelectContent
                  bookmakers={bookmakers}
                />
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <Input 
                  type="number"
                  step="0.00001"
                  placeholder="Odd"
                  value={addEntry.odd}
                  onChange={(e) => onUpdateAdditionalEntry(pernaIndex, addIndex, 'odd', e.target.value)}
                  className="h-8 text-xs text-center tabular-nums"
                  onWheel={(e) => e.currentTarget.blur()}
                />
                {(() => {
                  const subInsuf = insufficientEntries?.get(`sub-${pernaIndex}-${addIndex}`) || false;
                  const subHasFB = (addBookmaker?.saldo_freebet ?? 0) > 0;
                  const isSubFB = (addEntry as any).fonteSaldo === 'FREEBET';
                  return (
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1">
                        <MoneyInput 
                          value={addEntry.stake}
                          onChange={(val) => onUpdateAdditionalEntry(pernaIndex, addIndex, 'stake', val)}
                          currency={addEntry.moeda}
                          minDigits={6}
                          className={cn(
                            "h-8 text-xs text-center tabular-nums flex-1",
                            subInsuf && "border-destructive focus-visible:ring-destructive/50"
                          )}
                        />
                        {(subHasFB || isSubFB) && (
                          <button
                            type="button"
                            onClick={() => onUpdateAdditionalEntry(pernaIndex, addIndex, 'fonteSaldo', isSubFB ? 'REAL' : 'FREEBET')}
                            className={cn(
                              "shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold transition-colors border",
                              isSubFB
                                ? "bg-purple-500/20 text-purple-400 border-purple-500/40"
                                : "text-muted-foreground/40 border-transparent hover:text-muted-foreground/60"
                            )}
                          >
                            FB
                          </button>
                        )}
                      </div>
                      {subInsuf && (
                        <span className="text-[9px] text-destructive font-medium mt-0.5">
                          {isSubFB ? 'FB insuf.' : 'Saldo insuf.'}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
