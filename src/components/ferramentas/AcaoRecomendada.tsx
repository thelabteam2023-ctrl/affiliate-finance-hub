import React from 'react';
import { AlertCircle, ArrowRight, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoedaCalc } from '@/contexts/CalculadoraContext';

interface AcaoRecomendadaProps {
  stakeLay: number;
  oddLay: number;
  resultadoSeGanhar: number;
  resultadoSePerder: number;
  pernaAtual: number;
  juiceGreen: number;
  juiceRed: number;
  moeda: MoedaCalc;
}

export const AcaoRecomendada: React.FC<AcaoRecomendadaProps> = ({
  stakeLay,
  oddLay,
  resultadoSeGanhar,
  resultadoSePerder,
  pernaAtual,
  juiceGreen,
  juiceRed,
  moeda,
}) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number) => {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
  };

  return (
    <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-3 sm:p-4 space-y-3 h-full">
      <div className="flex items-center gap-2">
        <div className="p-1.5 sm:p-2 rounded-full bg-primary/20">
          <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
        </div>
        <div>
          <h4 className="font-bold text-foreground text-sm sm:text-base">AÇÃO RECOMENDADA</h4>
          <p className="text-xs text-muted-foreground">Entrada {pernaAtual}</p>
        </div>
      </div>

      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-center gap-2">
          <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
          <span className="font-medium text-foreground text-sm sm:text-base">Faça LAY agora:</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="p-2 sm:p-3 rounded-lg bg-background border border-border">
            <span className="text-xs text-muted-foreground block mb-0.5">Stake LAY</span>
            <span className="text-base sm:text-xl font-bold text-primary">
              {currencySymbol} {stakeLay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-background border border-border">
            <span className="text-xs text-muted-foreground block mb-0.5">Odd LAY</span>
            <span className="text-base sm:text-xl font-bold text-primary">
              {oddLay.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="space-y-1.5 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between p-1.5 sm:p-2 rounded bg-success/10 gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success shrink-0" />
              <span className="text-xs sm:text-sm text-muted-foreground truncate">Se GREEN:</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn(
                'font-bold text-sm sm:text-base',
                resultadoSeGanhar >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(resultadoSeGanhar)}
              </span>
              <span className={cn(
                'text-xs',
                juiceGreen >= 0 ? 'text-success/70' : 'text-destructive/70'
              )}>
                ({formatPercent(juiceGreen)})
              </span>
            </div>
          </div>
          
          <div className="flex items-center justify-between p-1.5 sm:p-2 rounded bg-destructive/10 gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <X className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive shrink-0" />
              <span className="text-xs sm:text-sm text-muted-foreground truncate">Se RED:</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={cn(
                'font-bold text-sm sm:text-base',
                resultadoSePerder >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(resultadoSePerder)}
              </span>
              <span className={cn(
                'text-xs',
                juiceRed >= 0 ? 'text-success/70' : 'text-destructive/70'
              )}>
                ({formatPercent(juiceRed)})
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SemAcaoRecomendada: React.FC<{ motivo: 'concluido' | 'red' }> = ({ motivo }) => {
  const config = {
    concluido: {
      title: 'Operação Concluída',
      description: 'Todas as pernas foram processadas.',
      icon: <Check className="h-5 w-5 text-success" />,
      bg: 'bg-success/10 border-success/30',
    },
    red: {
      title: 'Operação Encerrada',
      description: 'Uma perna deu RED. Objetivo atingido.',
      icon: <X className="h-5 w-5 text-destructive" />,
      bg: 'bg-destructive/10 border-destructive/30',
    },
  };

  const c = config[motivo];

  return (
    <div className={cn('rounded-lg border-2 p-4', c.bg)}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-background/50">
          {c.icon}
        </div>
        <div>
          <h4 className="font-bold text-foreground">{c.title}</h4>
          <p className="text-sm text-muted-foreground">{c.description}</p>
        </div>
      </div>
    </div>
  );
};
