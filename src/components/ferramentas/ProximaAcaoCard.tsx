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
  motivoEncerramento: 'red' | 'green_final' | null;
  comissaoExchange?: number;
  redFinal: {
    capitalBruto: number;
    valorComissaoExchange: number;
    capitalExtraido: number;
    custosTotaisLay: number;
    resultadoLiquido: number;
    percentualExtracao: number;
    extracaoCompleta: boolean;
  } | null;
  greenFinal: {
    retornoBrutoBookmaker: number;
    custosTotaisLay: number;
    novoSaldoNaCasa: number;
    lucroLiquidoReal: number;
    percentualExtracao: number;
    houvePerda: boolean;
  } | null;
}> = ({ moeda, stakeInicial, volumeExchange, motivoEncerramento, comissaoExchange = 5, redFinal, greenFinal }) => {
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';
  
  const formatValue = (value: number, showSign = false) => {
    const prefix = showSign ? (value >= 0 ? '+' : '-') : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // GREEN FINAL - Última perna terminou GREEN na Bookmaker
  if (motivoEncerramento === 'green_final' && greenFinal) {
    return (
      <div className={cn(
        "rounded-lg border-2 p-4 space-y-3",
        greenFinal.houvePerda 
          ? "bg-destructive/10 border-destructive/30" 
          : "bg-success/10 border-success/30"
      )}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-background/50">
            <PartyPopper className={cn(
              "h-5 w-5",
              greenFinal.houvePerda ? "text-destructive" : "text-success"
            )} />
          </div>
          <div>
            <h4 className="font-bold text-foreground">Operação Finalizada</h4>
            <p className="text-sm text-muted-foreground">Bookmaker pagou - Proteção concluída</p>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-border/30">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Stake Inicial:</span>
            <span className="font-medium text-foreground">{formatValue(stakeInicial)}</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground flex items-center gap-1 cursor-help">
                    Novo Saldo na Casa:
                    <HelpCircle className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[220px] text-xs">
                  <p>Lucro bruto recebido da Bookmaker: Stake × Π(Odds) - Stake</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="font-bold text-success">{formatValue(greenFinal.novoSaldoNaCasa, true)}</span>
          </div>
          
          <div className="flex justify-between text-sm">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground flex items-center gap-1 cursor-help">
                    Custos LAY (proteções):
                    <HelpCircle className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[220px] text-xs">
                  <p>Soma de todas as responsabilidades pagas nas proteções LAY ao longo da operação.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="font-bold text-destructive">-{formatValue(greenFinal.custosTotaisLay)}</span>
          </div>
          
          <div className="flex justify-between text-sm pt-2 border-t border-border/30">
            <span className="text-foreground font-medium">Resultado Líquido:</span>
            <span className={cn('font-bold text-lg', greenFinal.lucroLiquidoReal >= 0 ? 'text-success' : 'text-destructive')}>
              {formatValue(greenFinal.lucroLiquidoReal, true)}
            </span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Extração Real:</span>
            <span className={cn('font-bold', greenFinal.percentualExtracao >= 0 ? 'text-success' : 'text-destructive')}>
              {greenFinal.percentualExtracao >= 0 ? '+' : ''}{greenFinal.percentualExtracao.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Alerta se houve perda */}
        {greenFinal.houvePerda && (
          <div className="p-3 rounded-lg bg-destructive/20 border border-destructive/30">
            <p className="text-xs text-destructive font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Juice negativo: os custos de proteção excederam o lucro da Bookmaker.
            </p>
          </div>
        )}

        {/* Volume Operado */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Vol. movimentado:</span>
            <span className="font-medium text-foreground">{formatValue(volumeExchange)}</span>
          </div>
          <div className="flex items-center justify-between text-xs mt-1">
            <span className="text-muted-foreground">Custos totais LAY:</span>
            <span className="font-medium text-warning">{formatValue(greenFinal.custosTotaisLay)}</span>
          </div>
        </div>
      </div>
    );
  }

  // RED - Extração via Exchange
  if (motivoEncerramento === 'red' && redFinal) {
    const extracaoPorcentagem = (redFinal.resultadoLiquido / stakeInicial) * 100;
    const tevePerdaNoJuice = redFinal.resultadoLiquido < stakeInicial;
    
    return (
      <div className={cn(
        "rounded-lg border-2 p-4 space-y-3",
        redFinal.resultadoLiquido >= stakeInicial 
          ? "bg-success/10 border-success/30"
          : "bg-warning/10 border-warning/30"
      )}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-full bg-background/50">
            <Check className={cn(
              "h-5 w-5",
              redFinal.resultadoLiquido >= stakeInicial ? "text-success" : "text-warning"
            )} />
          </div>
          <div>
            <h4 className="font-bold text-foreground">Extração Concluída!</h4>
            <p className="text-sm text-muted-foreground">Capital recuperado via Exchange.</p>
          </div>
        </div>

        <div className="space-y-2 pt-2 border-t border-border/30">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Stake Inicial:</span>
            <span className="font-medium text-foreground">{formatValue(stakeInicial)}</span>
          </div>
          
          {/* Capital Bruto - Exchange */}
          <div className="flex justify-between text-sm">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground flex items-center gap-1 cursor-help">
                    Capital Bruto (Exchange):
                    <HelpCircle className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[220px] text-xs">
                  <p>Stake LAY recebido quando o LAY ganhou (antes da comissão).</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="font-medium text-foreground">{formatValue(redFinal.capitalBruto)}</span>
          </div>
          
          {/* Comissão da Exchange */}
          {redFinal.valorComissaoExchange > 0 && (
            <div className="flex justify-between text-sm">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground flex items-center gap-1 cursor-help">
                      Comissão Exchange ({comissaoExchange}%):
                      <HelpCircle className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[220px] text-xs">
                    <p>Taxa cobrada pela Exchange sobre o ganho. Só paga quando ganha.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="font-bold text-destructive">-{formatValue(redFinal.valorComissaoExchange)}</span>
            </div>
          )}
          
          {/* Capital Líquido */}
          <div className="flex justify-between text-sm">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground flex items-center gap-1 cursor-help">
                    Capital Líquido (Exchange):
                    <HelpCircle className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-[220px] text-xs">
                  <p>Valor recebido após desconto da comissão da Exchange.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className="font-bold text-success">{formatValue(redFinal.capitalExtraido)}</span>
          </div>
          
          {redFinal.custosTotaisLay > 0 && (
            <div className="flex justify-between text-sm">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-muted-foreground flex items-center gap-1 cursor-help">
                      Custos LAY (proteções anteriores):
                      <HelpCircle className="h-3 w-3" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="max-w-[220px] text-xs">
                    <p>Soma das responsabilidades pagas nas pernas que deram GREEN. Sem comissão (você perdeu).</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="font-bold text-destructive">-{formatValue(redFinal.custosTotaisLay)}</span>
            </div>
          )}
          
          <div className="flex justify-between text-sm pt-2 border-t border-border/30">
            <span className="text-foreground font-medium">Resultado Líquido:</span>
            <span className={cn('font-bold text-lg', redFinal.resultadoLiquido >= stakeInicial ? 'text-success' : 'text-warning')}>
              {formatValue(redFinal.resultadoLiquido)}
            </span>
          </div>
          
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Extração Real:</span>
            <span className={cn('font-bold', extracaoPorcentagem >= 100 ? 'text-success' : 'text-warning')}>
              {extracaoPorcentagem.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Alerta se não extraiu 100% */}
        {tevePerdaNoJuice && (
          <div className="p-3 rounded-lg bg-warning/20 border border-warning/30">
            <p className="text-xs text-warning font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Extração parcial: custos de proteção reduziram o capital recuperado.
            </p>
          </div>
        )}
        
        {/* Sucesso se extraiu 100%+ */}
        {!tevePerdaNoJuice && (
          <div className="p-3 rounded-lg bg-success/20 border border-success/30">
            <p className="text-xs text-success font-medium flex items-center gap-2">
              <Check className="h-4 w-4" />
              Extração completa: capital inicial recuperado com sucesso.
            </p>
          </div>
        )}

        {/* Volume Operado */}
        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Vol. movimentado:</span>
            <span className="font-medium text-foreground">{formatValue(volumeExchange)}</span>
          </div>
          {redFinal.custosTotaisLay > 0 && (
            <div className="flex items-center justify-between text-xs mt-1">
              <span className="text-muted-foreground">Custos totais LAY:</span>
              <span className="font-medium text-warning">{formatValue(redFinal.custosTotaisLay)}</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback (não deveria acontecer)
  return (
    <div className="rounded-lg border-2 p-4 space-y-3 bg-muted/20 border-muted/30">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-full bg-background/50">
          <AlertCircle className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <h4 className="font-bold text-foreground">Operação Encerrada</h4>
          <p className="text-sm text-muted-foreground">Status não identificado.</p>
        </div>
      </div>
    </div>
  );
};
