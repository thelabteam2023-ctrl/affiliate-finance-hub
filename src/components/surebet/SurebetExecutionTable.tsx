/**
 * SurebetExecutionTable - Tabela de execução compacta e otimizada para velocidade operacional
 * 
 * Design: Layout horizontal em formato de tabela, ideal para apostas ao vivo
 * - Colunas: Direção | Casa | Odd | Stake | Lucro | ROI
 * - Valores positivos em verde, negativos em vermelho
 * - ROI por perna, não apenas global
 */
import React, { useMemo, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronUp, RotateCcw, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { SupportedCurrency } from '@/hooks/useCurrencySnapshot';
import { cn } from '@/lib/utils';

interface BookmakerOption {
  id: string;
  nome: string;
  moeda: SupportedCurrency;
  saldo_operavel: number;
}

interface OddEntry {
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  selecao: string;
  selecaoLivre: string;
  isReference: boolean;
  isManuallyEdited: boolean;
  stakeOrigem?: "print" | "referencia" | "manual";
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  gerouFreebet?: boolean;
  valorFreebetGerada?: string;
  freebetStatus?: "PENDENTE" | "LIBERADA" | "NAO_LIBERADA" | null;
  index?: number;
  additionalEntries?: any[];
}

interface SurebetExecutionTableProps {
  odds: OddEntry[];
  setOdds: React.Dispatch<React.SetStateAction<OddEntry[]>>;
  modelo: "1-X-2" | "1-2";
  mercado: string;
  bookmakers: BookmakerOption[];
  isEditing: boolean;
  arredondarAtivado: boolean;
  setArredondarAtivado: (value: boolean) => void;
  arredondarValor: string;
  setArredondarValor: (value: string) => void;
  onLiquidarPerna?: (index: number, resultado: "GREEN" | "RED" | "VOID" | null) => void;
  formatCurrency: (valor: number, moeda?: string) => string;
  getBookmakerMoeda: (id: string) => SupportedCurrency;
  setReferenceIndex: (index: number) => void;
}

// Formata valor para exibição
function formatValue(value: number, showSign: boolean = false): string {
  const formatted = value.toLocaleString('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
  if (showSign && value > 0) return `+${formatted}`;
  return formatted;
}

// Calcula lucro para uma perna
function calcularLucroPerna(
  stake: number, 
  odd: number, 
  stakeTotal: number
): number {
  if (stake <= 0 || odd <= 1 || stakeTotal <= 0) return 0;
  return (stake * odd) - stakeTotal;
}

// Calcula ROI para uma perna
function calcularRoiPerna(lucro: number, stakeTotal: number): number {
  if (stakeTotal <= 0) return 0;
  return (lucro / stakeTotal) * 100;
}

export function SurebetExecutionTable({
  odds,
  setOdds,
  modelo,
  mercado,
  bookmakers,
  isEditing,
  arredondarAtivado,
  setArredondarAtivado,
  arredondarValor,
  setArredondarValor,
  onLiquidarPerna,
  formatCurrency,
  getBookmakerMoeda,
  setReferenceIndex,
}: SurebetExecutionTableProps) {
  
  // Calcular stake total
  const stakeTotal = useMemo(() => {
    return odds.reduce((acc, entry) => {
      const stake = parseFloat(entry.stake) || 0;
      return acc + stake;
    }, 0);
  }, [odds]);

  // Calcular lucro e ROI por perna
  const pernasAnalysis = useMemo(() => {
    return odds.map((entry, index) => {
      const stake = parseFloat(entry.stake) || 0;
      const odd = parseFloat(entry.odd) || 0;
      const lucro = calcularLucroPerna(stake, odd, stakeTotal);
      const roi = calcularRoiPerna(lucro, stakeTotal);
      return { stake, odd, lucro, roi };
    });
  }, [odds, stakeTotal]);

  // Lucro total (mínimo dos cenários)
  const lucroTotal = useMemo(() => {
    if (pernasAnalysis.length === 0) return 0;
    return Math.min(...pernasAnalysis.map(p => p.lucro));
  }, [pernasAnalysis]);

  // Handler para atualizar odd
  const handleOddChange = useCallback((index: number, value: string) => {
    setOdds(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], odd: value };
      return updated;
    });
  }, [setOdds]);

  // Handler para atualizar stake
  const handleStakeChange = useCallback((index: number, value: string) => {
    setOdds(prev => {
      const updated = [...prev];
      updated[index] = { 
        ...updated[index], 
        stake: value,
        isManuallyEdited: true,
        stakeOrigem: 'manual'
      };
      return updated;
    });
  }, [setOdds]);

  // Handler para atualizar bookmaker
  const handleBookmakerChange = useCallback((index: number, bookmarkerId: string) => {
    const bk = bookmakers.find(b => b.id === bookmarkerId);
    setOdds(prev => {
      const updated = [...prev];
      updated[index] = { 
        ...updated[index], 
        bookmaker_id: bookmarkerId,
        moeda: bk?.moeda || 'BRL'
      };
      return updated;
    });
  }, [bookmakers, setOdds]);

  // Direção label
  const getDirecaoLabel = useCallback((index: number) => {
    if (modelo === "1-X-2") {
      return index === 0 ? "1" : index === 1 ? "X" : "2";
    }
    return index === 0 ? "1" : "2";
  }, [modelo]);

  return (
    <div className="w-full space-y-3">
      {/* Tabela de Execução */}
      <div className="w-full overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-border/50">
              <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground w-10">Dir.</th>
              <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground min-w-[140px]">Casa</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground w-20">Odd</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground w-24">Stake</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground w-24">Lucro</th>
              <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground w-20">ROI</th>
              {isEditing && (
                <th className="text-center py-2 px-2 text-xs font-medium text-muted-foreground w-24">Resultado</th>
              )}
            </tr>
          </thead>
          <tbody>
            {odds.map((entry, index) => {
              const analysis = pernasAnalysis[index];
              const isPositive = analysis.lucro >= 0;
              const hasResult = entry.resultado && entry.resultado !== 'PENDENTE';
              
              return (
                <tr 
                  key={index} 
                  className={cn(
                    "border-b border-border/30 hover:bg-muted/30 transition-colors",
                    entry.isReference && "bg-primary/5"
                  )}
                >
                  {/* Direção */}
                  <td className="py-2 px-2">
                    <button
                      type="button"
                      onClick={() => setReferenceIndex(index)}
                      className={cn(
                        "w-8 h-8 rounded-md font-bold text-sm transition-all flex items-center justify-center",
                        entry.isReference 
                          ? "bg-primary text-primary-foreground" 
                          : "bg-muted/50 text-muted-foreground hover:bg-muted"
                      )}
                      title={entry.isReference ? "Perna de referência" : "Definir como referência"}
                    >
                      {getDirecaoLabel(index)}
                    </button>
                  </td>
                  
                  {/* Casa (Bookmaker) */}
                  <td className="py-2 px-2">
                    <Select
                      value={entry.bookmaker_id}
                      onValueChange={(val) => handleBookmakerChange(index, val)}
                      disabled={isEditing && hasResult}
                    >
                      <SelectTrigger className="h-8 text-xs border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1">
                        <SelectValue placeholder="Selecionar..." />
                      </SelectTrigger>
                      <SelectContent>
                        {bookmakers.map(bk => (
                          <SelectItem key={bk.id} value={bk.id} className="text-xs">
                            <div className="flex items-center justify-between gap-2 w-full">
                              <span className="truncate">{bk.nome}</span>
                              <span className="text-muted-foreground text-[10px] tabular-nums">
                                {bk.moeda} {formatValue(bk.saldo_operavel)}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  
                  {/* Odd */}
                  <td className="py-2 px-2">
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={entry.odd}
                      onChange={(e) => handleOddChange(index, e.target.value)}
                      placeholder="0.00"
                      disabled={isEditing && hasResult}
                      className="h-8 text-right text-xs font-mono border-0 bg-muted/30 hover:bg-muted/50 focus:ring-1 tabular-nums"
                    />
                  </td>
                  
                  {/* Stake */}
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">{entry.moeda}</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={entry.stake}
                        onChange={(e) => handleStakeChange(index, e.target.value)}
                        placeholder="0.00"
                        disabled={isEditing && hasResult}
                        className={cn(
                          "h-8 text-right text-xs font-mono border-0 hover:bg-muted/50 focus:ring-1 tabular-nums flex-1",
                          entry.isReference ? "bg-primary/10" : "bg-muted/30"
                        )}
                      />
                    </div>
                  </td>
                  
                  {/* Lucro */}
                  <td className="py-2 px-2 text-right">
                    <span className={cn(
                      "text-xs font-medium tabular-nums",
                      isPositive ? "text-emerald-500" : "text-red-500"
                    )}>
                      {stakeTotal > 0 && analysis.odd > 1 
                        ? formatValue(analysis.lucro, true)
                        : "—"
                      }
                    </span>
                  </td>
                  
                  {/* ROI */}
                  <td className="py-2 px-2 text-right">
                    <span className={cn(
                      "text-xs font-medium tabular-nums",
                      isPositive ? "text-emerald-400" : "text-red-400"
                    )}>
                      {stakeTotal > 0 && analysis.odd > 1 
                        ? `${formatValue(analysis.roi, true)}%`
                        : "—"
                      }
                    </span>
                  </td>
                  
                  {/* Resultado (apenas em edição) */}
                  {isEditing && (
                    <td className="py-2 px-2">
                      {hasResult ? (
                        <div className="flex items-center justify-center gap-1">
                          <span className={cn(
                            "text-xs font-medium px-2 py-0.5 rounded",
                            entry.resultado === "GREEN" && "bg-emerald-500/20 text-emerald-400",
                            entry.resultado === "RED" && "bg-red-500/20 text-red-400",
                            entry.resultado === "VOID" && "bg-muted text-muted-foreground"
                          )}>
                            {entry.resultado}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0"
                            onClick={() => onLiquidarPerna?.(index, null)}
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-emerald-500 hover:bg-emerald-500/20"
                            onClick={() => onLiquidarPerna?.(index, "GREEN")}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-500 hover:bg-red-500/20"
                            onClick={() => onLiquidarPerna?.(index, "RED")}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:bg-muted"
                            onClick={() => onLiquidarPerna?.(index, "VOID")}
                          >
                            <span className="text-[10px] font-bold">V</span>
                          </Button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Rodapé: Totais */}
      <div className="flex items-end justify-end gap-6 pt-2 border-t border-border/30">
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-0.5">LUCRO TOTAL</p>
          <p className={cn(
            "text-lg font-bold tabular-nums",
            lucroTotal >= 0 ? "text-emerald-500" : "text-red-500"
          )}>
            {stakeTotal > 0 ? formatValue(lucroTotal, true) : "—"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground mb-0.5">TOTAL APOSTADO</p>
          <p className="text-lg font-semibold text-foreground tabular-nums">
            {stakeTotal > 0 ? `${formatValue(stakeTotal)} ${odds[0]?.moeda || 'BRL'}` : "—"}
          </p>
        </div>
      </div>

      {/* Controles Auxiliares */}
      {!isEditing && (
        <div className="flex items-center gap-4 pt-3 border-t border-border/30">
          <div className="flex items-center gap-2">
            <Switch
              id="arredondar-table"
              checked={arredondarAtivado}
              onCheckedChange={setArredondarAtivado}
              className="scale-90"
            />
            <Label htmlFor="arredondar-table" className="text-xs text-muted-foreground cursor-pointer">
              Arredondar apostas
            </Label>
          </div>
          
          {arredondarAtivado && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Casas decimais:</span>
              <Input
                type="number"
                min="0"
                max="2"
                value={arredondarValor}
                onChange={(e) => setArredondarValor(e.target.value)}
                className="h-6 w-12 text-center text-xs border-muted bg-muted/30"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
