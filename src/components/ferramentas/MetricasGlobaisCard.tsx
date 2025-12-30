import React from 'react';
import { cn } from '@/lib/utils';
import { MetricasGlobais, MoedaCalc } from '@/contexts/CalculadoraContext';
import { Banknote, TrendingUp, AlertTriangle, CheckCircle2, ArrowDownRight, ArrowUpRight, Percent } from 'lucide-react';

interface MetricasGlobaisCardProps {
  metricas: MetricasGlobais;
  moeda: MoedaCalc;
}

export const MetricasGlobaisCard: React.FC<MetricasGlobaisCardProps> = ({ metricas, moeda }) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number, showSign = false) => {
    const prefix = showSign ? (value >= 0 ? '+' : '') : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  return (
    <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Métricas da Operação</span>
        {metricas.operacaoEncerrada && (
          <div className={cn(
            'px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1',
            metricas.motivoEncerramento === 'red' 
              ? 'bg-destructive/20 text-destructive' 
              : 'bg-success/20 text-success'
          )}>
            <CheckCircle2 className="h-3 w-3" />
            {metricas.motivoEncerramento === 'red' ? 'Operação Encerrada (RED)' : 'Todas GREEN'}
          </div>
        )}
      </div>

      {/* Grid de métricas principais */}
      <div className="grid grid-cols-2 gap-3">
        {/* Stake Inicial */}
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2 mb-1">
            <Banknote className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Stake Inicial</span>
          </div>
          <span className="text-lg font-bold text-primary">
            {formatValue(metricas.stakeInicial)}
          </span>
        </div>

        {/* Total Stake LAY */}
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight className="h-4 w-4 text-warning" />
            <span className="text-xs text-muted-foreground">Total Stake LAY</span>
          </div>
          <span className="text-lg font-bold text-warning">
            {formatValue(metricas.totalStakeLay)}
          </span>
        </div>
      </div>

      {/* Cenário se todas GREEN */}
      <div className={cn(
        'p-3 rounded-lg border',
        metricas.resultadoTotalSeGreen >= 0 
          ? 'bg-success/10 border-success/30' 
          : 'bg-destructive/10 border-destructive/30'
      )}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className={cn(
              'h-4 w-4',
              metricas.resultadoTotalSeGreen >= 0 ? 'text-success' : 'text-destructive'
            )} />
            <span className={cn(
              'text-sm font-medium',
              metricas.resultadoTotalSeGreen >= 0 ? 'text-success' : 'text-destructive'
            )}>
              Se todas GREEN
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-xs text-muted-foreground block">Resultado:</span>
            <span className={cn(
              'text-lg font-bold',
              metricas.resultadoTotalSeGreen >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {formatValue(metricas.resultadoTotalSeGreen, true)}
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Eficiência:</span>
            <span className={cn(
              'text-lg font-bold',
              metricas.eficienciaSeGreen >= 100 ? 'text-success' : 
              metricas.eficienciaSeGreen >= 50 ? 'text-warning' : 'text-destructive'
            )}>
              {formatPercent(metricas.eficienciaSeGreen)}
            </span>
          </div>
        </div>
      </div>

      {/* Se RED agora */}
      {!metricas.operacaoEncerrada && (
        <div className={cn(
          'p-3 rounded-lg border',
          metricas.resultadoSeRedAgora >= 0 
            ? 'bg-success/10 border-success/30' 
            : 'bg-destructive/10 border-destructive/30'
        )}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className={cn(
              'h-4 w-4',
              metricas.resultadoSeRedAgora >= 0 ? 'text-success' : 'text-destructive'
            )} />
            <span className={cn(
              'text-sm font-medium',
              metricas.resultadoSeRedAgora >= 0 ? 'text-success' : 'text-destructive'
            )}>
              Se RED agora
            </span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Resultado nesta perna:</span>
            <span className={cn(
              'text-lg font-bold',
              metricas.resultadoSeRedAgora >= 0 ? 'text-success' : 'text-destructive'
            )}>
              {formatValue(metricas.resultadoSeRedAgora, true)}
            </span>
          </div>
        </div>
      )}

      {/* Capital Final (se operação encerrada) */}
      {metricas.operacaoEncerrada && (
        <div className={cn(
          'p-3 rounded-lg border-2',
          metricas.capitalFinal >= metricas.stakeInicial 
            ? 'bg-success/10 border-success/50' 
            : 'bg-destructive/10 border-destructive/50'
        )}>
          <div className="text-center">
            <span className="text-xs text-muted-foreground block mb-1">Capital Final</span>
            <span className={cn(
              'text-2xl font-bold',
              metricas.capitalFinal >= metricas.stakeInicial ? 'text-success' : 'text-destructive'
            )}>
              {formatValue(metricas.capitalFinal)}
            </span>
            <span className={cn(
              'text-sm block mt-1',
              metricas.eficienciaFinal >= 100 ? 'text-success' : 
              metricas.eficienciaFinal >= 50 ? 'text-warning' : 'text-destructive'
            )}>
              ({formatPercent(metricas.eficienciaFinal)} do stake)
            </span>
          </div>
        </div>
      )}

      {/* Juice total */}
      <div className="flex items-center justify-between text-sm p-2 rounded bg-muted/50">
        <div className="flex items-center gap-2">
          <Percent className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Juice Total:</span>
        </div>
        <span className={cn(
          'font-medium',
          metricas.juiceTotal <= 10 ? 'text-success' :
          metricas.juiceTotal <= 20 ? 'text-warning' : 'text-destructive'
        )}>
          {formatPercent(metricas.juiceTotal)}
        </span>
      </div>

      {/* Avisos */}
      {metricas.avisos.length > 0 && (
        <div className="space-y-1">
          {metricas.avisos.map((aviso, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded bg-warning/10 border border-warning/30">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
              <span className="text-xs text-warning">{aviso}</span>
            </div>
          ))}
        </div>
      )}

      {/* Resumo de totais */}
      <div className="pt-3 border-t border-border/50 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Total investido em LAYs:</span>
          </div>
          <span className="font-medium text-foreground">{formatValue(metricas.totalStakeLay)}</span>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-warning" />
            <span className="text-muted-foreground">Total responsabilidade:</span>
          </div>
          <span className="font-medium text-warning">{formatValue(metricas.totalResponsabilidade)}</span>
        </div>
      </div>
    </div>
  );
};
