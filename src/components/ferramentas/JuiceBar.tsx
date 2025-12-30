import React from 'react';
import { cn } from '@/lib/utils';
import { JuiceData, MoedaCalc } from '@/contexts/CalculadoraContext';
import { ArrowDown, ArrowUp, Percent, Banknote } from 'lucide-react';

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
    return `${value.toFixed(1)}%`;
  };

  // Barra de eficiência visual
  const eficienciaGreen = Math.max(0, Math.min(100, data.eficienciaSeGreen));
  const eficienciaRed = 100; // RED sempre 100%

  return (
    <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">Visão da Retirada de Capital</span>
      </div>

      {/* Métricas principais */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-center gap-2 mb-1">
            <Banknote className="h-4 w-4 text-primary" />
            <span className="text-xs text-muted-foreground">Capital Retirável</span>
          </div>
          <span className="text-lg font-bold text-primary">
            {formatValue(data.capitalRetiravel, false)}
          </span>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Valor que pode sair da bookmaker
          </p>
        </div>
        
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDown className="h-4 w-4 text-warning" />
            <span className="text-xs text-muted-foreground">Custo da Retirada</span>
          </div>
          <span className="text-lg font-bold text-warning">
            {formatValue(data.custoRetirada, false)}
          </span>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Juice (se GREEN) — não é prejuízo
          </p>
        </div>
      </div>

      {/* Cenários de resultado */}
      <div className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Cenários de Extração</span>
        
        {/* Se GREEN */}
        <div className="p-3 rounded-lg bg-success/5 border border-success/20">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <ArrowUp className="h-4 w-4 text-success" />
              <span className="text-sm font-medium text-success">Se GREEN (vitória na casa)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={cn(
                'text-sm font-bold',
                data.resultadoSeGreen >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(data.resultadoSeGreen)}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Eficiência da retirada</span>
              <span className={cn(
                'font-medium',
                eficienciaGreen >= 50 ? 'text-success' : eficienciaGreen >= 0 ? 'text-warning' : 'text-destructive'
              )}>
                {formatPercent(eficienciaGreen)}
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={cn(
                  'h-full transition-all',
                  eficienciaGreen >= 50 ? 'bg-success' : eficienciaGreen >= 0 ? 'bg-warning' : 'bg-destructive'
                )}
                style={{ width: `${Math.max(0, eficienciaGreen)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Capital sai via vitória, juice é consumido
            </p>
          </div>
        </div>

        {/* Se RED - Melhor cenário */}
        <div className="p-3 rounded-lg bg-emerald-500/10 border-2 border-emerald-500/30">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-600">
                MELHOR
              </div>
              <span className="text-sm font-medium text-emerald-600">Se RED (derrota na casa)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-emerald-600">
                {formatValue(data.resultadoSeRed)}
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Eficiência da retirada</span>
              <span className="font-medium text-emerald-600">{formatPercent(eficienciaRed)}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 w-full" />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Capital sai via exchange, juice NÃO é consumido
            </p>
          </div>
        </div>
      </div>

      {/* Resultado líquido destacado */}
      <div className={cn(
        'flex items-center justify-between p-3 rounded-lg border-2',
        data.resultadoLiquido >= 0 
          ? 'bg-success/10 border-success/30' 
          : 'bg-destructive/10 border-destructive/30'
      )}>
        <div>
          <span className="text-sm font-medium text-foreground block">Resultado Líquido Esperado</span>
          <span className="text-[10px] text-muted-foreground">Se GREEN (cenário conservador)</span>
        </div>
        <span className={cn(
          'text-lg font-bold',
          data.resultadoLiquido >= 0 ? 'text-success' : 'text-destructive'
        )}>
          {formatValue(data.resultadoLiquido)}
        </span>
      </div>
    </div>
  );
};
