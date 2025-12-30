import React from 'react';
import { AlertCircle, ArrowRight, Check, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MoedaCalc, PernaAposta } from '@/contexts/CalculadoraContext';

interface AcaoRecomendadaProps {
  stakeLay: number;
  oddLay: number;
  resultadoSeGanhar: number;
  resultadoSePerder: number;
  pernaAtual: number;
  juiceGreen: number;
  juiceRed: number;
  moeda: MoedaCalc;
  pernas: PernaAposta[];
  stakeInicial: number;
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
  pernas,
  stakeInicial,
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

  // Calcular investimento total se todas as entradas derem GREEN
  const investimentoTotalGreen = pernas.reduce((acc, p) => acc + p.stakeLay, 0);

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

      {/* Fluxo por Etapa */}
      <div className="pt-2 border-t border-border/50">
        <h5 className="text-xs font-semibold text-muted-foreground mb-2">FLUXO POR ETAPA</h5>
        <div className="space-y-1">
          {pernas.map((perna, index) => {
            const isAtual = perna.id === pernaAtual;
            const isProcessada = perna.status !== 'pendente';
            const isFutura = perna.id > pernaAtual;
            
            return (
              <div 
                key={perna.id}
                className={cn(
                  'flex items-center gap-2 p-1.5 rounded text-xs',
                  isAtual && 'bg-primary/10 border border-primary/30',
                  isProcessada && perna.status === 'green' && 'bg-success/5',
                  isProcessada && perna.status === 'red' && 'bg-destructive/5',
                  isFutura && 'opacity-50'
                )}
              >
                <span className={cn(
                  'font-medium w-12 shrink-0',
                  isAtual && 'text-primary',
                  isProcessada && perna.status === 'green' && 'text-success',
                  isProcessada && perna.status === 'red' && 'text-destructive'
                )}>
                  E{perna.id}
                </span>
                
                <div className="flex items-center gap-1 text-muted-foreground">
                  <span className="text-[10px]">LAY:</span>
                  <span className="font-medium text-foreground">
                    {currencySymbol} {perna.stakeLay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                
                {isProcessada ? (
                  <span className={cn(
                    'font-medium',
                    perna.status === 'green' ? 'text-success' : 'text-destructive'
                  )}>
                    {perna.status === 'green' ? formatValue(perna.resultadoSeGreen) : formatValue(perna.resultadoSeRed)}
                  </span>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-success text-[10px]">G: {formatValue(perna.resultadoSeGreen)}</span>
                    <span className="text-destructive text-[10px]">R: {formatValue(perna.resultadoSeRed)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Resumo: Investimento total se cobertura total */}
        <div className="mt-2 p-2 rounded bg-muted/50 border border-border/50">
          <div className="flex justify-between items-center text-xs">
            <span className="text-muted-foreground">Invest. Total (se tudo GREEN):</span>
            <span className="font-bold text-foreground">
              {currencySymbol} {(stakeInicial + investimentoTotalGreen).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between items-center text-xs mt-1">
            <span className="text-muted-foreground">Responsabilidade Total:</span>
            <span className="font-bold text-foreground">
              {currencySymbol} {pernas.reduce((acc, p) => acc + p.responsabilidade, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SemAcaoRecomendadaProps {
  motivo: 'concluido' | 'red';
  valorExtraido?: number;
  juicePerdido?: number;
  responsabilidade?: number;
  moeda?: MoedaCalc;
  pernas?: PernaAposta[];
  stakeInicial?: number;
}

export const SemAcaoRecomendada: React.FC<SemAcaoRecomendadaProps> = ({ 
  motivo, 
  valorExtraido = 0, 
  juicePerdido = 0,
  responsabilidade = 0,
  moeda = 'BRL',
  pernas = [],
  stakeInicial = 0
}) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';

  const formatValue = (value: number) => {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    return `${value.toFixed(2)}%`;
  };

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
  
  // Total investido (stakes lay que foram executados)
  const totalInvestido = stakeInicial + pernas.reduce((acc, p) => {
    if (p.status !== 'pendente') return acc + p.stakeLay;
    return acc;
  }, 0);

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

      {/* Fluxo por Etapa - Histórico */}
      {pernas.length > 0 && (
        <div className="pt-2 border-t border-border/30">
          <h5 className="text-xs font-semibold text-muted-foreground mb-2">HISTÓRICO DAS ETAPAS</h5>
          <div className="space-y-1">
            {pernas.map((perna) => {
              const isProcessada = perna.status !== 'pendente';
              
              return (
                <div 
                  key={perna.id}
                  className={cn(
                    'flex items-center gap-2 p-1.5 rounded text-xs',
                    isProcessada && perna.status === 'green' && 'bg-success/10',
                    isProcessada && perna.status === 'red' && 'bg-destructive/10',
                    !isProcessada && 'opacity-50'
                  )}
                >
                  <div className={cn(
                    'flex items-center gap-1 w-12 shrink-0',
                    perna.status === 'green' && 'text-success',
                    perna.status === 'red' && 'text-destructive'
                  )}>
                    {perna.status === 'green' && <Check className="h-3 w-3" />}
                    {perna.status === 'red' && <X className="h-3 w-3" />}
                    <span className="font-medium">E{perna.id}</span>
                  </div>
                  
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <span className="text-[10px]">LAY:</span>
                    <span className="font-medium text-foreground">
                      {currencySymbol} {perna.stakeLay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  
                  <span className={cn(
                    'font-medium',
                    perna.status === 'green' ? 'text-success' : perna.status === 'red' ? 'text-destructive' : 'text-muted-foreground'
                  )}>
                    {isProcessada 
                      ? (perna.status === 'green' ? formatValue(perna.resultadoSeGreen) : formatValue(perna.resultadoSeRed))
                      : '—'
                    }
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resumo da operação */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30">
        <div className="p-2 rounded bg-background/50">
          <span className="text-xs text-muted-foreground block mb-0.5">Valor Extraído</span>
          <span className={cn(
            'text-sm font-bold',
            valorExtraido >= 0 ? 'text-success' : 'text-destructive'
          )}>
            {formatValue(valorExtraido)}
          </span>
        </div>
        <div className="p-2 rounded bg-background/50">
          <span className="text-xs text-muted-foreground block mb-0.5">Juice Perdido</span>
          <span className="text-sm font-bold text-destructive">
            {formatPercent(juicePerdido)}
          </span>
        </div>
        <div className="p-2 rounded bg-background/50">
          <span className="text-xs text-muted-foreground block mb-0.5">Invest. Total</span>
          <span className="text-sm font-bold text-foreground">
            {currencySymbol} {totalInvestido.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
        <div className="p-2 rounded bg-background/50">
          <span className="text-xs text-muted-foreground block mb-0.5">Responsabilidade</span>
          <span className="text-sm font-bold text-foreground">
            {currencySymbol} {responsabilidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>
    </div>
  );
};
