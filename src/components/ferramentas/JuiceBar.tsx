import React from 'react';
import { cn } from '@/lib/utils';
import { JuiceData, MoedaCalc } from '@/contexts/CalculadoraContext';

interface JuiceBarProps {
  data: JuiceData;
  moeda: MoedaCalc;
}

export const JuiceBar: React.FC<JuiceBarProps> = ({ data, moeda }) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number, showSign = true) => {
    const prefix = showSign ? (value >= 0 ? '+' : '') : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
  };

  // Calcular proporções para a barra
  const total = Math.max(data.exposicaoTotal, data.protecaoTotal, Math.abs(data.lucroVirtual)) || 100;
  const exposicaoWidth = (data.exposicaoTotal / total) * 100;
  const lucroWidth = (Math.abs(data.lucroVirtual) / total) * 100;
  const protecaoWidth = (data.protecaoTotal / total) * 100;

  return (
    <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Visão Geral do Fluxo</span>
      </div>

      {/* Barra visual */}
      <div className="relative h-8 rounded-md overflow-hidden bg-muted/50 flex">
        <div 
          className="h-full bg-primary/70 flex items-center justify-center text-[10px] font-medium text-primary-foreground transition-all"
          style={{ width: `${Math.min(exposicaoWidth, 40)}%` }}
        >
          {exposicaoWidth > 15 && 'Exposição'}
        </div>
        <div 
          className={cn(
            'h-full flex items-center justify-center text-[10px] font-medium transition-all',
            data.lucroVirtual >= 0 ? 'bg-success/70 text-success-foreground' : 'bg-destructive/70 text-destructive-foreground'
          )}
          style={{ width: `${Math.min(lucroWidth, 30)}%` }}
        >
          {lucroWidth > 15 && 'Lucro'}
        </div>
        <div 
          className="h-full bg-destructive/50 flex items-center justify-center text-[10px] font-medium text-destructive-foreground transition-all"
          style={{ width: `${Math.min(protecaoWidth, 30)}%` }}
        >
          {protecaoWidth > 15 && 'Proteção'}
        </div>
      </div>

      {/* Legenda com valores */}
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex flex-col items-center p-2 rounded bg-primary/10">
          <div className="w-3 h-3 rounded-full bg-primary/70 mb-1" />
          <span className="text-muted-foreground">Exposição</span>
          <span className="font-semibold text-primary">{formatValue(data.exposicaoTotal, false)}</span>
        </div>
        <div className={cn(
          'flex flex-col items-center p-2 rounded',
          data.lucroVirtual >= 0 ? 'bg-success/10' : 'bg-destructive/10'
        )}>
          <div className={cn('w-3 h-3 rounded-full mb-1', data.lucroVirtual >= 0 ? 'bg-success/70' : 'bg-destructive/70')} />
          <span className="text-muted-foreground">Lucro Virtual</span>
          <span className={cn('font-semibold', data.lucroVirtual >= 0 ? 'text-success' : 'text-destructive')}>
            {formatValue(data.lucroVirtual)}
          </span>
        </div>
        <div className="flex flex-col items-center p-2 rounded bg-destructive/10">
          <div className="w-3 h-3 rounded-full bg-destructive/50 mb-1" />
          <span className="text-muted-foreground">Proteção Total</span>
          <span className="font-semibold text-destructive">{formatValue(data.protecaoTotal, false)}</span>
        </div>
      </div>

      {/* Juices médios */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className={cn(
          'flex flex-col items-center p-2 rounded border',
          data.juiceMedioGreen >= 0 ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'
        )}>
          <span className="text-muted-foreground">Juice se GREEN</span>
          <span className={cn('font-bold text-sm', data.juiceMedioGreen >= 0 ? 'text-success' : 'text-destructive')}>
            {formatPercent(data.juiceMedioGreen)}
          </span>
        </div>
        <div className={cn(
          'flex flex-col items-center p-2 rounded border',
          data.juiceMedioRed >= 0 ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'
        )}>
          <span className="text-muted-foreground">Juice se RED</span>
          <span className={cn('font-bold text-sm', data.juiceMedioRed >= 0 ? 'text-success' : 'text-destructive')}>
            {formatPercent(data.juiceMedioRed)}
          </span>
        </div>
      </div>

      {/* Resultado esperado destacado */}
      <div className={cn(
        'flex items-center justify-between p-3 rounded-lg border-2',
        data.resultadoEsperado >= 0 
          ? 'bg-success/10 border-success/30' 
          : 'bg-destructive/10 border-destructive/30'
      )}>
        <span className="text-sm font-medium text-foreground">Resultado Esperado:</span>
        <span className={cn(
          'text-lg font-bold',
          data.resultadoEsperado >= 0 ? 'text-success' : 'text-destructive'
        )}>
          {formatValue(data.resultadoEsperado)}
        </span>
      </div>
    </div>
  );
};
