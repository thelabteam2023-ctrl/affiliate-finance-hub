import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { MoedaCalc } from '@/contexts/CalculadoraContext';
import { AlertCircle, ArrowUpRight, Check, ChevronDown, ChevronRight, ChevronUp, HelpCircle, PartyPopper, Target, Wallet } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface SimulacaoAtivaCardProps {
  simulacao: {
    pernaId: number;
    capitalComprometido: number;
    target: number;
    stakeLay: number;
    oddLay: number;
    oddBack: number;
    custoLay: number;
    seRed: { capitalRecuperado: number; lucro: number };
    seGreen: { custo: number; novoCapitalComprometido: number; proxPerna: number | null };
  };
  moeda: MoedaCalc;
  stakeInicial: number;
  volumeExchange: number;
  exposicaoMaxima: number;
}

export const SimulacaoAtivaCard: React.FC<SimulacaoAtivaCardProps> = ({
  simulacao,
  moeda,
  stakeInicial,
  volumeExchange,
  exposicaoMaxima,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number, showSign = false) => {
    const prefix = showSign ? (value >= 0 ? '+' : '') : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const roi = ((simulacao.seRed.lucro / stakeInicial) * 100);

  return (
    <div className="rounded-lg border-2 border-primary/50 bg-primary/5 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-primary/20">
          <AlertCircle className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h4 className="font-bold text-foreground">PERNA {simulacao.pernaId} - Ativa</h4>
          <p className="text-xs text-muted-foreground">Modelo Capital Comprometido</p>
        </div>
      </div>

      {/* Situação atual */}
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-lg bg-warning/10 border border-warning/30 text-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[10px] text-muted-foreground block cursor-help">
                  <Wallet className="h-3 w-3 inline mr-1" />
                  Capital Comprometido
                  <HelpCircle className="h-3 w-3 inline ml-1" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[220px] text-xs">
                <p>Todo capital já em risco: stake inicial + custos dos LAYs anteriores.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="text-sm font-bold text-warning">
            {formatValue(simulacao.capitalComprometido)}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/30 text-center">
          <span className="text-[10px] text-muted-foreground block">
            <Target className="h-3 w-3 inline mr-1" />
            Target (= Comprometido)
          </span>
          <span className="text-sm font-bold text-primary">
            {formatValue(simulacao.target)}
          </span>
        </div>
      </div>

      {/* Stake LAY calculado */}
      <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-xs text-muted-foreground block">Stake LAY necessário:</span>
            <span className="text-lg font-bold text-primary">
              {formatValue(simulacao.stakeLay)}
            </span>
          </div>
          <div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-xs text-muted-foreground flex items-center gap-1 cursor-help">
                    Custo do LAY (se GREEN):
                    <HelpCircle className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  <p>Valor adicionado ao Capital Comprometido se a Bookmaker ganhar.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="text-lg font-bold text-warning">
              {formatValue(simulacao.custoLay)}
            </span>
          </div>
        </div>
      </div>

      {/* Cenários - Grid lado a lado */}
      <div className="pt-2 border-t border-border/50">
        <p className="text-[10px] text-muted-foreground mb-2 text-center">Cenários possíveis</p>
        <div className="grid grid-cols-2 gap-3">
          {/* Coluna Esquerda - Se RED (objetivo) */}
          <div className="p-3 rounded-lg border bg-success/10 border-success/30 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-success" />
              <span className="text-sm font-medium text-success">Se RED</span>
            </div>
            
            <div className="space-y-2 flex-1">
              <div>
                <span className="text-muted-foreground block text-xs">Recuperado:</span>
                <span className="font-bold text-success">
                  {formatValue(simulacao.seRed.capitalRecuperado)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Lucro Líq.:</span>
                <span className="font-bold text-success">
                  {formatValue(simulacao.seRed.lucro, true)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">ROI:</span>
                <span className="font-bold text-success">
                  +{roi.toFixed(0)}%
                </span>
              </div>
            </div>
            
            <div className="mt-2 pt-2 border-t border-success/20 text-center">
              <span className="text-xs text-success font-medium">
                Encerra operação ✓
              </span>
            </div>
          </div>

          {/* Coluna Direita - Se GREEN (custo cresce) */}
          <div className="p-3 rounded-lg border bg-warning/10 border-warning/30 flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <ArrowUpRight className="h-4 w-4 text-warning" />
              <span className="text-sm font-medium text-warning">Se GREEN</span>
            </div>
            
            <div className="space-y-2 flex-1">
              <div>
                <span className="text-muted-foreground block text-xs">Custo LAY:</span>
                <span className="font-bold text-destructive">
                  {formatValue(simulacao.seGreen.custo)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Novo Comprometido:</span>
                <span className="font-bold text-warning">
                  {formatValue(simulacao.seGreen.novoCapitalComprometido)}
                </span>
              </div>
            </div>
            
            <div className="mt-2 pt-2 border-t border-warning/20 text-center">
              {simulacao.seGreen.proxPerna ? (
                <span className="text-xs text-warning font-medium flex items-center justify-center gap-1">
                  <ChevronRight className="h-3 w-3" />
                  Perna {simulacao.seGreen.proxPerna}
                </span>
              ) : (
                <span className="text-xs text-warning font-medium">Risco aumenta</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toggle para expandir/colapsar detalhes secundários */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="h-3 w-3" />
            Ocultar detalhes
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" />
            Ver detalhes
          </>
        )}
      </button>

      {/* Volume Operado - Apenas visível quando expandido */}
      {isExpanded && (
        <div className="pt-3 border-t border-border/50 animate-fade-in">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Vol. movimentado:</span>
            <span className="font-medium text-foreground">{formatValue(volumeExchange)}</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-muted-foreground">Exposição máx.:</span>
            <span className="font-medium text-warning">{formatValue(exposicaoMaxima)}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const SemSimulacao: React.FC<{
  capitalFinal: number;
  eficiencia: number;
  moeda: MoedaCalc;
  stakeInicial: number;
  volumeExchange: number;
  exposicaoMaxima: number;
}> = ({ capitalFinal, eficiencia, moeda, stakeInicial, volumeExchange, exposicaoMaxima }) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number) => {
    return `${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const lucroLiquido = capitalFinal - stakeInicial;
  const roi = (lucroLiquido / stakeInicial) * 100;

  return (
    <div className="rounded-lg border-2 p-4 space-y-3 bg-success/10 border-success/30">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-background/50">
          <PartyPopper className="h-5 w-5 text-success" />
        </div>
        <div>
          <h4 className="font-bold text-foreground">Operação Concluída!</h4>
          <p className="text-sm text-muted-foreground">Capital recuperado via Exchange.</p>
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t border-border/30">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Capital Inicial:</span>
          <span className="font-medium text-foreground">{formatValue(stakeInicial)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Capital Recuperado:</span>
          <span className="font-bold text-success">{formatValue(capitalFinal)}</span>
        </div>
        <div className="flex justify-between text-sm pt-2 border-t border-border/30">
          <span className="text-muted-foreground">Lucro Líquido:</span>
          <span className={cn('font-bold', lucroLiquido >= 0 ? 'text-success' : 'text-destructive')}>
            {lucroLiquido >= 0 ? '+' : ''}{formatValue(lucroLiquido)}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">ROI da Operação:</span>
          <span className={cn('font-bold', roi >= 0 ? 'text-success' : 'text-destructive')}>
            {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
          </span>
        </div>
      </div>

      {/* Volume Operado */}
      <div className="pt-3 border-t border-border/50">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Vol. movimentado:</span>
          <span className="font-medium text-foreground">{formatValue(volumeExchange)}</span>
        </div>
        <div className="flex items-center justify-between text-xs mt-1">
          <span className="text-muted-foreground">Exposição máx.:</span>
          <span className="font-medium text-warning">{formatValue(exposicaoMaxima)}</span>
        </div>
      </div>
    </div>
  );
};
