/**
 * SurebetTableRow - Linha da tabela de arbitragem
 * 
 * Renderiza uma perna da arbitragem com:
 * - Seleção de bookmaker
 * - Inputs de odd/stake
 * - Checkbox de referência e D (distribuição)
 * - Lucro/ROI calculados
 * - Seletor de resultado por perna (modo edição)
 */

import { KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, Check, Trash2 } from 'lucide-react';
import { BookmakerSelectOption, BookmakerMetaRow, formatCurrency } from '@/components/bookmakers/BookmakerSelectOption';
import { BookmakerSearchableSelectContent } from '@/components/bookmakers/BookmakerSearchableSelectContent';
import { type OddEntry, type LegScenario } from '@/hooks/useSurebetCalculator';
import { type SupportedCurrency } from '@/hooks/useCurrencySnapshot';
import { getFirstLastName } from '@/lib/utils';
import { cn } from '@/lib/utils';

/**
 * Formata valores monetários de forma compacta para alta densidade
 * Valores >= 100.000 são exibidos como "110,05K"
 */
function formatCompactCurrency(value: number, currency: string): string {
  const absValue = Math.abs(value);
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  
  if (absValue >= 100000) {
    // Formato compacto: 110500 → 110,50K
    const thousands = absValue / 1000;
    const formatted = thousands.toLocaleString('pt-BR', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
    return `${sign}${formatted}K`;
  }
  
  // Formato normal para valores menores
  return sign + formatCurrency(absValue, currency);
}

/** Tipos de resultado possíveis para uma perna */
export type PernaResultado = 'GREEN' | 'RED' | 'MEIO_GREEN' | 'MEIO_RED' | 'VOID' | null;

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

interface SurebetTableRowProps {
  entry: OddEntry;
  pernaIndex: number;
  label: string;
  rowSpan: number;
  scenario: LegScenario | undefined;
  isEditing: boolean;
  canEditStructure: boolean;
  isFocused: boolean;
  isProcessing: boolean;
  bookmakers: BookmakerOption[];
  directedProfitLegs: number[];
  numPernas: number;
  moedaDominante: SupportedCurrency;
  /** Indica se esta perna tem saldo insuficiente */
  hasInsufficientBalance?: boolean;
  /** Map granular de entradas insuficientes: "main-{idx}" ou "sub-{idx}-{subIdx}" */
  insufficientEntries?: Map<string, boolean>;
  /** Callback para alterar resultado da perna (modo edição) */
  onResultadoChange?: (index: number, resultado: PernaResultado) => void;
  onUpdateOdd: (index: number, field: keyof OddEntry, value: string | boolean) => void;
  onSetReference: (index: number) => void;
  onToggleDirected: (index: number) => void;
  onAddEntry: (index: number) => void;
  onUpdateAdditionalEntry: (pernaIndex: number, entryIndex: number, field: string, value: string) => void;
  onRemoveAdditionalEntry: (pernaIndex: number, entryIndex: number) => void;
  onDeletePerna?: (index: number) => void;
  canDeletePerna?: boolean;
  onFocus: (index: number) => void;
  onBlur: () => void;
  onFieldKeyDown: (e: KeyboardEvent<HTMLInputElement>, fieldType: 'odd' | 'stake') => void;
}

export function SurebetTableRow({
  entry,
  pernaIndex,
  label,
  rowSpan,
  scenario,
  isEditing,
  canEditStructure,
  isFocused,
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
  onFocus,
  onBlur,
  onFieldKeyDown
}: SurebetTableRowProps) {
  const selectedBookmaker = bookmakers.find(b => b.id === entry.bookmaker_id);
  const lucro = scenario?.lucro ?? 0;
  const roi = scenario?.roi ?? 0;
  const hasScenarioData = scenario != null && (parseFloat(String(entry.odd)) > 0 && parseFloat(entry.stake) > 0);
  const isDirected = directedProfitLegs.includes(pernaIndex);
  
  // Resultado atual da perna (armazenado no entry)
  const resultado = (entry as any).resultado as PernaResultado;
  
  const additionalEntries = entry.additionalEntries || [];
  const totalEntries = 1 + additionalEntries.length;
  const canAddMore = totalEntries < 5;

  // Cores por posição da perna
  const getPernaColor = () => {
    if (pernaIndex === 0) return "bg-blue-500/20 text-blue-600 dark:text-blue-400";
    if (pernaIndex === numPernas - 1) return "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400";
    if (numPernas === 3 && pernaIndex === 1) return "bg-amber-500/20 text-amber-600 dark:text-amber-400";
    return "bg-purple-500/20 text-purple-600 dark:text-purple-400";
  };
  
  // Componente de botão de resultado - estilo padronizado igual ao Aposta Simples
  const ResultadoButton = ({ 
    tipo, 
    label,
    selectedClass, 
    hoverClass,
    hidden = false 
  }: { 
    tipo: PernaResultado; 
    label: string;
    selectedClass: string;
    hoverClass: string;
    hidden?: boolean;
  }) => {
    const isActive = resultado === tipo;
    return (
      <button
        type="button"
        onClick={() => onResultadoChange?.(pernaIndex, isActive ? null : tipo)}
        className={cn(
          "px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
          hidden && !isActive ? "hidden group-hover:inline-block" : "",
          isActive 
            ? selectedClass
            : `text-muted-foreground/60 ${hoverClass}`
        )}
        title={tipo || "Limpar"}
      >
        {label}
      </button>
    );
  };

  const mainRowSpan = totalEntries;

  return (
    <>
      <tr 
        className={`border-b border-border/30 relative ${
          isFocused ? "bg-muted/30" : "hover:bg-muted/20"
        }`}
        style={{ height: '78px' }}
        onMouseEnter={() => canEditStructure && onFocus(pernaIndex)}
        onMouseLeave={() => canEditStructure && onBlur()}
      >
...
        {/* Referência (Target) */}
        {canEditStructure && (
          <td rowSpan={mainRowSpan} className="px-2 text-center align-middle" style={{ height: '78px' }}>
            <button
              type="button"
              onClick={() => onSetReference(pernaIndex)}
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                entry.isReference 
                  ? "border-primary bg-primary" 
                  : "border-muted-foreground/30 hover:border-muted-foreground/50"
              }`}
            >
              {entry.isReference && <div className="w-2 h-2 rounded-full bg-white" />}
            </button>
          </td>
        )}
...
        {/* D (distribuição) */}
        {canEditStructure && (
          <td rowSpan={mainRowSpan} className="px-2 text-center align-middle" style={{ height: '78px' }}>
            <button
              type="button"
              onClick={() => onToggleDirected(pernaIndex)}
              className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${
                isDirected 
                  ? "border-primary bg-primary text-primary-foreground" 
                  : "border-muted-foreground/30 hover:border-muted-foreground/50"
              }`}
              title={isDirected ? "Lucro direcionado para esta perna" : "Lucro não direcionado para esta perna"}
            >
              {isDirected && <Check className="h-3 w-3" />}
            </button>
          </td>
        )}
...
        {/* Ações */}
        {canEditStructure && (
          <td rowSpan={mainRowSpan} className="px-1 align-middle" style={{ height: '78px' }}>
            {canAddMore && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onAddEntry(pernaIndex)}
                className="h-7 w-7 p-0"
                title="Adicionar casa"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </td>
        )}
        {!canEditStructure && (
          <td rowSpan={mainRowSpan} className="px-1 text-center align-middle" style={{ height: '78px' }}>
            {canDeletePerna && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onDeletePerna?.(pernaIndex)}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                title="Excluir esta perna"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </td>
        )}
      </tr>

      {/* Sub-entradas adicionais */}
      {additionalEntries.map((addEntry, addIndex) => {
        const addBookmaker = bookmakers.find(b => b.id === addEntry.bookmaker_id);
        return (
          <tr 
            key={`add-${pernaIndex}-${addIndex}`}
            className="border-b border-border/20 bg-muted/10"
            style={{ height: '52px' }}
          >
            {/* Casa */}
            <td className="px-2" style={{ height: '52px' }}>
              <div className="flex flex-col">
                <Select 
                  value={addEntry.bookmaker_id}
                  onValueChange={(v) => onUpdateAdditionalEntry(pernaIndex, addIndex, 'bookmaker_id', v)}
                >
                  <SelectTrigger className="h-7 text-[10px] w-full">
                    <SelectValue placeholder="Casa...">
                      {addBookmaker?.nome && (
                        <span className="truncate uppercase text-[9px]">{addBookmaker.nome}</span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <BookmakerSearchableSelectContent
                    bookmakers={bookmakers}
                    className="max-w-[300px]"
                  />
                </Select>
                <BookmakerMetaRow 
                  bookmaker={addBookmaker ? {
                    parceiro_nome: addBookmaker.parceiro_nome || null,
                    moeda: addBookmaker.moeda,
                    saldo_operavel: addBookmaker.saldo_operavel,
                    saldo_freebet: addBookmaker.saldo_freebet,
                    saldo_disponivel: addBookmaker.saldo_disponivel,
                  } : null}
                />
              </div>
            </td>
            
            {/* Odd */}
            <td className="px-1" style={{ height: '52px' }}>
              <Input 
                type="number"
                step="0.00001"
                placeholder="0.00"
                value={addEntry.odd}
                onChange={(e) => onUpdateAdditionalEntry(pernaIndex, addIndex, 'odd', e.target.value)}
                className="h-7 text-xs text-center px-0.5 w-[68px] tabular-nums"
                onWheel={(e) => e.currentTarget.blur()}
              />
            </td>
            
            {/* Stake + FB toggle */}
            <td className="px-1" style={{ height: '52px' }}>
              {(() => {
                const subInsufficient = insufficientEntries?.get(`sub-${pernaIndex}-${addIndex}`) || false;
                const subHasFB = (addBookmaker?.saldo_freebet ?? 0) > 0;
                const isSubFB = (addEntry as any).fonteSaldo === 'FREEBET';
                return (
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="flex items-center gap-1">
                      <MoneyInput 
                        value={addEntry.stake}
                        onChange={(val) => onUpdateAdditionalEntry(pernaIndex, addIndex, 'stake', val)}
                        currency={addEntry.moeda}
                        minDigits={6}
                        className={cn(
                          "h-7 text-xs text-center tabular-nums",
                          isSubFB ? "w-[72px]" : "w-[90px]",
                          subInsufficient ? "border-destructive focus-visible:ring-destructive/50" : ""
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
                              : "text-muted-foreground/40 border-transparent hover:text-muted-foreground/60 hover:border-border/40"
                          )}
                          title={isSubFB ? "FB ativo" : "Usar Freebet"}
                        >
                          FB
                        </button>
                      )}
                    </div>
                    {subInsufficient && (
                      <span className="text-[9px] text-destructive font-medium">
                        {isSubFB ? 'FB insuf.' : 'Saldo insuf.'}
                      </span>
                    )}
                  </div>
                );
              })()}
            </td>
            
            {/* Linha (vazia para sub-entradas) + Remove */}
            <td className="px-2" style={{ height: '52px' }}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onRemoveAdditionalEntry(pernaIndex, addIndex)}
                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                title="Remover sub-entrada"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </td>
            
            {/* Colunas spanadas pela main row - não renderizar */}
          </tr>
        );
      })}
    </>
  );
}
