/**
 * SimpleMultiEntryTable - Tabela multi-entrada para Aposta Simples
 * 
 * Permite adicionar múltiplas bookmakers na mesma seleção/direção.
 * Calcula odd média ponderada e stake total.
 * Limite: 5 entradas por aposta.
 */
import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectTrigger,
} from '@/components/ui/select';
import {
  BookmakerSelectTrigger,
  BookmakerMetaRow,
  formatCurrency as formatCurrencyCanonical,
  getCurrencySymbol,
} from '@/components/bookmakers/BookmakerSelectOption';
import { BookmakerSearchableSelectContent } from '@/components/bookmakers/BookmakerSearchableSelectContent';

export interface SimpleEntry {
  id: string;
  bookmaker_id: string;
  odd: string;
  stake: string;
  selecao_livre: string;
}

interface BookmakerInfo {
  id: string;
  nome: string;
  parceiro_id: string | null;
  parceiro_nome: string | null;
  saldo_atual: number;
  saldo_disponivel: number;
  saldo_freebet: number;
  saldo_bonus: number;
  saldo_operavel: number;
  moeda: string;
  logo_url: string | null;
}

interface SimpleMultiEntryTableProps {
  entries: SimpleEntry[];
  setEntries: React.Dispatch<React.SetStateAction<SimpleEntry[]>>;
  bookmakers: BookmakerInfo[];
  /** Saldo ajustado para edição (crédito virtual de stakes existentes) */
  getSaldoAjustado?: (bookmakerId: string) => number | null;
  /** Campos com review pendente do OCR */
  fieldsNeedingReview?: Record<string, boolean>;
  /** Formatação de moeda */
  formatCurrency?: (value: number, moeda?: string) => string;
  /** Converte valor de uma moeda para a moeda de consolidação do projeto (para ponderação multi-moeda) */
  convertToConsolidation?: (valor: number, moedaOrigem: string) => number;
}

const MAX_ENTRIES = 5;

const generateId = () => Math.random().toString(36).substring(2, 9);

export function createEmptyEntry(): SimpleEntry {
  return {
    id: generateId(),
    bookmaker_id: '',
    odd: '',
    stake: '',
    selecao_livre: '',
  };
}

export function SimpleMultiEntryTable({
  entries,
  setEntries,
  bookmakers,
  getSaldoAjustado,
  fieldsNeedingReview,
  formatCurrency: formatCurrencyProp,
  convertToConsolidation,
}: SimpleMultiEntryTableProps) {
  const isMulti = entries.length > 1;

  // Odd média ponderada (multi-moeda) e stake total nominal
  const { oddMedia, stakeTotal, stakeTotalLabel } = useMemo(() => {
    let totalStakeConsolidado = 0;
    let weightedOddSum = 0;
    let totalStakeNominal = 0;
    const stakesByMoeda: Record<string, number> = {};

    for (const e of entries) {
      const s = parseFloat(e.stake) || 0;
      const o = parseFloat(e.odd) || 0;
      if (s <= 0 || o <= 0) continue;

      const bk = bookmakers.find(b => b.id === e.bookmaker_id);
      const moeda = bk?.moeda || 'BRL';
      
      // Converter stake para moeda de consolidação para ponderação correta
      const stakeConsolidado = convertToConsolidation ? convertToConsolidation(s, moeda) : s;
      
      totalStakeConsolidado += stakeConsolidado;
      weightedOddSum += o * stakeConsolidado;
      totalStakeNominal += s;
      stakesByMoeda[moeda] = (stakesByMoeda[moeda] || 0) + s;
    }

    // Gerar label de stake total (ex: "$200 + R$100" quando multi-moeda)
    const moedas = Object.keys(stakesByMoeda);
    let label: string;
    if (moedas.length <= 1) {
      label = totalStakeNominal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    } else {
      label = moedas.map(m => {
        const sym = getCurrencySymbol(m);
        return `${sym}${stakesByMoeda[m].toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }).join(' + ');
    }

    return {
      oddMedia: totalStakeConsolidado > 0 ? weightedOddSum / totalStakeConsolidado : 0,
      stakeTotal: totalStakeNominal,
      stakeTotalLabel: label,
    };
  }, [entries, bookmakers, convertToConsolidation]);

  const updateEntry = (id: string, field: keyof SimpleEntry, value: string) => {
    setEntries(prev =>
      prev.map(e => (e.id === id ? { ...e, [field]: value } : e))
    );
  };

  const addEntry = () => {
    if (entries.length >= MAX_ENTRIES) return;
    setEntries(prev => [...prev, createEmptyEntry()]);
  };

  const removeEntry = (id: string) => {
    if (entries.length <= 1) return;
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const getBookmaker = (id: string) => bookmakers.find(b => b.id === id) || null;

  const getRetorno = (e: SimpleEntry) => {
    const o = parseFloat(e.odd);
    const s = parseFloat(e.stake);
    if (!isNaN(o) && !isNaN(s) && o > 0 && s > 0) return o * s;
    return null;
  };

  const fmtCurrency = (value: number, moeda?: string) => {
    if (formatCurrencyProp) return formatCurrencyProp(value, moeda);
    const sym = getCurrencySymbol(moeda || 'BRL');
    return `${sym}${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <table className="w-full">
        <thead>
          <tr className="border-b border-border/30 bg-muted/30">
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center w-[240px]">Bookmaker</th>
            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[70px]">Odd</th>
            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[100px]">Stake</th>
            <th className="px-3 py-2 text-xs font-medium text-muted-foreground text-center w-[120px]">Linha</th>
            <th className="px-2 py-2 text-xs font-medium text-muted-foreground text-center w-[90px]">Retorno</th>
            {isMulti && (
              <th className="px-1 py-2 text-xs font-medium text-muted-foreground text-center w-[36px]" />
            )}
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, idx) => {
            const bk = getBookmaker(entry.bookmaker_id);
            const retorno = getRetorno(entry);
            const saldoDisp = getSaldoAjustado?.(entry.bookmaker_id) ?? bk?.saldo_operavel ?? 0;
            const stakeNum = parseFloat(entry.stake);
            const stakeExceeds = !isNaN(stakeNum) && stakeNum > saldoDisp && !!entry.bookmaker_id;

            return (
              <tr key={entry.id} className={cn(
                "border-b border-border/30",
                idx > 0 && "border-t border-primary/15"
              )}>
                {/* Bookmaker */}
                <td className="px-3 py-3 text-center">
                  <div className="flex flex-col gap-1 items-center">
                    <Select
                      value={entry.bookmaker_id}
                      onValueChange={(val) => updateEntry(entry.id, 'bookmaker_id', val)}
                    >
                      <SelectTrigger className="h-9 text-xs w-full border-dashed">
                        <BookmakerSelectTrigger
                          bookmaker={bk ? {
                            nome: bk.nome,
                            parceiro_nome: bk.parceiro_nome,
                            moeda: bk.moeda,
                            saldo_operavel: bk.saldo_operavel,
                            logo_url: bk.logo_url,
                          } : null}
                          placeholder="Selecione"
                        />
                      </SelectTrigger>
                      <BookmakerSearchableSelectContent
                        bookmakers={bookmakers}
                        itemClassName="max-w-full"
                      />
                    </Select>
                    <BookmakerMetaRow
                      bookmaker={bk ? {
                        parceiro_nome: bk.parceiro_nome,
                        moeda: bk.moeda,
                        saldo_operavel: saldoDisp,
                        saldo_freebet: bk.saldo_freebet,
                        saldo_disponivel: bk.saldo_disponivel,
                      } : null}
                    />
                  </div>
                </td>
                {/* Odd */}
                <td className="px-1 py-3">
                  <Input
                    type="number"
                    step="0.001"
                    min="1.01"
                    value={entry.odd}
                    onChange={(e) => updateEntry(entry.id, 'odd', e.target.value)}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val < 1.01) updateEntry(entry.id, 'odd', '1.01');
                    }}
                    placeholder="0.00"
                    className="h-8 text-xs text-center px-1 w-[72px] tabular-nums"
                  />
                </td>
                {/* Stake */}
                <td className="px-1 py-3">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={entry.stake}
                    onChange={(e) => {
                      if (parseFloat(e.target.value) < 0) return;
                      updateEntry(entry.id, 'stake', e.target.value);
                    }}
                    placeholder="0.00"
                    className={cn(
                      "h-8 text-xs text-center px-1 w-[90px] tabular-nums",
                      stakeExceeds && "border-destructive"
                    )}
                  />
                </td>
                {/* Linha */}
                <td className="px-2 py-3">
                  <Input
                    value={entry.selecao_livre}
                    onChange={(e) => updateEntry(entry.id, 'selecao_livre', e.target.value)}
                    placeholder="Ex: Over 2.5, Casa"
                    className={cn(
                      "h-8 text-xs text-center px-2 border-dashed",
                      idx === 0 && fieldsNeedingReview?.selecao && 'border-amber-500/50'
                    )}
                  />
                </td>
                {/* Retorno */}
                <td className="px-2 py-3 text-center">
                  <div className="h-8 flex items-center justify-center rounded-md bg-muted/30 px-2 text-sm font-medium text-emerald-500 tabular-nums">
                    {retorno !== null ? fmtCurrency(retorno, bk?.moeda) : '—'}
                  </div>
                </td>
                {/* Remove */}
                {isMulti && (
                  <td className="px-1 py-3 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => removeEntry(entry.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Footer: Add button + Summary */}
      <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-t border-border/30">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-muted-foreground hover:text-primary gap-1"
          onClick={addEntry}
          disabled={entries.length >= MAX_ENTRIES}
        >
          <Plus className="h-3.5 w-3.5" />
          Entrada
        </Button>

        {isMulti && (
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Odd ø</span>
              <span className="font-bold tabular-nums">{oddMedia.toFixed(3)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Stake Total</span>
              <span className="font-bold tabular-nums">
                {stakeTotalLabel}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
