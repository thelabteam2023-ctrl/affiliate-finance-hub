import React, { useMemo } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { MoedaCalc } from '@/contexts/CalculadoraContext';
import { AlertTriangle, Target, TrendingUp, Wallet, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface ExtracaoSliderProps {
  passivoAtual: number;
  percentualExtracao: number; // 0-100
  oddLay: number;
  comissao: number; // Em decimal, ex: 0.05 para 5%
  moeda: MoedaCalc;
  onExtracaoChange: (percentual: number) => void;
}

export const ExtracaoSlider: React.FC<ExtracaoSliderProps> = ({
  passivoAtual,
  percentualExtracao,
  oddLay,
  comissao,
  moeda,
  onExtracaoChange,
}) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  // Calcular valores em tempo real baseado no percentual
  const calculos = useMemo(() => {
    // Target = Passivo × (% / 100) → NUNCA maior que o passivo!
    const target = passivoAtual * (percentualExtracao / 100);
    const stakeLayMin = target / (1 - comissao);
    const riscoMax = stakeLayMin * (oddLay - 1);
    
    // Passivo restante se RED (o que sobra após extração)
    const passivoRestante = passivoAtual - target;
    
    // Razão risco/target para determinar nível de risco
    const razaoRisco = target > 0 ? riscoMax / target : 0;
    
    return {
      target,
      stakeLayMin,
      riscoMax,
      razaoRisco,
      passivoRestante,
    };
  }, [passivoAtual, percentualExtracao, oddLay, comissao]);
  
  // Determinar cor baseado na razão risco/target
  const getRiskLevel = (razao: number): { color: string; bgColor: string; borderColor: string; label: string } => {
    if (razao < 1.5) {
      return {
        color: 'text-success',
        bgColor: 'bg-success/20',
        borderColor: 'border-success/30',
        label: 'Baixo',
      };
    } else if (razao < 2.5) {
      return {
        color: 'text-yellow-500',
        bgColor: 'bg-yellow-500/20',
        borderColor: 'border-yellow-500/30',
        label: 'Médio',
      };
    } else {
      return {
        color: 'text-warning',
        bgColor: 'bg-warning/20',
        borderColor: 'border-warning/30',
        label: 'Alto',
      };
    }
  };
  
  const riskLevel = getRiskLevel(calculos.razaoRisco);
  
  const formatValue = (value: number) => {
    return `${currencySymbol} ${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  
  // Cor do slider track baseado no risco
  const getSliderTrackColor = () => {
    if (calculos.razaoRisco < 1.5) return 'bg-success';
    if (calculos.razaoRisco < 2.5) return 'bg-yellow-500';
    return 'bg-warning';
  };

  return (
    <div className="space-y-3 p-3 rounded-lg border border-border/50 bg-background/50">
      {/* Header do slider */}
      <div className="flex items-center justify-between">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-xs font-medium text-foreground flex items-center gap-1 cursor-help">
                <TrendingUp className="h-3 w-3 text-primary" />
                % do Passivo a Extrair
                <HelpCircle className="h-3 w-3 text-muted-foreground" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[280px] text-xs">
              <p>Este valor representa quanto do capital atualmente preso na Bookmaker você deseja retirar via Exchange.</p>
              <p className="mt-1 text-muted-foreground">100% = extrair todo o passivo (recuperação total)</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <div className={cn(
          'px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1',
          riskLevel.bgColor,
          riskLevel.color
        )}>
          <AlertTriangle className="h-2.5 w-2.5" />
          Risco {riskLevel.label}
        </div>
      </div>
      
      {/* Slider com cores dinâmicas - agora de 0 a 100% */}
      <div className="relative">
        <Slider
          value={[percentualExtracao]}
          min={10}
          max={100}
          step={5}
          onValueChange={(value) => onExtracaoChange(value[0])}
          className="w-full"
        />
        {/* Overlay para cor dinâmica do range */}
        <div 
          className={cn(
            'absolute left-0 top-1/2 -translate-y-1/2 h-2 rounded-l-full pointer-events-none transition-all',
            getSliderTrackColor()
          )}
          style={{ 
            width: `${percentualExtracao}%`,
            maxWidth: 'calc(100% - 10px)'
          }}
        />
      </div>
      
      {/* Valor atual - agora mostra o percentual com destaque */}
      <div className="flex justify-between items-center">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary">
            {percentualExtracao}%
          </span>
          <span className="text-sm text-muted-foreground">
            = {formatValue(calculos.target)}
          </span>
        </div>
        {percentualExtracao < 100 && (
          <span className="text-xs text-muted-foreground">
            Restará: {formatValue(calculos.passivoRestante)}
          </span>
        )}
      </div>
      
      {/* Indicadores calculados em tempo real */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/30">
        <div className="text-center p-2 rounded bg-muted/30">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Target className="h-3 w-3 text-muted-foreground" />
          </div>
          <span className="text-[10px] text-muted-foreground block">Target</span>
          <span className="text-xs font-bold text-primary">
            {formatValue(calculos.target)}
          </span>
        </div>
        
        <div className="text-center p-2 rounded bg-muted/30">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Wallet className="h-3 w-3 text-muted-foreground" />
          </div>
          <span className="text-[10px] text-muted-foreground block">Stake LAY</span>
          <span className="text-xs font-bold text-foreground">
            {formatValue(calculos.stakeLayMin)}
          </span>
        </div>
        
        <div className={cn(
          'text-center p-2 rounded',
          riskLevel.bgColor,
          riskLevel.borderColor,
          'border'
        )}>
          <div className="flex items-center justify-center gap-1 mb-1">
            <AlertTriangle className={cn('h-3 w-3', riskLevel.color)} />
          </div>
          <span className="text-[10px] text-muted-foreground block">Risco Máx.</span>
          <span className={cn('text-xs font-bold', riskLevel.color)}>
            {formatValue(calculos.riscoMax)}
          </span>
        </div>
      </div>
      
      {/* Texto auxiliar atualizado */}
      <p className="text-[10px] text-muted-foreground text-center italic">
        {percentualExtracao === 100 
          ? 'Extração total: recupera todo o passivo se RED.' 
          : `Extração parcial: restará ${formatValue(calculos.passivoRestante)} na Bookmaker.`
        }
      </p>
    </div>
  );
};