/**
 * SurebetAdditionalRow - Linha adicional de bookmaker dentro de uma perna
 * 
 * Permite adicionar múltiplas casas por perna
 */

import { KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/money-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Minus } from 'lucide-react';
import { BookmakerSelectOption, formatCurrency } from '@/components/bookmakers/BookmakerSelectOption';
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

export interface AdditionalEntry {
  id: string;
  bookmaker_id: string;
  odd: string;
  stake: string;
  selecaoLivre: string;
  moeda: string;
}

interface SurebetAdditionalRowProps {
  entry: AdditionalEntry;
  pernaIndex: number;
  additionalIndex: number;
  bookmakers: BookmakerOption[];
  moedaDominante: SupportedCurrency;
  onUpdate: (pernaIndex: number, additionalIndex: number, field: keyof AdditionalEntry, value: string) => void;
  onRemove: (pernaIndex: number, additionalIndex: number) => void;
  onFieldKeyDown: (e: KeyboardEvent<HTMLInputElement>, fieldType: 'odd' | 'stake') => void;
}

export function SurebetAdditionalRow({
  entry,
  pernaIndex,
  additionalIndex,
  bookmakers,
  moedaDominante,
  onUpdate,
  onRemove,
  onFieldKeyDown
}: SurebetAdditionalRowProps) {
  const selectedBookmaker = bookmakers.find(b => b.id === entry.bookmaker_id);

  return (
    <tr 
      className="border-b border-border/20 bg-muted/10"
      style={{ height: '44px' }}
    >
      {/* Casa */}
      <td className="px-2" style={{ height: '44px' }}>
        <div className="flex flex-col">
          <Select 
            value={entry.bookmaker_id}
            onValueChange={(v) => onUpdate(pernaIndex, additionalIndex, "bookmaker_id", v)}
          >
            <SelectTrigger className="h-7 text-[10px] w-full">
              {selectedBookmaker ? (
                <div className="flex items-center justify-center gap-1.5 w-full">
                  {selectedBookmaker.logo_url ? (
                    <img src={selectedBookmaker.logo_url} alt="" className="h-4 w-4 rounded object-contain flex-shrink-0" />
                  ) : (
                    <div className="h-4 w-4 flex-shrink-0" />
                  )}
                  <span className="truncate uppercase text-[10px] font-medium">{selectedBookmaker.nome}</span>
                </div>
              ) : (
                <span className="text-muted-foreground">+ Casa</span>
              )}
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
          {/* Meta row com altura fixa para estabilidade */}
          <div className="h-3 text-[9px] text-muted-foreground truncate pl-1 flex items-center">
            {selectedBookmaker?.parceiro_nome || <span className="opacity-0">—</span>}
          </div>
        </div>
      </td>
      
      {/* Odd */}
      <td className="px-2" style={{ height: '44px' }}>
        <Input 
          type="number"
          step="0.01"
          placeholder="0.00"
          value={entry.odd}
          onChange={(e) => onUpdate(pernaIndex, additionalIndex, "odd", e.target.value)}
          className="h-7 text-xs text-center px-1"
          onWheel={(e) => e.currentTarget.blur()}
          data-field-type="odd"
          onKeyDown={(e) => onFieldKeyDown(e, 'odd')}
        />
      </td>
      
      {/* Stake */}
      <td className="px-2" style={{ height: '44px' }}>
        <MoneyInput 
          value={entry.stake}
          onChange={(val) => onUpdate(pernaIndex, additionalIndex, "stake", val)}
          currency={entry.moeda}
          minDigits={5}
          className="h-7 text-xs text-center"
          data-field-type="stake"
          onKeyDown={(e) => onFieldKeyDown(e as any, 'stake')}
        />
      </td>
      
      {/* Linha */}
      <td className="px-2" style={{ height: '44px' }}>
        <Input
          placeholder="Linha"
          value={entry.selecaoLivre}
          onChange={(e) => onUpdate(pernaIndex, additionalIndex, "selecaoLivre", e.target.value)}
          className="h-7 text-xs px-1 border-dashed w-16"
        />
      </td>
      
      {/* Referência - vazio para linhas adicionais */}
      <td className="px-2 text-center" style={{ height: '44px' }} />
      
      {/* Distribuição - vazio para linhas adicionais */}
      <td className="px-2 text-center" style={{ height: '44px' }} />
      
      {/* Lucro - vazio para linhas adicionais */}
      <td className="px-2 text-center" style={{ height: '44px' }} />
      
      {/* ROI - vazio para linhas adicionais */}
      <td className="px-2 text-center" style={{ height: '44px' }} />
      
      {/* Ações - Remover */}
      <td className="px-1" style={{ height: '44px' }}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(pernaIndex, additionalIndex)}
          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
          title="Remover casa"
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
      </td>
    </tr>
  );
}
