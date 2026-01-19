/**
 * SurebetTableRow - Linha da tabela de arbitragem
 * 
 * Renderiza uma perna da arbitragem com:
 * - Seleção de bookmaker
 * - Inputs de odd/stake
 * - Checkbox de referência e D (distribuição)
 * - Lucro/ROI calculados
 */

import { KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Plus, Minus, Check } from 'lucide-react';
import { BookmakerSelectOption, formatCurrency } from '@/components/bookmakers/BookmakerSelectOption';
import { type OddEntry, type LegScenario } from '@/hooks/useSurebetCalculator';
import { type SupportedCurrency } from '@/hooks/useCurrencySnapshot';

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

  // Cores por posição da perna
  const getPernaColor = () => {
    if (pernaIndex === 0) return "bg-blue-500/20 text-blue-400";
    if (pernaIndex === numPernas - 1) return "bg-emerald-500/20 text-emerald-400";
    if (numPernas === 3 && pernaIndex === 1) return "bg-amber-500/20 text-amber-400";
    return "bg-purple-500/20 text-purple-400";
  };

  return (
    <tr 
      tabIndex={0}
      className={`border-b border-border/30 transition-colors relative outline-none ${
        isFocused 
          ? "bg-primary/5 ring-1 ring-inset ring-primary/30" 
          : "hover:bg-muted/30"
      }`}
      onFocus={() => !isEditing && onFocus(pernaIndex)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          onBlur();
        }
      }}
      onClick={() => !isEditing && onFocus(pernaIndex)}
    >
      {/* Indicador de foco para paste */}
      {isFocused && !isEditing && (
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <div className="bg-primary/90 text-primary-foreground text-[9px] px-2 py-0.5 rounded whitespace-nowrap">
            Ctrl+V para colar print
          </div>
        </div>
      )}
      
      {/* Loading OCR */}
      {isProcessing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 pointer-events-none">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Analisando print...
          </div>
        </div>
      )}
      
      {/* Perna Label */}
      {rowSpan > 0 && (
        <td rowSpan={rowSpan} className="py-2 px-2 text-center align-middle">
          <div className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-sm ${getPernaColor()}`}>
            {label}
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5 truncate max-w-[60px]">
            {entry.selecao}
          </div>
        </td>
      )}
      
      {/* Casa */}
      <td className="py-1 px-2">
        {isEditing ? (
          <div className="text-xs font-medium uppercase truncate">
            {selectedBookmaker?.nome || "—"}
          </div>
        ) : (
          <Select 
            value={entry.bookmaker_id}
            onValueChange={(v) => onUpdateOdd(pernaIndex, "bookmaker_id", v)}
          >
            <SelectTrigger className="h-7 text-[10px] w-full">
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
        )}
      </td>
      
      {/* Odd */}
      <td className="py-1 px-2">
        {isEditing ? (
          <div className="text-xs font-medium text-center">{entry.odd || "—"}</div>
        ) : (
          <Input 
            type="number"
            step="0.01"
            placeholder="0.00"
            value={entry.odd}
            onChange={(e) => onUpdateOdd(pernaIndex, "odd", e.target.value)}
            className="h-7 text-xs text-center px-1"
            onWheel={(e) => e.currentTarget.blur()}
            data-field-type="odd"
            onKeyDown={(e) => onFieldKeyDown(e, 'odd')}
          />
        )}
      </td>
      
      {/* Stake */}
      <td className="py-1 px-2">
        {isEditing ? (
          <div className="text-xs font-medium text-center">
            {formatCurrency(parseFloat(entry.stake) || 0, entry.moeda)}
          </div>
        ) : (
          <MoneyInput 
            value={entry.stake}
            onChange={(val) => onUpdateOdd(pernaIndex, "stake", val)}
            currency={entry.moeda}
            minDigits={5}
            className="h-7 text-xs text-center"
            data-field-type="stake"
            onKeyDown={(e) => onFieldKeyDown(e as any, 'stake')}
          />
        )}
      </td>
      
      {/* Linha */}
      <td className="py-1 px-2">
        {isEditing ? (
          <div className="text-[10px] text-muted-foreground text-center truncate">
            {entry.selecaoLivre || "—"}
          </div>
        ) : (
          <Input
            placeholder="Linha"
            value={entry.selecaoLivre}
            onChange={(e) => onUpdateOdd(pernaIndex, "selecaoLivre", e.target.value)}
            className="h-7 text-[10px] px-1 border-dashed w-16"
          />
        )}
      </td>
      
      {/* Referência (Target) */}
      <td className="py-1 px-2 text-center">
        {!isEditing && (
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
        )}
      </td>
      
      {/* Checkbox D — Distribuição de lucro */}
      {!isEditing && (
        <td className="py-1 px-2 text-center">
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
      
      {/* Lucro */}
      <td className="py-1 px-2 text-center">
        <span className={`text-xs font-medium ${
          lucro >= 0 ? "text-emerald-500" : "text-red-500"
        }`}>
          {lucro !== 0 ? (lucro > 0 ? "+" : "") + formatCurrency(lucro, moedaDominante) : "—"}
        </span>
      </td>
      
      {/* ROI */}
      <td className="py-1 px-2 text-center">
        <span className={`text-[10px] ${
          roi >= 0 ? "text-emerald-500" : "text-red-500"
        }`}>
          {roi !== 0 ? `${roi > 0 ? "+" : ""}${roi.toFixed(2)}%` : "—"}
        </span>
      </td>
      
      {/* Ações */}
      {!isEditing && (
        <td className="py-1 px-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onAddEntry(pernaIndex)}
            className="h-6 w-6 p-0"
            title="Adicionar casa"
          >
            <Plus className="h-3 w-3" />
          </Button>
        </td>
      )}
    </tr>
  );
}
