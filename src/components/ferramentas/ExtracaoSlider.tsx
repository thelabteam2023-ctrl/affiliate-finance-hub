import React, { useMemo } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';
import { MoedaCalc } from '@/contexts/CalculadoraContext';
import { AlertTriangle, Target, TrendingUp, Wallet } from 'lucide-react';

interface ExtracaoSliderProps {
  passivoAtual: number;
  extracaoAtual: number;
  oddLay: number;
  comissao: number; // Em decimal, ex: 0.05 para 5%
  moeda: MoedaCalc;
  onExtracaoChange: (valor: number) => void;
}

export const ExtracaoSlider: React.FC<ExtracaoSliderProps> = ({
  passivoAtual,
  extracaoAtual,
  oddLay,
  comissao,
  moeda,
  onExtracaoChange,
}) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  // Limite máximo: 200% do passivo atual (mínimo de 10 para não ter slider vazio)
  const maxExtracao = Math.max(passivoAtual * 2, 10);
  
  // Calcular valores em tempo real
  const calculos = useMemo(() => {
    const targetMin = passivoAtual + extracaoAtual;
    const stakeLayMin = targetMin / (1 - comissao);
    const riscoMax = stakeLayMin * (oddLay - 1);
    
    // Razão risco/extração para determinar nível de risco
    const razaoRisco = extracaoAtual > 0 ? riscoMax / extracaoAtual : 0;
    
    return {
      targetMin,
      stakeLayMin,
      riscoMax,
      razaoRisco,
    };
  }, [passivoAtual, extracaoAtual, oddLay, comissao]);
  
  // Determinar cor baseado na razão risco/extração
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
  
  // Calcular porcentagem do passivo
  const percentualPassivo = passivoAtual > 0 
    ? ((extracaoAtual / passivoAtual) * 100).toFixed(0) 
    : '0';
  
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
        <span className="text-xs font-medium text-foreground flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-primary" />
          Extração desejada
        </span>
        <div className={cn(
          'px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1',
          riskLevel.bgColor,
          riskLevel.color
        )}>
          <AlertTriangle className="h-2.5 w-2.5" />
          Risco {riskLevel.label}
        </div>
      </div>
      
      {/* Slider com cores dinâmicas */}
      <div className="relative">
        <Slider
          value={[extracaoAtual]}
          min={0}
          max={maxExtracao}
          step={passivoAtual > 100 ? 10 : 1}
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
            width: `${(extracaoAtual / maxExtracao) * 100}%`,
            maxWidth: 'calc(100% - 10px)'
          }}
        />
      </div>
      
      {/* Valor atual */}
      <div className="flex justify-between items-center">
        <span className="text-lg font-bold text-primary">
          {formatValue(extracaoAtual)}
        </span>
        <span className="text-xs text-muted-foreground">
          {percentualPassivo}% do passivo
        </span>
      </div>
      
      {/* Indicadores calculados em tempo real */}
      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/30">
        <div className="text-center p-2 rounded bg-muted/30">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Target className="h-3 w-3 text-muted-foreground" />
          </div>
          <span className="text-[10px] text-muted-foreground block">Target</span>
          <span className="text-xs font-bold text-primary">
            {formatValue(calculos.targetMin)}
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
      
      {/* Texto auxiliar */}
      <p className="text-[10px] text-muted-foreground text-center italic">
        Quanto maior a extração desejada, maior o risco assumido.
      </p>
    </div>
  );
};
