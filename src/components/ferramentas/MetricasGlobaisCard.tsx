import React from 'react';
import { cn } from '@/lib/utils';
import { MetricasGlobais, MoedaCalc } from '@/contexts/CalculadoraContext';
import { Banknote, TrendingUp, AlertTriangle, CheckCircle2, ArrowDownRight, ArrowUpRight } from 'lucide-react';

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

  // Calcular juízo percentual
  const juizoPercentual = metricas.stakeInicial > 0 
    ? ((metricas.stakeInicial - metricas.capitalFinalSeGreen) / metricas.stakeInicial) * 100 
    : 0;

  return (
    <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Métricas da Operação</span>
        {metricas.operacaoEncerrada && (
          <div className={cn(
            'px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1',
            metricas.motivoEncerramento === 'red' 
              ? 'bg-emerald-500/20 text-emerald-600' 
              : 'bg-success/20 text-success'
          )}>
            <CheckCircle2 className="h-3 w-3" />
            {metricas.motivoEncerramento === 'red' ? 'Extração Perfeita' : 'Todas GREEN'}
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
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Capital na bookmaker
          </p>
        </div>

        {/* Passivo Atual */}
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-warning" />
            <span className="text-xs text-muted-foreground">Passivo Atual</span>
          </div>
          <span className="text-lg font-bold text-warning">
            {formatValue(metricas.passivoAtual)}
          </span>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Responsabilidade acumulada
          </p>
        </div>
      </div>

      {/* Cenário se cair RED agora */}
      <div className="p-3 rounded-lg bg-emerald-500/10 border-2 border-emerald-500/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-600">Se RED agora</span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-600">
              MELHOR
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-xs text-muted-foreground block">Capital recuperado:</span>
            <span className="text-lg font-bold text-emerald-600">{formatValue(metricas.valorRecuperavelAtual)}</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Eficiência:</span>
            <span className="text-lg font-bold text-emerald-600">100%</span>
          </div>
        </div>
      </div>

      {/* Cenário se todas GREEN */}
      {!metricas.operacaoEncerrada && (
        <div className="p-3 rounded-lg bg-success/5 border border-success/20">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <span className="text-sm font-medium text-success">Se todas GREEN</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-muted-foreground block">Capital final:</span>
              <span className={cn(
                'text-lg font-bold',
                metricas.capitalFinalSeGreen >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(metricas.capitalFinalSeGreen)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Eficiência:</span>
              <span className={cn(
                'text-lg font-bold',
                metricas.eficienciaAtual >= 50 ? 'text-success' : 'text-warning'
              )}>
                {formatPercent(metricas.eficienciaAtual)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Resumo de custos */}
      <div className="pt-3 border-t border-border/50 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4 text-primary" />
            <span className="text-muted-foreground">Total investido em LAYs:</span>
          </div>
          <span className="font-medium text-foreground">{formatValue(metricas.totalInvestidoLay)}</span>
        </div>
        
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4 text-warning" />
            <span className="text-muted-foreground">Custo operacional (juízo):</span>
          </div>
          <span className="font-medium text-warning">{formatValue(metricas.custoOperacionalTotal)}</span>
        </div>

        {metricas.custoOperacionalTotal > 0 && (
          <div className="p-2 rounded bg-muted/50 text-center">
            <span className="text-xs text-muted-foreground">
              "Foram utilizados {formatValue(metricas.stakeInicial + metricas.custoOperacionalTotal)} no processo. 
              Retornaram {formatValue(metricas.capitalFinalSeGreen)} ao sistema. 
              Custo operacional: −{formatValue(metricas.custoOperacionalTotal)} (−{formatPercent(juizoPercentual)})"
            </span>
          </div>
        )}
      </div>

      {/* Barra de eficiência */}
      {!metricas.operacaoEncerrada && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Eficiência projetada</span>
            <span className={cn(
              'font-medium',
              metricas.eficienciaAtual >= 50 ? 'text-success' : 'text-warning'
            )}>
              {formatPercent(metricas.eficienciaAtual)}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div 
              className={cn(
                'h-full transition-all',
                metricas.eficienciaAtual >= 50 ? 'bg-success' : 'bg-warning'
              )}
              style={{ width: `${Math.max(0, Math.min(100, metricas.eficienciaAtual))}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
