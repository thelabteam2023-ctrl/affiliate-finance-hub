import React from 'react';
import { Check, X, Clock, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PernaAposta, StatusPerna, MoedaCalc } from '@/contexts/CalculadoraContext';

interface ProtecaoPernaCardProps {
  perna: PernaAposta;
  moeda: MoedaCalc;
  totalPernas: number;
  onOddBackChange: (odd: number) => void;
  onOddLayChange: (odd: number) => void;
  onStatusChange: (status: StatusPerna) => void;
  disabled?: boolean;
}

export const ProtecaoPernaCard: React.FC<ProtecaoPernaCardProps> = ({
  perna,
  moeda,
  totalPernas,
  onOddBackChange,
  onOddLayChange,
  onStatusChange,
  disabled = false,
}) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  const isUltimaPerna = perna.id === totalPernas;
  
  const formatValue = (value: number) => {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    const prefix = value >= 0 ? '+' : '';
    return `${prefix}${value.toFixed(2)}%`;
  };

  const statusConfig = {
    pendente: {
      bg: 'bg-warning/10 border-warning/30',
      icon: <Clock className="h-4 w-4 text-warning" />,
      label: 'Pendente',
      textColor: 'text-warning',
    },
    green: {
      bg: 'bg-success/10 border-success/30',
      icon: <Check className="h-4 w-4 text-success" />,
      label: 'Green',
      textColor: 'text-success',
    },
    red: {
      bg: 'bg-destructive/10 border-destructive/30',
      icon: <X className="h-4 w-4 text-destructive" />,
      label: 'Red',
      textColor: 'text-destructive',
    },
  };

  const config = statusConfig[perna.status];

  return (
    <div className={cn(
      'rounded-lg border-2 p-3 transition-all overflow-hidden w-full max-w-[220px]',
      config.bg,
      disabled && 'opacity-50 pointer-events-none'
    )}>
      <div className="flex items-center justify-between mb-2 gap-2">
        <span className="font-semibold text-foreground text-sm">Entrada {perna.id}</span>
        <div className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0', config.bg)}>
          {config.icon}
          <span className={config.textColor}>{config.label}</span>
        </div>
      </div>

      <div className="space-y-2">
        {/* Odd Back */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0 w-10">Back:</Label>
          <Input
            type="number"
            step="0.01"
            min="1.01"
            value={perna.oddBack}
            onChange={(e) => onOddBackChange(parseFloat(e.target.value) || 1.01)}
            className="w-16 h-7 text-sm"
            disabled={perna.status !== 'pendente'}
          />
        </div>

        {/* Odd Lay */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0 w-10">Lay:</Label>
          <Input
            type="number"
            step="0.01"
            min="1.01"
            value={perna.oddLay}
            onChange={(e) => onOddLayChange(parseFloat(e.target.value) || 1.01)}
            className="w-16 h-7 text-sm"
            disabled={perna.status !== 'pendente'}
          />
        </div>

        {perna.status === 'pendente' && (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs bg-success/10 border-success/30 text-success hover:bg-success/20 px-2"
              onClick={() => onStatusChange('green')}
            >
              <Check className="h-3 w-3 mr-1" />
              Green
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-7 text-xs bg-destructive/10 border-destructive/30 text-destructive hover:bg-destructive/20 px-2"
              onClick={() => onStatusChange('red')}
            >
              <X className="h-3 w-3 mr-1" />
              Red
            </Button>
          </div>
        )}

        <div className="pt-2 border-t border-border/50 space-y-1 text-xs">
          {perna.status === 'green' && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground truncate">Resultado:</span>
              <span className="font-medium text-success shrink-0">{formatValue(perna.resultadoSeGreen)}</span>
            </div>
          )}
          
          {perna.status === 'red' && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground truncate">Resultado:</span>
              <span className="font-medium text-destructive shrink-0">{formatValue(perna.resultadoSeRed)}</span>
            </div>
          )}

          {perna.status === 'pendente' && (
            <>
              {/* Se GREEN na casa */}
              <div className="bg-success/5 rounded p-1.5 border border-success/20">
                <div className="flex items-center gap-1 text-success font-medium mb-1">
                  <Check className="h-3 w-3" />
                  <span>Se GREEN na casa:</span>
                </div>
                {isUltimaPerna ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Resultado final:</span>
                    <div className="flex items-center gap-1">
                      <span className={cn('font-medium', perna.resultadoSeGreen >= 0 ? 'text-success' : 'text-destructive')}>
                        {formatValue(perna.resultadoSeGreen)}
                      </span>
                      <span className={cn('text-[10px]', perna.juiceSeGreen >= 0 ? 'text-success/70' : 'text-destructive/70')}>
                        ({formatPercent(perna.juiceSeGreen)})
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <ArrowRight className="h-3 w-3" />
                    <span>Continua p/ Entrada {perna.id + 1}</span>
                  </div>
                )}
              </div>

              {/* Se RED na casa */}
              <div className="bg-destructive/5 rounded p-1.5 border border-destructive/20">
                <div className="flex items-center gap-1 text-destructive font-medium mb-1">
                  <X className="h-3 w-3" />
                  <span>Se RED na casa:</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Resultado final:</span>
                  <div className="flex items-center gap-1">
                    <span className={cn('font-medium', perna.resultadoSeRed >= 0 ? 'text-success' : 'text-destructive')}>
                      {formatValue(perna.resultadoSeRed)}
                    </span>
                    <span className={cn('text-[10px]', perna.juiceSeRed >= 0 ? 'text-success/70' : 'text-destructive/70')}>
                      ({formatPercent(perna.juiceSeRed)})
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-0.5 pt-1 border-t border-border/30">
                <span className="text-muted-foreground">Stake LAY:</span>
                <span className="font-medium text-primary truncate">
                  {currencySymbol} {perna.stakeLay.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
