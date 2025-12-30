import React from 'react';
import { cn } from '@/lib/utils';
import { MetricasGlobais, MoedaCalc } from '@/contexts/CalculadoraContext';
import { Banknote, TrendingUp, AlertTriangle, CheckCircle2, ArrowDownRight, Percent, Activity, Wallet } from 'lucide-react';

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

  const formatPercent = (value: number, showSign = false) => {
    const prefix = showSign ? (value >= 0 ? '+' : '-') : '';
    return `${prefix}${Math.abs(value).toFixed(2)}%`;
  };

  // Custo é normalmente negativo em matched bet
  const custoAbsoluto = Math.abs(metricas.custoTotalAcumulado);

  return (
    <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Métricas da Operação</span>
        {metricas.operacaoEncerrada && (
          <div className={cn(
            'px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1',
            metricas.motivoEncerramento === 'red' 
              ? 'bg-primary/20 text-primary' 
              : 'bg-success/20 text-success'
          )}>
            <CheckCircle2 className="h-3 w-3" />
            {metricas.motivoEncerramento === 'red' ? 'Extração Concluída' : 'Todas GREEN'}
          </div>
        )}
      </div>

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

      {/* CUSTOS REAIS - O que realmente importa */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ArrowDownRight className="h-3.5 w-3.5" />
          <span>Custos Reais</span>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-lg bg-background/50 border border-border/50">
            <span className="text-xs text-muted-foreground block mb-1">Custo Total</span>
            <span className={cn(
              'text-lg font-bold',
              metricas.custoTotalAcumulado >= 0 ? 'text-success' : 'text-warning'
            )}>
              {formatValue(custoAbsoluto)}
            </span>
          </div>
          
          <div className="p-3 rounded-lg bg-background/50 border border-border/50">
            <span className="text-xs text-muted-foreground block mb-1">Juice Total</span>
            <span className={cn(
              'text-lg font-bold',
              metricas.juiceTotal >= 0 ? 'text-success' : 'text-warning'
            )}>
              {formatPercent(metricas.juiceTotal, true)}
            </span>
          </div>
        </div>
      </div>

      {/* Eficiência */}
      <div className="p-3 rounded-lg bg-background/50 border border-border/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Eficiência</span>
          </div>
          <span className={cn(
            'text-lg font-bold',
            metricas.eficienciaSeGreen >= 95 ? 'text-success' : 
            metricas.eficienciaSeGreen >= 90 ? 'text-primary' : 'text-warning'
          )}>
            {metricas.eficienciaSeGreen.toFixed(2)}%
          </span>
        </div>
        <span className="text-xs text-muted-foreground block mt-1">
          Capital recuperado se todas GREEN
        </span>
      </div>

      {/* Se RED agora */}
      {!metricas.operacaoEncerrada && (
        <div className={cn(
          'p-3 rounded-lg border',
          metricas.resultadoSeRedAgora >= 0 
            ? 'bg-success/10 border-success/30' 
            : 'bg-primary/10 border-primary/30'
        )}>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className={cn(
              'h-4 w-4',
              metricas.resultadoSeRedAgora >= 0 ? 'text-success' : 'text-primary'
            )} />
            <span className={cn(
              'text-sm font-medium',
              metricas.resultadoSeRedAgora >= 0 ? 'text-success' : 'text-primary'
            )}>
              Se RED agora
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-muted-foreground block">Capital extraído:</span>
              <span className={cn(
                'text-lg font-bold',
                metricas.resultadoSeRedAgora >= 0 ? 'text-success' : 'text-primary'
              )}>
                {formatValue(metricas.stakeInicial + metricas.resultadoSeRedAgora)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Custo extração:</span>
              <span className="text-lg font-bold text-warning">
                {formatValue(Math.abs(metricas.resultadoSeRedAgora))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Capital Final (se operação encerrada) */}
      {metricas.operacaoEncerrada && (
        <div className="p-3 rounded-lg border-2 bg-primary/10 border-primary/50">
          <div className="text-center">
            <span className="text-xs text-muted-foreground block mb-1">Capital Final</span>
            <span className="text-2xl font-bold text-primary">
              {formatValue(metricas.capitalFinal)}
            </span>
            <span className={cn(
              'text-sm block mt-1',
              metricas.eficienciaFinal >= 95 ? 'text-success' : 'text-primary'
            )}>
              ({metricas.eficienciaFinal.toFixed(2)}% do stake)
            </span>
          </div>
        </div>
      )}

      {/* VOLUME OPERADO - Informativo */}
      <div className="pt-3 border-t border-border/50">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
          <Wallet className="h-3.5 w-3.5" />
          <span>Volume Operado (informativo)</span>
        </div>
        
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Movimentado na Exchange:</span>
            <span className="font-medium text-foreground">{formatValue(metricas.volumeExchange)}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Exposição máxima (resp.):</span>
            <span className="font-medium text-foreground">{formatValue(metricas.totalResponsabilidade)}</span>
          </div>
        </div>
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
    </div>
  );
};