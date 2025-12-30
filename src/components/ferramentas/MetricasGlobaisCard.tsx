import React from 'react';
import { cn } from '@/lib/utils';
import { MetricasGlobais, MoedaCalc } from '@/contexts/CalculadoraContext';
import { Banknote, AlertTriangle, CheckCircle2, Target, Wallet, TrendingUp, Activity } from 'lucide-react';

interface MetricasGlobaisCardProps {
  metricas: MetricasGlobais;
  moeda: MoedaCalc;
}

export const MetricasGlobaisCard: React.FC<MetricasGlobaisCardProps> = ({ metricas, moeda }) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number) => {
    return `${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Métricas da Operação</span>
        {metricas.operacaoEncerrada && (
          <div className="px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 bg-success/20 text-success">
            <CheckCircle2 className="h-3 w-3" />
            Extração Concluída
          </div>
        )}
      </div>

      {/* Stake Inicial */}
      <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
        <div className="flex items-center gap-2 mb-1">
          <Banknote className="h-4 w-4 text-primary" />
          <span className="text-xs text-muted-foreground">Stake Inicial (Banca na Bookmaker)</span>
        </div>
        <span className="text-lg font-bold text-primary">
          {formatValue(metricas.stakeInicial)}
        </span>
      </div>

      {/* Situação Atual */}
      {!metricas.operacaoEncerrada && (
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
            <div className="flex items-center gap-2 mb-1">
              <Wallet className="h-4 w-4 text-warning" />
              <span className="text-xs text-muted-foreground">Passivo Atual</span>
            </div>
            <span className="text-lg font-bold text-warning">
              {formatValue(metricas.passivoAtual)}
            </span>
          </div>
          
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">Target Atual</span>
            </div>
            <span className="text-lg font-bold text-primary">
              {formatValue(metricas.targetAtual)}
            </span>
          </div>
        </div>
      )}

      {/* Se RED agora (cenário desejado) */}
      {!metricas.operacaoEncerrada && (
        <div className="p-3 rounded-lg bg-success/10 border border-success/30">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-success" />
            <span className="text-sm font-medium text-success">
              Se RED agora (objetivo!)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-xs text-muted-foreground block">Capital extraído:</span>
              <span className="text-lg font-bold text-success">
                {formatValue(metricas.capitalExtraidoSeRedAgora)}
              </span>
            </div>
            <div>
              <span className="text-xs text-muted-foreground block">Eficiência:</span>
              <span className="text-lg font-bold text-success">
                {((metricas.capitalExtraidoSeRedAgora / metricas.stakeInicial) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
          <span className="text-xs text-muted-foreground block mt-2">
            Passivo zerado, sistema limpo ✓
          </span>
        </div>
      )}

      {/* Capital Final (se operação encerrada) */}
      {metricas.operacaoEncerrada && (
        <div className="p-3 rounded-lg border-2 bg-success/10 border-success/50">
          <div className="text-center">
            <span className="text-xs text-muted-foreground block mb-1">Capital Final Extraído</span>
            <span className="text-2xl font-bold text-success">
              {formatValue(metricas.capitalFinal)}
            </span>
            <span className={cn(
              'text-sm block mt-1',
              metricas.eficienciaFinal >= 100 ? 'text-success' : 'text-primary'
            )}>
              ({metricas.eficienciaFinal.toFixed(1)}% do stake)
            </span>
          </div>
        </div>
      )}

      {/* Volume Operado (informativo) */}
      <div className="pt-3 border-t border-border/50">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2">
          <Activity className="h-3.5 w-3.5" />
          <span>Volume Operado (informativo)</span>
        </div>
        
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total movimentado (Stake LAY):</span>
            <span className="font-medium text-foreground">{formatValue(metricas.volumeExchange)}</span>
          </div>
          
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Exposição máxima (responsab.):</span>
            <span className="font-medium text-foreground">{formatValue(metricas.exposicaoMaxima)}</span>
          </div>
        </div>
      </div>

      {/* Aviso de Risco */}
      <div className="p-3 rounded bg-warning/10 border border-warning/30 flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
        <span className="text-xs text-warning">{metricas.avisoRisco}</span>
      </div>
    </div>
  );
};
