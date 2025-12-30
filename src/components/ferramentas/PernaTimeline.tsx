import React from 'react';
import { Clock, Check, TrendingUp, Lock, ChevronRight, Target, Wallet, ArrowUpRight, ArrowDownRight } from 'lucide-react';
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
  onExtracaoChange: (id: number, valor: number) => void;
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
    bg: 'bg-warning/10',
    border: 'border-warning/50',
    icon: <ArrowUpRight className="h-4 w-4 text-warning" />,
    label: 'GREEN (Passivo +)',
    textColor: 'text-warning',
  },
  red: {
    bg: 'bg-success/10',
    border: 'border-success/50',
    icon: <Check className="h-4 w-4 text-success" />,
    label: 'RED (Extraído!)',
    textColor: 'text-success',
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
  onOddBackChange: (odd: number) => void;
  onOddLayChange: (odd: number) => void;
  onExtracaoChange: (valor: number) => void;
  onConfirmar: (resultado: 'green' | 'red') => void;
}> = ({
  perna,
  moeda,
  stakeInicial,
  onOddBackChange,
  onOddLayChange,
  onExtracaoChange,
  onConfirmar,
}) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  const config = statusConfig[perna.status];
  const isEditavel = perna.status === 'ativa' || perna.status === 'aguardando';
  
  const formatValue = (value: number, showSign = false) => {
    const prefix = showSign ? (value >= 0 ? '+' : '') : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className={cn(
      'rounded-lg border-2 p-3 transition-all w-full max-w-[300px] flex-shrink-0',
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

      {/* Passivo Atual + Target (modelo de recuperação) */}
      <div className="mb-3 p-2 rounded bg-background/50 border border-border/30 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            <Wallet className="h-3 w-3" />
            Passivo Atual:
          </span>
          <span className={cn(
            'font-bold',
            perna.passivoAtual > 0 ? 'text-warning' : 'text-muted-foreground'
          )}>
            {formatValue(perna.passivoAtual)}
          </span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground flex items-center gap-1">
            <Target className="h-3 w-3" />
            Target a recuperar:
          </span>
          <span className="font-bold text-primary">
            {formatValue(perna.target)}
          </span>
        </div>
      </div>

      {/* Inputs: Odds + Extração */}
      <div className="space-y-2 mb-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-16">Back:</Label>
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
          <Label className="text-xs text-muted-foreground w-16">Lay:</Label>
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
          <Label className="text-xs text-muted-foreground w-16">Extração:</Label>
          <Input
            type="number"
            step="10"
            min="0"
            value={perna.extracaoDesejada}
            onChange={(e) => onExtracaoChange(parseFloat(e.target.value) || 0)}
            className="w-20 h-8 text-sm"
            disabled={!isEditavel}
          />
        </div>
      </div>

      {/* Stake LAY calculado automaticamente */}
      <div className="mb-3 p-2 rounded bg-primary/10 border border-primary/30">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Stake LAY necessário:</span>
          <span className="font-bold text-primary">{formatValue(perna.stakeLayNecessario)}</span>
        </div>
        <div className="flex justify-between text-xs mt-1">
          <span className="text-muted-foreground">Responsabilidade:</span>
          <span className="font-bold text-warning">{formatValue(perna.responsabilidade)}</span>
        </div>
      </div>

      {/* Botões de confirmação */}
      {perna.status === 'ativa' && (
        <div className="space-y-2 mb-3">
          <Button
            size="sm"
            className="w-full h-8 text-xs bg-warning/20 border-warning/30 text-warning hover:bg-warning/30"
            variant="outline"
            onClick={() => onConfirmar('green')}
          >
            <ArrowUpRight className="h-3 w-3 mr-1" />
            GREEN - Passivo aumenta
          </Button>
          <Button
            size="sm"
            className="w-full h-8 text-xs bg-success/20 border-success/30 text-success hover:bg-success/30"
            variant="outline"
            onClick={() => onConfirmar('red')}
          >
            <Check className="h-3 w-3 mr-1" />
            RED - Extrai e encerra!
          </Button>
        </div>
      )}

      {/* Simulação de resultados (perna ativa ou aguardando) */}
      {(perna.status === 'ativa' || perna.status === 'aguardando') && (
        <div className="space-y-2 pt-2 border-t border-border/30">
          {/* Se GREEN */}
          <div className="p-2 rounded bg-warning/5 border border-warning/20">
            <div className="flex items-center gap-1 text-warning text-xs font-medium mb-1">
              <ArrowUpRight className="h-3 w-3" />
              Se GREEN:
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Resultado perna:</span>
              <span className={cn(
                'font-bold',
                perna.resultadoSeGreen >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(perna.resultadoSeGreen, true)}
              </span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-muted-foreground">Novo passivo:</span>
              <span className="font-bold text-warning">
                {formatValue(perna.novoPassivoSeGreen)}
              </span>
            </div>
          </div>

          {/* Se RED */}
          <div className="p-2 rounded bg-success/5 border border-success/20">
            <div className="flex items-center gap-1 text-success text-xs font-medium mb-1">
              <Check className="h-3 w-3" />
              Se RED (objetivo!):
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Capital extraído:</span>
              <span className="font-bold text-success">
                {formatValue(perna.capitalExtraidoSeRed)}
              </span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-muted-foreground">Passivo:</span>
              <span className="font-bold text-success">
                Zerado ✓
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Resultado confirmado GREEN */}
      {perna.status === 'green' && (
        <div className="pt-2 border-t border-border/30">
          <div className="p-2 rounded bg-warning/10 border border-warning/30">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Lucro BACK:</span>
              <span className="font-medium text-success">{formatValue(perna.lucroBack, true)}</span>
            </div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Perda LAY:</span>
              <span className="font-medium text-destructive">{formatValue(-perna.perdaLay)}</span>
            </div>
            <div className="flex justify-between text-xs pt-1 border-t border-warning/20">
              <span className="text-muted-foreground">Resultado:</span>
              <span className={cn(
                'font-bold',
                perna.resultadoSeGreen >= 0 ? 'text-success' : 'text-destructive'
              )}>
                {formatValue(perna.resultadoSeGreen, true)}
              </span>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-muted-foreground">Novo passivo:</span>
              <span className="font-bold text-warning">
                {formatValue(perna.novoPassivoSeGreen)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Resultado confirmado RED */}
      {perna.status === 'red' && (
        <div className="pt-2 border-t border-border/30">
          <div className="p-2 rounded bg-success/10 border border-success/30">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Capital extraído:</span>
              <span className="font-medium text-success">{formatValue(perna.capitalExtraidoSeRed)}</span>
            </div>
            <div className="flex justify-between text-xs pt-1 border-t border-success/20">
              <span className="text-muted-foreground">Passivo:</span>
              <span className="font-bold text-success">Zerado ✓</span>
            </div>
            <div className="text-center text-xs text-success mt-2">
              🎉 Extração concluída com sucesso!
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
  onExtracaoChange,
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
              onOddBackChange={(odd) => onOddBackChange(perna.id, odd)}
              onOddLayChange={(odd) => onOddLayChange(perna.id, odd)}
              onExtracaoChange={(valor) => onExtracaoChange(perna.id, valor)}
              onConfirmar={(resultado) => onConfirmar(perna.id, resultado)}
            />
            
            {/* Conector entre pernas */}
            {index < pernas.length - 1 && (
              <div className="flex items-center justify-center shrink-0">
                <div className={cn(
                  'w-8 h-0.5',
                  perna.status === 'green' ? 'bg-warning' :
                  perna.status === 'red' ? 'bg-success' :
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
