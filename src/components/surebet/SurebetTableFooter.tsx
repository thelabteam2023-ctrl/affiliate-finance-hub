/**
 * SurebetTableFooter - Rodapé da tabela com totais e controles
 */

import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Settings2 } from 'lucide-react';
import { formatCurrency } from '@/components/bookmakers/BookmakerSelectOption';
import { type SurebetAnalysis as SurebetAnalysisBase } from '@/hooks/useSurebetCalculator';

interface SurebetAnalysis extends SurebetAnalysisBase {
  traceId?: string;
}
import { type SupportedCurrency } from '@/hooks/useCurrencySnapshot';

interface SurebetTableFooterProps {
  analysis: SurebetAnalysis;
  isEditing: boolean;
  arredondarAtivado: boolean;
  setArredondarAtivado: (value: boolean) => void;
  arredondarValor: string;
  setArredondarValor: (value: string) => void;
  showComissao?: boolean;
  setShowComissao?: (value: boolean) => void;
  hasLayLeg?: boolean;
}

export function SurebetTableFooter({
  analysis,
  isEditing,
  arredondarAtivado,
  setArredondarAtivado,
  arredondarValor,
  setArredondarValor,
  showComissao = false,
  setShowComissao,
  hasLayLeg = false,
}: SurebetTableFooterProps) {
  const hasRange = analysis.stakeTotal > 0 && Math.abs(analysis.maxLucro - analysis.minLucro) > 0.005;
  const lucroSign = (v: number) => (v >= 0 ? "+" : "");
  const lucroColor = analysis.minLucro >= 0 ? "text-emerald-500" : "text-red-500";
  const roiColor = analysis.minRoi >= 0 ? "text-emerald-500" : "text-red-500";
  const exposicao = analysis.exposicaoTotal ?? analysis.stakeTotal;

  return (
    <div 
      className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50"
      data-testid="surebet-footer"
      data-trace-id={analysis.traceId}
      data-calc-state={analysis.stakeTotal > 0 ? "valid" : "invalid"}
      data-hydration-state={isEditing ? "user" : "db"}
      data-edit-state={isEditing ? "dirty" : "pristine"}
      data-currency={analysis.moedaDominante}
      data-normalized-value={analysis.stakeTotal}
    >
      {/* Totais */}
      <div className="flex items-center gap-3 md:gap-6" data-testid="surebet-totals">
        <div className="text-center" data-testid="surebet-footer-profit">
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
        {hasLayLeg && exposicao > 0 && (
          <div className="text-center" title="Stake (back) + Responsabilidade (lay)">
            <div className="text-[10px] text-muted-foreground uppercase">Exposição</div>
            <div className="text-base md:text-lg font-bold text-foreground">
              {formatCurrency(exposicao, analysis.moedaDominante)}
            </div>
          </div>
        )}
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
      {!isEditing && (
        <Popover>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Opções da tabela"
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-3 space-y-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
              Opções da tabela
            </div>

            {setShowComissao && (
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="opt-show-comissao" className="text-xs cursor-pointer">
                  Mostrar comissões
                </Label>
                <Switch
                  id="opt-show-comissao"
                  checked={showComissao}
                  onCheckedChange={setShowComissao}
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="opt-arredondar" className="text-xs cursor-pointer">
                Arredondar
              </Label>
              <div className="flex items-center gap-2">
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
                <Switch
                  id="opt-arredondar"
                  checked={arredondarAtivado}
                  onCheckedChange={setArredondarAtivado}
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
