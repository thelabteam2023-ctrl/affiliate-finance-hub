import React from 'react';
import { Clock, Check, TrendingUp, Lock, ChevronRight, AlertTriangle, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PernaAposta, StatusPerna, MoedaCalc } from '@/contexts/CalculadoraContext';

interface PernaTimelineProps {
  pernas: PernaAposta[];
  moeda: MoedaCalc;
  stakeInicial: number;
  onOddBackChange: (id: number, odd: number) => void;
  onOddLayChange: (id: number, odd: number) => void;
  onStakeLayChange: (id: number, stake: number) => void;
  onConfirmar: (id: number, resultado: 'green' | 'red') => void;
}

const statusConfig: Record<StatusPerna, {
  bg: string;
  border: string;
  icon: React.ReactNode;
  label: string;
  textColor: string;
}> = {
  aguardando: {
    bg: 'bg-muted/30',
    border: 'border-border/50',
    icon: <Clock className="h-4 w-4 text-muted-foreground" />,
    label: 'Aguardando',
    textColor: 'text-muted-foreground',
  },
  ativa: {
    bg: 'bg-primary/10',
    border: 'border-primary/50',
    icon: <ChevronRight className="h-4 w-4 text-primary" />,
    label: 'Ativa',
    textColor: 'text-primary',
  },
  green: {
    bg: 'bg-success/10',
    border: 'border-success/50',
    icon: <Check className="h-4 w-4 text-success" />,
    label: 'GREEN',
    textColor: 'text-success',
  },
  red: {
    bg: 'bg-destructive/10',
    border: 'border-destructive/50',
    icon: <TrendingUp className="h-4 w-4 text-destructive" />,
    label: 'RED',
    textColor: 'text-destructive',
  },
  travada: {
    bg: 'bg-muted/20',
    border: 'border-border/30',
    icon: <Lock className="h-4 w-4 text-muted-foreground/50" />,
    label: 'Travada',
    textColor: 'text-muted-foreground/50',
  },
};

const PernaCard: React.FC<{
  perna: PernaAposta;
  moeda: MoedaCalc;
  stakeInicial: number;
  totalPernas: number;
  onOddBackChange: (odd: number) => void;
  onOddLayChange: (odd: number) => void;
  onStakeLayChange: (stake: number) => void;
  onConfirmar: (resultado: 'green' | 'red') => void;
}> = ({
  perna,
  moeda,
  stakeInicial,
  totalPernas,
  onOddBackChange,
  onOddLayChange,
  onStakeLayChange,
  onConfirmar,
}) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  const config = statusConfig[perna.status];
  const isEditavel = perna.status === 'ativa' || perna.status === 'aguardando';
  const isUltima = perna.id === totalPernas;
  
  const formatValue = (value: number, showSign = false) => {
    const prefix = showSign ? (value >= 0 ? '+' : '') : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  return (
    <div className={cn(
      'rounded-lg border-2 p-3 transition-all w-full max-w-[280px] flex-shrink-0',
      config.bg,
      config.border,
      perna.status === 'travada' && 'opacity-50'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-foreground text-sm">Perna {perna.id}</span>
        <div className={cn(
          'flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
          config.bg
        )}>
          {config.icon}
          <span className={config.textColor}>{config.label}</span>
        </div>
      </div>

      {/* Inputs: Odds + Stake LAY */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14">Back:</Label>
          <Input
            type="number"
            step="0.01"
            min="1.01"
            value={perna.oddBack}
            onChange={(e) => onOddBackChange(parseFloat(e.target.value) || 1.01)}
            className="w-20 h-8 text-sm"
            disabled={!isEditavel}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14">Lay:</Label>
          <Input
            type="number"
            step="0.01"
            min="1.01"
            value={perna.oddLay}
            onChange={(e) => onOddLayChange(parseFloat(e.target.value) || 1.01)}
            className="w-20 h-8 text-sm"
            disabled={!isEditavel}
          />
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-14">Stake:</Label>
          <Input
            type="number"
            step="1"
            min="1"
            value={perna.stakeLay}
            onChange={(e) => onStakeLayChange(parseFloat(e.target.value) || 1)}
            className="w-20 h-8 text-sm"
            disabled={!isEditavel}
          />
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => onStakeLayChange(stakeInicial)}
            className="h-8 px-2 text-[10px]"
            disabled={!isEditavel}
            title="Igualar ao stake inicial"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Responsabilidade */}
      <div className="mb-3 p-2 rounded bg-background/50 border border-border/30">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Responsabilidade:</span>
          <span className="font-bold text-warning">{formatValue(perna.responsabilidade)}</span>
        </div>
      </div>

      {/* Avisos informativos (nunca bloqueios) */}
      {perna.avisos.length > 0 && (
        <div className="mb-3 p-2 rounded bg-warning/10 border border-warning/30 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div className="text-xs text-warning space-y-0.5">
            {perna.avisos.map((aviso, i) => (
              <div key={i}>{aviso}</div>
            ))}
          </div>
        </div>
      )}

      {/* Botões de confirmação */}
      {perna.status === 'ativa' && (
        <div className="space-y-2 mb-3">
          <Button
            size="sm"
            className="w-full h-8 text-xs bg-success/20 border-success/30 text-success hover:bg-success/30"
            variant="outline"
            onClick={() => onConfirmar('green')}
          >
            <Check className="h-3 w-3 mr-1" />
            GREEN - Ganhou na Bookmaker
          </Button>
          <Button
            size="sm"
            className="w-full h-8 text-xs bg-destructive/20 border-destructive/30 text-destructive hover:bg-destructive/30"
            variant="outline"
            onClick={() => onConfirmar('red')}
          >
            <TrendingUp className="h-3 w-3 mr-1" />
            RED - Perdeu na Bookmaker
          </Button>
        </div>
      )}

      {/* Simulação de resultados (perna ativa ou aguardando) */}
      {(perna.status === 'ativa' || perna.status === 'aguardando') && (
        <div className="space-y-2 pt-2 border-t border-border/30">
          {/* Se GREEN */}
          <div className="p-2 rounded bg-success/5 border border-success/20">
            <div className="flex items-center gap-1 text-success text-xs font-medium mb-1">
              <Check className="h-3 w-3" />
              Se GREEN:
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Resultado:</span>
              <span className={cn(
                'font-bold',
                perna.resultadoSeGreen >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(perna.resultadoSeGreen, true)}
              </span>
            </div>
          </div>

          {/* Se RED */}
          <div className="p-2 rounded bg-destructive/5 border border-destructive/20">
            <div className="flex items-center gap-1 text-destructive text-xs font-medium mb-1">
              <TrendingUp className="h-3 w-3" />
              Se RED:
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Resultado:</span>
              <span className={cn(
                'font-bold',
                perna.resultadoSeRed >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(perna.resultadoSeRed, true)}
              </span>
            </div>
          </div>

          {/* Juice */}
          {perna.juicePerna > 0 && (
            <div className="text-center text-[10px] text-muted-foreground">
              Juice: {formatPercent(perna.juicePerna)}
            </div>
          )}
        </div>
      )}

      {/* Resultado confirmado GREEN */}
      {perna.status === 'green' && (
        <div className="pt-2 border-t border-border/30">
          <div className="p-2 rounded bg-success/10 border border-success/20">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Lucro back:</span>
              <span className="font-medium text-success">{formatValue(perna.lucroBack, true)}</span>
            </div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Custo LAY:</span>
              <span className="font-medium text-warning">{formatValue(-perna.responsabilidade)}</span>
            </div>
            <div className="flex justify-between text-xs pt-1 border-t border-success/20">
              <span className="text-muted-foreground">Resultado:</span>
              <span className={cn(
                'font-bold',
                perna.resultadoSeGreen >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(perna.resultadoSeGreen, true)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Resultado confirmado RED */}
      {perna.status === 'red' && (
        <div className="pt-2 border-t border-border/30">
          <div className="p-2 rounded bg-destructive/10 border border-destructive/30">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Ganho LAY:</span>
              <span className="font-medium text-success">{formatValue(perna.ganhoLayLiquido, true)}</span>
            </div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Responsabilidade:</span>
              <span className="font-medium text-destructive">{formatValue(-perna.responsabilidade)}</span>
            </div>
            <div className="flex justify-between text-xs pt-1 border-t border-destructive/20">
              <span className="text-muted-foreground">Resultado:</span>
              <span className={cn(
                'font-bold',
                perna.resultadoSeRed >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(perna.resultadoSeRed, true)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const PernaTimeline: React.FC<PernaTimelineProps> = ({
  pernas,
  moeda,
  stakeInicial,
  onOddBackChange,
  onOddLayChange,
  onStakeLayChange,
  onConfirmar,
}) => {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm text-foreground">Timeline das Pernas</h3>
      
      {/* Timeline horizontal scrollável */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {pernas.map((perna, index) => (
          <React.Fragment key={perna.id}>
            <PernaCard
              perna={perna}
              moeda={moeda}
              stakeInicial={stakeInicial}
              totalPernas={pernas.length}
              onOddBackChange={(odd) => onOddBackChange(perna.id, odd)}
              onOddLayChange={(odd) => onOddLayChange(perna.id, odd)}
              onStakeLayChange={(stake) => onStakeLayChange(perna.id, stake)}
              onConfirmar={(resultado) => onConfirmar(perna.id, resultado)}
            />
            
            {/* Conector entre pernas */}
            {index < pernas.length - 1 && (
              <div className="flex items-center justify-center shrink-0">
                <div className={cn(
                  'w-8 h-0.5',
                  perna.status === 'green' ? 'bg-success' :
                  perna.status === 'red' ? 'bg-destructive' :
                  'bg-border'
                )} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
