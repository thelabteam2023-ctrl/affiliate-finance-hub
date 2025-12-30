import React from 'react';
import { cn } from '@/lib/utils';
import { MoedaCalc } from '@/contexts/CalculadoraContext';
import { AlertCircle, ArrowRight, Check, TrendingUp, ChevronRight } from 'lucide-react';

interface ProximaAcaoCardProps {
  acao: {
    pernaId: number;
    stakeLay: number;
    oddLay: number;
    responsabilidade: number;
    seRed: { valorRecuperavel: number; eficiencia: number };
    seGreen: { novoPassivo: number; proxPerna: number | null };
  };
  moeda: MoedaCalc;
  stakeInicial: number;
}

export const ProximaAcaoCard: React.FC<ProximaAcaoCardProps> = ({
  acao,
  moeda,
  stakeInicial,
}) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number, showSign = false) => {
    const prefix = showSign ? (value >= 0 ? '+' : '') : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => `${value.toFixed(1)}%`;

  // Calcular capital final se GREEN (considerando custo)
  const custoSeGreen = acao.seGreen.novoPassivo - stakeInicial;
  const capitalFinalSeGreen = stakeInicial - custoSeGreen;

  return (
    <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-primary/20">
          <AlertCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h4 className="font-bold text-foreground">AÇÃO RECOMENDADA</h4>
          <p className="text-xs text-muted-foreground">Perna {acao.pernaId}</p>
        </div>
      </div>

      {/* Stake LAY */}
      <div className="flex items-center gap-2">
        <ArrowRight className="h-5 w-5 text-primary" />
        <span className="font-medium text-foreground">Faça LAY agora:</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-background border border-border">
          <span className="text-xs text-muted-foreground block mb-0.5">Stake LAY</span>
          <span className="text-xl font-bold text-primary">
            {formatValue(acao.stakeLay)}
          </span>
        </div>
        <div className="p-3 rounded-lg bg-background border border-border">
          <span className="text-xs text-muted-foreground block mb-0.5">Odd LAY</span>
          <span className="text-xl font-bold text-primary">
            {acao.oddLay.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="p-2 rounded bg-muted/50">
        <span className="text-xs text-muted-foreground">
          Responsabilidade: <strong className="text-foreground">{formatValue(acao.responsabilidade)}</strong>
        </span>
      </div>

      {/* Cenários */}
      <div className="space-y-2 pt-2 border-t border-border/50">
        {/* Se GREEN */}
        <div className="p-3 rounded-lg bg-success/10 border border-success/20">
          <div className="flex items-center gap-2 mb-2">
            <Check className="h-4 w-4 text-success" />
            <span className="text-sm font-medium text-success">Se GREEN:</span>
          </div>
          {acao.seGreen.proxPerna ? (
            <div className="flex items-center gap-2 text-sm">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                Novo passivo: <strong className="text-foreground">{formatValue(acao.seGreen.novoPassivo)}</strong>
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="text-muted-foreground">Perna {acao.seGreen.proxPerna}</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">Capital final:</span>
                <span className={cn(
                  'font-bold',
                  capitalFinalSeGreen >= 0 ? 'text-success' : 'text-destructive'
                )}>
                  {formatValue(capitalFinalSeGreen)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Eficiência:</span>
                <span className={cn(
                  'font-bold',
                  (capitalFinalSeGreen / stakeInicial) * 100 >= 50 ? 'text-success' : 'text-warning'
                )}>
                  {formatPercent((capitalFinalSeGreen / stakeInicial) * 100)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Se RED (melhor) */}
        <div className="p-3 rounded-lg bg-emerald-500/10 border-2 border-emerald-500/30">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            <span className="text-sm font-medium text-emerald-600">Se RED:</span>
            <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-[10px] font-bold text-emerald-600">
              MELHOR
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground block text-xs">Capital recuperado:</span>
              <span className="font-bold text-emerald-600">{formatValue(acao.seRed.valorRecuperavel)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-xs">Eficiência:</span>
              <span className="font-bold text-emerald-600">{formatPercent(acao.seRed.eficiencia)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const SemProximaAcao: React.FC<{
  motivo: 'red' | 'todas_green' | 'inviavel';
  capitalRecuperado?: number;
  eficiencia?: number;
  moeda: MoedaCalc;
}> = ({ motivo, capitalRecuperado = 0, eficiencia = 0, moeda }) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number) => {
    return `${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const config = {
    red: {
      title: 'Extração Perfeita!',
      description: 'Capital recuperado via exchange. 0% de custo operacional.',
      icon: <TrendingUp className="h-5 w-5 text-emerald-600" />,
      bg: 'bg-emerald-500/10 border-emerald-500/30',
    },
    todas_green: {
      title: 'Operação Concluída',
      description: 'Todas as pernas finalizaram com GREEN.',
      icon: <Check className="h-5 w-5 text-success" />,
      bg: 'bg-success/10 border-success/30',
    },
    inviavel: {
      title: 'Cobertura Inviável',
      description: 'Odd LAY muito alta para cobertura matemática.',
      icon: <AlertCircle className="h-5 w-5 text-destructive" />,
      bg: 'bg-destructive/10 border-destructive/30',
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

      {motivo !== 'inviavel' && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/30">
          <div className="p-2 rounded bg-background/50">
            <span className="text-xs text-muted-foreground block mb-0.5">Capital Recuperado</span>
            <span className={cn(
              'text-sm font-bold',
              motivo === 'red' ? 'text-emerald-600' : 'text-success'
            )}>
              {formatValue(capitalRecuperado)}
            </span>
          </div>
          <div className="p-2 rounded bg-background/50">
            <span className="text-xs text-muted-foreground block mb-0.5">Eficiência</span>
            <span className={cn(
              'text-sm font-bold',
              eficiencia >= 50 ? 'text-success' : 'text-warning'
            )}>
              {eficiencia.toFixed(1)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
