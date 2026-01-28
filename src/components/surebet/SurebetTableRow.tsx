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
import { Plus, Minus, Check, Trophy, X, Ban, Divide } from 'lucide-react';
import { BookmakerSelectOption, BookmakerMetaRow, formatCurrency } from '@/components/bookmakers/BookmakerSelectOption';
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
}

interface SurebetTableRowProps {
  entry: OddEntry;
  pernaIndex: number;
  label: string;
  rowSpan: number;
  scenario: LegScenario | undefined;
  isEditing: boolean;
  isFocused: boolean;
  isProcessing: boolean;
  bookmakers: BookmakerOption[];
  directedProfitLegs: number[];
  numPernas: number;
  moedaDominante: SupportedCurrency;
  /** Indica se esta perna tem saldo insuficiente */
  hasInsufficientBalance?: boolean;
  /** Callback para alterar resultado da perna (modo edição) */
  onResultadoChange?: (index: number, resultado: PernaResultado) => void;
  onUpdateOdd: (index: number, field: keyof OddEntry, value: string | boolean) => void;
  onSetReference: (index: number) => void;
  onToggleDirected: (index: number) => void;
  onAddEntry: (index: number) => void;
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
  isFocused,
  isProcessing,
  bookmakers,
  directedProfitLegs,
  numPernas,
  moedaDominante,
  hasInsufficientBalance = false,
  onResultadoChange,
  onUpdateOdd,
  onSetReference,
  onToggleDirected,
  onAddEntry,
  onFocus,
  onBlur,
  onFieldKeyDown
}: SurebetTableRowProps) {
  const selectedBookmaker = bookmakers.find(b => b.id === entry.bookmaker_id);
  const lucro = scenario?.lucro || 0;
  const roi = scenario?.roi || 0;
  const isDirected = directedProfitLegs.includes(pernaIndex);
  
  // Resultado atual da perna (armazenado no entry)
  const resultado = (entry as any).resultado as PernaResultado;

  // Cores por posição da perna
  const getPernaColor = () => {
    if (pernaIndex === 0) return "bg-blue-500/20 text-blue-400";
    if (pernaIndex === numPernas - 1) return "bg-emerald-500/20 text-emerald-400";
    if (numPernas === 3 && pernaIndex === 1) return "bg-amber-500/20 text-amber-400";
    return "bg-purple-500/20 text-purple-400";
  };
  
  // Componente de botão de resultado
  const ResultadoButton = ({ tipo, icon: Icon, activeClass }: { tipo: PernaResultado; icon: any; activeClass: string }) => {
    const isActive = resultado === tipo;
    return (
      <button
        type="button"
        onClick={() => onResultadoChange?.(pernaIndex, isActive ? null : tipo)}
        className={cn(
          "w-7 h-7 rounded-md flex items-center justify-center transition-all",
          isActive 
            ? activeClass 
            : "bg-muted/50 text-muted-foreground hover:bg-muted"
        )}
        title={tipo || "Limpar"}
      >
        <Icon className="h-3.5 w-3.5" />
      </button>
    );
  };

  return (
    <tr 
      className={`border-b border-border/30 relative ${
        isFocused ? "bg-muted/30" : "hover:bg-muted/20"
      }`}
      style={{ height: '78px' }}
      onMouseEnter={() => !isEditing && onFocus(pernaIndex)}
      onMouseLeave={() => !isEditing && onBlur()}
    >
      {/* Loading OCR - posicionado absolutamente para não afetar layout */}
      {isProcessing && (
        <td colSpan={10} className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 pointer-events-none">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Analisando print...
          </div>
        </td>
      )}
      
      {/* Perna Label */}
      {rowSpan > 0 && (
        <td rowSpan={rowSpan} className="px-2 text-center align-middle" style={{ height: '78px' }}>
          <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg font-bold text-sm ${getPernaColor()}`}>
            {pernaIndex + 1}
          </div>
          {entry.selecaoLivre?.trim() && (
            <div className="text-[10px] text-muted-foreground truncate max-w-[60px] mt-0.5">
              {entry.selecaoLivre}
            </div>
          )}
        </td>
      )}
      
      {/* Casa */}
      <td className="px-2" style={{ height: '78px' }}>
        {isEditing ? (
          <div className="flex flex-col">
            <div className="text-xs font-medium uppercase truncate text-center">
              {selectedBookmaker?.nome || "—"}
            </div>
            {/* Metadados fixos - altura fixa para evitar layout jumps */}
            <BookmakerMetaRow 
              bookmaker={selectedBookmaker ? {
                parceiro_nome: selectedBookmaker.parceiro_nome || null,
                moeda: selectedBookmaker.moeda,
                saldo_operavel: selectedBookmaker.saldo_operavel
              } : null}
            />
          </div>
        ) : (
          <div className="flex flex-col">
            <Select 
              value={entry.bookmaker_id}
              onValueChange={(v) => onUpdateOdd(pernaIndex, "bookmaker_id", v)}
            >
              <SelectTrigger className="h-8 text-[10px] w-full">
                <SelectValue placeholder="Selecione">
                  {selectedBookmaker?.nome && (
                    <span className="truncate uppercase">{selectedBookmaker.nome}</span>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-w-[300px]">
                {bookmakers.map(bk => (
                  <SelectItem key={bk.id} value={bk.id}>
                    <BookmakerSelectOption
                      bookmaker={{
                        id: bk.id,
                        nome: bk.nome,
                        parceiro_nome: bk.parceiro_nome,
                        moeda: bk.moeda,
                        saldo_operavel: bk.saldo_operavel,
                        saldo_disponivel: bk.saldo_disponivel,
                        saldo_freebet: bk.saldo_freebet,
                        saldo_bonus: bk.saldo_bonus,
                        logo_url: bk.logo_url,
                        bonus_rollover_started: bk.bonus_rollover_started,
                      }}
                    />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Metadados fixos - altura fixa para evitar layout jumps */}
            <BookmakerMetaRow 
              bookmaker={selectedBookmaker ? {
                parceiro_nome: selectedBookmaker.parceiro_nome || null,
                moeda: selectedBookmaker.moeda,
                saldo_operavel: selectedBookmaker.saldo_operavel
              } : null}
            />
          </div>
        )}
      </td>
      
      {/* Odd - compacto para até 20,650 (2 dígitos + 3 decimais) */}
      <td className="px-1" style={{ height: '78px' }}>
        {isEditing ? (
          <div className="text-sm font-medium text-center tabular-nums">{entry.odd || "—"}</div>
        ) : (
          <Input 
            type="number"
            step="0.001"
            placeholder="0.00"
            value={entry.odd}
            onChange={(e) => onUpdateOdd(pernaIndex, "odd", e.target.value)}
            className="h-8 text-xs text-center px-0.5 w-[68px] tabular-nums"
            onWheel={(e) => e.currentTarget.blur()}
            data-field-type="odd"
            onKeyDown={(e) => onFieldKeyDown(e, 'odd')}
          />
        )}
      </td>
      
      {/* Stake - compacto para até 150999 (6-7 dígitos) */}
      <td className="px-1" style={{ height: '78px' }}>
        {isEditing ? (
          <div className="text-xs font-medium text-center tabular-nums">
            {formatCurrency(parseFloat(entry.stake) || 0, entry.moeda)}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-0.5">
            <MoneyInput 
              value={entry.stake}
              onChange={(val) => onUpdateOdd(pernaIndex, "stake", val)}
              currency={entry.moeda}
              minDigits={6}
              className={`h-8 text-xs text-center w-[90px] tabular-nums ${
                hasInsufficientBalance ? "border-destructive focus-visible:ring-destructive/50" : ""
              }`}
              data-field-type="stake"
              onKeyDown={(e) => onFieldKeyDown(e as any, 'stake')}
            />
            {hasInsufficientBalance && (
              <span className="text-[9px] text-destructive font-medium">Saldo insuf.</span>
            )}
          </div>
        )}
      </td>
      
      {/* Linha */}
      <td className="px-2" style={{ height: '78px' }}>
        {isEditing ? (
          <div className="text-xs text-muted-foreground text-center truncate">
            {entry.selecaoLivre || "—"}
          </div>
        ) : (
          <Input
            placeholder="Linha"
            value={entry.selecaoLivre}
            onChange={(e) => onUpdateOdd(pernaIndex, "selecaoLivre", e.target.value)}
            className="h-8 text-xs px-1 border-dashed w-20"
          />
        )}
      </td>
      
      {/* Referência (Target) - só no modo criação */}
      {!isEditing && (
        <td className="px-2 text-center" style={{ height: '78px' }}>
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
      
      {/* Resultado - só no modo edição */}
      {isEditing && (
        <td className="px-1 text-center" style={{ height: '78px' }}>
          <div className="flex flex-wrap items-center justify-center gap-1 max-w-[150px]">
            <ResultadoButton 
              tipo="GREEN" 
              icon={Trophy} 
              activeClass="bg-emerald-500 text-white"
            />
            <ResultadoButton 
              tipo="MEIO_GREEN" 
              icon={Divide} 
              activeClass="bg-emerald-400 text-white"
            />
            <ResultadoButton 
              tipo="MEIO_RED" 
              icon={Divide} 
              activeClass="bg-red-400 text-white"
            />
            <ResultadoButton 
              tipo="RED" 
              icon={X} 
              activeClass="bg-red-500 text-white"
            />
            <ResultadoButton 
              tipo="VOID" 
              icon={Ban} 
              activeClass="bg-gray-500 text-white"
            />
          </div>
        </td>
      )}
      
      {/* Checkbox D — Distribuição de lucro */}
      {!isEditing && (
        <td className="px-2 text-center" style={{ height: '78px' }}>
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
      
      {/* Lucro - formatação compacta para valores > 100.000 */}
      <td className="px-1 text-center" style={{ height: '78px' }}>
        <span className={`font-medium tabular-nums ${
          lucro >= 0 ? "text-emerald-500" : "text-red-500"
        } ${Math.abs(lucro) >= 100000 ? "text-[11px]" : "text-sm"}`}>
          {lucro !== 0 ? formatCompactCurrency(lucro, moedaDominante) : "—"}
        </span>
      </td>
      
      {/* ROI */}
      <td className="px-2 text-center" style={{ height: '78px' }}>
        <span className={`text-xs ${
          roi >= 0 ? "text-emerald-500" : "text-red-500"
        }`}>
          {roi !== 0 ? `${roi > 0 ? "+" : ""}${roi.toFixed(2)}%` : "—"}
        </span>
      </td>
      
      {/* Ações */}
      {!isEditing && (
        <td className="px-1" style={{ height: '78px' }}>
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
        </td>
      )}
    </tr>
  );
}
