/**
 * SurebetTableFooter - Rodapé da tabela com totais e controles
 */

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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
  
}

export function SurebetTableFooter({
  analysis,
  isEditing,
  arredondarAtivado,
  setArredondarAtivado,
  arredondarValor,
  setArredondarValor,
  
}: SurebetTableFooterProps) {
  const hasRange = analysis.stakeTotal > 0 && Math.abs(analysis.maxLucro - analysis.minLucro) > 0.005;
  const lucroSign = (v: number) => (v >= 0 ? "+" : "");
  const lucroColor = analysis.minLucro >= 0 ? "text-emerald-500" : "text-red-500";
  const roiColor = analysis.minRoi >= 0 ? "text-emerald-500" : "text-red-500";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50">
      {/* Totais */}
      <div className="flex items-center gap-3 md:gap-6">
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground uppercase">Lucro Garantido</div>
          <div className={`font-bold leading-tight whitespace-nowrap ${lucroColor} ${hasRange ? "text-xs md:text-sm" : "text-base md:text-lg"}`}>
            {analysis.stakeTotal > 0 ? (
              hasRange ? (
                <>
                  {lucroSign(analysis.minLucro)}{formatCurrency(analysis.minLucro, analysis.moedaDominante)}
                  <span className="text-muted-foreground mx-1">→</span>
                  {lucroSign(analysis.maxLucro)}{formatCurrency(analysis.maxLucro, analysis.moedaDominante)}
                </>
              ) : (
                `${lucroSign(analysis.minLucro)}${formatCurrency(analysis.minLucro, analysis.moedaDominante)}`
              )
            ) : "—"}
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground uppercase">Total Apostado</div>
          <div className="text-base md:text-lg font-bold text-foreground">
            {analysis.stakeTotal > 0 
              ? formatCurrency(analysis.stakeTotal, analysis.moedaDominante)
              : "—"
            }
          </div>
        </div>
        <div className="text-center">
          <div className="text-[10px] text-muted-foreground uppercase">ROI</div>
          <div className={`font-bold leading-tight whitespace-nowrap ${roiColor} ${hasRange ? "text-xs md:text-sm" : "text-base md:text-lg"}`}>
            {analysis.stakeTotal > 0 ? (
              hasRange ? (
                <>
                  {lucroSign(analysis.minRoi)}{analysis.minRoi.toFixed(2)}%
                  <span className="text-muted-foreground mx-1">→</span>
                  {lucroSign(analysis.maxRoi)}{analysis.maxRoi.toFixed(2)}%
                </>
              ) : (
                `${lucroSign(analysis.minRoi)}${analysis.minRoi.toFixed(2)}%`
              )
            ) : "—"}
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
