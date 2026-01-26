/**
 * SurebetTableFooter - Rodapé da tabela com totais e controles
 */

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency } from '@/components/bookmakers/BookmakerSelectOption';
import { type SurebetAnalysis } from '@/hooks/useSurebetCalculator';
import { type SupportedCurrency } from '@/hooks/useCurrencySnapshot';

interface SurebetTableFooterProps {
  analysis: SurebetAnalysis;
  isEditing: boolean;
  arredondarAtivado: boolean;
  setArredondarAtivado: (value: boolean) => void;
  arredondarValor: string;
  setArredondarValor: (value: string) => void;
  onImport: () => void;
}

export function SurebetTableFooter({
  analysis,
  isEditing,
  arredondarAtivado,
  setArredondarAtivado,
  arredondarValor,
  setArredondarValor,
  onImport
}: SurebetTableFooterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-border/50">
      {/* Totais */}
      <div className="flex items-center gap-6">
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground uppercase">Lucro Garantido</div>
          <div className={`text-lg font-bold ${analysis.minLucro >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {analysis.stakeTotal > 0 
              ? `${analysis.minLucro >= 0 ? "+" : ""}${formatCurrency(analysis.minLucro, analysis.moedaDominante)}`
              : "—"
            }
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground uppercase">Total Apostado</div>
          <div className="text-lg font-bold text-foreground">
            {analysis.stakeTotal > 0 
              ? formatCurrency(analysis.stakeTotal, analysis.moedaDominante)
              : "—"
            }
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground uppercase">ROI</div>
          <div className={`text-lg font-bold ${analysis.minRoi >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {analysis.stakeTotal > 0 
              ? `${analysis.minRoi >= 0 ? "+" : ""}${analysis.minRoi.toFixed(2)}%`
              : "—"
            }
          </div>
        </div>
      </div>

      {/* Controles */}
      <div className="flex items-center gap-4">
        {/* Arredondamento */}
        {!isEditing && (
          <div className="flex items-center gap-2">
            <Switch
              id="arredondar"
              checked={arredondarAtivado}
              onCheckedChange={setArredondarAtivado}
            />
            <Label htmlFor="arredondar" className="text-xs text-muted-foreground cursor-pointer">
              Arredondar
            </Label>
            {arredondarAtivado && (
              <Input
                type="number"
                min="1"
                step="1"
                value={arredondarValor}
                onChange={(e) => setArredondarValor(e.target.value)}
                className="h-7 w-14 text-center text-xs"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
