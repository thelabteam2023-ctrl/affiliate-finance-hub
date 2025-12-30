import React from 'react';
import { AlertCircle, ArrowRight, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoedaCalc } from '@/contexts/CalculadoraContext';

interface AcaoRecomendadaProps {
  valorLay: number;
  oddMinima: number;
  resultadoSeGanhar: number;
  resultadoSePerder: number;
  pernaAtual: number;
  moeda: MoedaCalc;
}

export const AcaoRecomendada: React.FC<AcaoRecomendadaProps> = ({
  valorLay,
  oddMinima,
  resultadoSeGanhar,
  resultadoSePerder,
  pernaAtual,
  moeda,
}) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number) => {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-2 rounded-full bg-primary/20">
          <AlertCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h4 className="font-bold text-foreground">AÇÃO RECOMENDADA</h4>
          <p className="text-xs text-muted-foreground">Entrada {pernaAtual}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 text-lg">
          <ArrowRight className="h-5 w-5 text-primary" />
          <span className="font-medium text-foreground">Faça LAY agora:</span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 rounded-lg bg-background border border-border">
            <span className="text-xs text-muted-foreground block mb-1">Valor</span>
            <span className="text-xl font-bold text-primary">
              {currencySymbol} {valorLay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="p-3 rounded-lg bg-background border border-border">
            <span className="text-xs text-muted-foreground block mb-1">Odd mínima</span>
            <span className="text-xl font-bold text-primary">
              {oddMinima.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-border/50">
          <div className="flex items-center justify-between p-2 rounded bg-success/10">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-success" />
              <span className="text-sm text-muted-foreground">Se GANHAR na casa:</span>
            </div>
            <span className={cn(
              'font-bold',
              resultadoSeGanhar >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {formatValue(resultadoSeGanhar)}
            </span>
          </div>
          
          <div className="flex items-center justify-between p-2 rounded bg-destructive/10">
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-destructive" />
              <span className="text-sm text-muted-foreground">Se PERDER na casa:</span>
            </div>
            <span className={cn(
              'font-bold',
              resultadoSePerder >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {formatValue(resultadoSePerder)}
            </span>
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
