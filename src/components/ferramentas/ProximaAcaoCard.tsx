import React from 'react';
import { cn } from '@/lib/utils';
import { MoedaCalc } from '@/contexts/CalculadoraContext';
import { AlertCircle, AlertTriangle, ArrowRight, Check, TrendingUp, ChevronRight } from 'lucide-react';

interface SimulacaoAtivaCardProps {
  simulacao: {
    pernaId: number;
    stakeLay: number;
    oddLay: number;
    oddBack: number;
    responsabilidade: number;
    seRed: { resultado: number; eficiencia: number };
    seGreen: { resultado: number; eficiencia: number; proxPerna: number | null };
    avisos: string[];
  };
  moeda: MoedaCalc;
  stakeInicial: number;
}

export const SimulacaoAtivaCard: React.FC<SimulacaoAtivaCardProps> = ({
  simulacao,
  moeda,
  stakeInicial,
}) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number, showSign = false) => {
    const prefix = showSign ? (value >= 0 ? '+' : '') : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  const capitalSeGreen = stakeInicial + simulacao.seGreen.resultado;
  const capitalSeRed = stakeInicial + simulacao.seRed.resultado;

  return (
    <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-primary/20">
          <AlertCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h4 className="font-bold text-foreground">SIMULAÇÃO - Perna {simulacao.pernaId}</h4>
          <p className="text-xs text-muted-foreground">Resultados projetados</p>
        </div>
      </div>

      {/* Resumo do LAY */}
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded-lg bg-background border border-border text-center">
          <span className="text-[10px] text-muted-foreground block">Stake LAY</span>
          <span className="text-sm font-bold text-primary">
            {formatValue(simulacao.stakeLay)}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-background border border-border text-center">
          <span className="text-[10px] text-muted-foreground block">Odd LAY</span>
          <span className="text-sm font-bold text-primary">
            {simulacao.oddLay.toFixed(2)}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-background border border-border text-center">
          <span className="text-[10px] text-muted-foreground block">Responsab.</span>
          <span className="text-sm font-bold text-warning">
            {formatValue(simulacao.responsabilidade)}
          </span>
        </div>
      </div>

      {/* Avisos */}
      {simulacao.avisos.length > 0 && (
        <div className="space-y-1">
          {simulacao.avisos.map((aviso, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded bg-warning/10 border border-warning/30">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <span className="text-xs text-warning">{aviso}</span>
            </div>
          ))}
        </div>
      )}

      {/* Cenários */}
      <div className="space-y-2 pt-2 border-t border-border/50">
        {/* Se GREEN */}
        <div className={cn(
          'p-3 rounded-lg border',
          simulacao.seGreen.resultado >= 0 
            ? 'bg-success/10 border-success/30' 
            : 'bg-destructive/10 border-destructive/30'
        )}>
          <div className="flex items-center gap-2 mb-2">
            <Check className={cn(
              'h-4 w-4',
              simulacao.seGreen.resultado >= 0 ? 'text-success' : 'text-destructive'
            )} />
            <span className={cn(
              'text-sm font-medium',
              simulacao.seGreen.resultado >= 0 ? 'text-success' : 'text-destructive'
            )}>
              Se GREEN:
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground block text-xs">Capital final:</span>
              <span className={cn(
                'font-bold',
                capitalSeGreen >= stakeInicial ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(capitalSeGreen)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">Eficiência:</span>
              <span className={cn(
                'font-bold',
                simulacao.seGreen.eficiencia >= 100 ? 'text-success' : 
                simulacao.seGreen.eficiencia >= 50 ? 'text-warning' : 'text-destructive'
              )}>
                {formatPercent(simulacao.seGreen.eficiencia)}
              </span>
            </div>
          </div>
          
          {simulacao.seGreen.proxPerna && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2 pt-2 border-t border-border/30">
              <ChevronRight className="h-3 w-3" />
              <span>Próxima: Perna {simulacao.seGreen.proxPerna}</span>
            </div>
          )}
        </div>

        {/* Se RED */}
        <div className={cn(
          'p-3 rounded-lg border',
          simulacao.seRed.resultado >= 0 
            ? 'bg-success/10 border-success/30' 
            : 'bg-destructive/10 border-destructive/30'
        )}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className={cn(
              'h-4 w-4',
              simulacao.seRed.resultado >= 0 ? 'text-success' : 'text-destructive'
            )} />
            <span className={cn(
              'text-sm font-medium',
              simulacao.seRed.resultado >= 0 ? 'text-success' : 'text-destructive'
            )}>
              Se RED:
            </span>
          </div>
          
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground block text-xs">Capital final:</span>
              <span className={cn(
                'font-bold',
                capitalSeRed >= stakeInicial ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(capitalSeRed)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">Eficiência:</span>
              <span className={cn(
                'font-bold',
                simulacao.seRed.eficiencia >= 100 ? 'text-success' : 
                simulacao.seRed.eficiencia >= 50 ? 'text-warning' : 'text-destructive'
              )}>
                {formatPercent(simulacao.seRed.eficiencia)}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SemSimulacao: React.FC<{
  motivo: 'red' | 'todas_green';
  capitalFinal: number;
  eficiencia: number;
  moeda: MoedaCalc;
  stakeInicial: number;
}> = ({ motivo, capitalFinal, eficiencia, moeda, stakeInicial }) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number) => {
    return `${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const lucrou = capitalFinal >= stakeInicial;

  const config = {
    red: {
      title: 'Operação Encerrada (RED)',
      description: 'A operação foi encerrada por resultado RED.',
      icon: <TrendingUp className={cn('h-5 w-5', lucrou ? 'text-success' : 'text-destructive')} />,
      bg: lucrou ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30',
    },
    todas_green: {
      title: 'Operação Concluída',
      description: 'Todas as pernas finalizaram com GREEN.',
      icon: <Check className={cn('h-5 w-5', lucrou ? 'text-success' : 'text-destructive')} />,
      bg: lucrou ? 'bg-success/10 border-success/30' : 'bg-destructive/10 border-destructive/30',
    },
  };

  const c = config[motivo];

  return (
    <div className={cn('rounded-lg border-2 p-4 space-y-3', c.bg)}>
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-background/50">
          {c.icon}
        </div>
        <div>
          <h4 className="font-bold text-foreground">{c.title}</h4>
          <p className="text-sm text-muted-foreground">{c.description}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30">
        <div className="p-2 rounded bg-background/50">
          <span className="text-xs text-muted-foreground block mb-0.5">Capital Final</span>
          <span className={cn(
            'text-lg font-bold',
            lucrou ? 'text-success' : 'text-destructive'
          )}>
            {formatValue(capitalFinal)}
          </span>
        </div>
        <div className="p-2 rounded bg-background/50">
          <span className="text-xs text-muted-foreground block mb-0.5">Eficiência</span>
          <span className={cn(
            'text-lg font-bold',
            eficiencia >= 100 ? 'text-success' : 
            eficiencia >= 50 ? 'text-warning' : 'text-destructive'
          )}>
            {eficiencia.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="text-center text-xs text-muted-foreground">
        {lucrou 
          ? `Lucro de ${formatValue(capitalFinal - stakeInicial)}`
          : `Prejuízo de ${formatValue(stakeInicial - capitalFinal)}`
        }
      </div>
    </div>
  );
};
