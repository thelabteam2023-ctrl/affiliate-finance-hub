import React from 'react';
import { Clock, Check, Lock, ChevronRight, Target, Wallet, ArrowUpRight, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PernaAposta, StatusPerna, MoedaCalc } from '@/contexts/CalculadoraContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ExtracaoSlider } from './ExtracaoSlider';

interface PernaTimelineProps {
  pernas: PernaAposta[];
  moeda: MoedaCalc;
  stakeInicial: number;
  onOddBackChange: (id: number, odd: number) => void;
  onOddLayChange: (id: number, odd: number) => void;
  onExtracaoChange: (id: number, percentual: number) => void;
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
    label: 'RED (Recuperado!)',
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
  
  // REGRAS DE EDIÇÃO SIMPLIFICADAS:
  // - BACK: sempre read-only (definido na configuração inicial)
  // - LAY: editável APENAS na perna ativa
  // - Extração: editável APENAS na perna ativa
  const isAtiva = perna.status === 'ativa';
  const canEditLay = isAtiva;
  const canEditExtracao = isAtiva;
  const canConfirm = isAtiva;
  
  const formatValue = (value: number, showSign = false) => {
    const prefix = showSign ? (value >= 0 ? '+' : '') : '';
    return `${prefix}${currencySymbol} ${Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className={cn(
      'rounded-lg border-2 p-3 transition-all w-full max-w-[315px] flex-shrink-0',
      config.bg,
      config.border,
      perna.status === 'travada' && 'opacity-50',
      perna.status === 'aguardando' && 'opacity-70'
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

      {/* Inputs: BACK (read-only) + LAY + Extração */}
      <div className="space-y-2 mb-3">
        {/* BACK - Sempre read-only */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-16">Back:</Label>
          <Input
            type="number"
            step="0.01"
            min="1.01"
            value={perna.oddBack}
            onChange={(e) => onOddBackChange(parseFloat(e.target.value) || 1.01)}
            className="w-20 h-8 text-sm bg-muted/50"
            disabled={true}
          />
          <span className="text-[10px] text-muted-foreground">(fixo)</span>
        </div>
        
        {/* LAY - Editável apenas na perna ativa */}
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground w-16">Lay:</Label>
          <Input
            type="number"
            step="0.01"
            min="1.01"
            value={perna.oddLay}
            onChange={(e) => onOddLayChange(parseFloat(e.target.value) || 1.01)}
            className={cn(
              'w-20 h-8 text-sm',
              canEditLay ? 'bg-background border-primary/50' : 'bg-muted/50'
            )}
            disabled={!canEditLay}
          />
          {!canEditLay && perna.status === 'aguardando' && (
            <span className="text-[10px] text-muted-foreground">(aguardando)</span>
          )}
        </div>
        
        {/* Extração Percentual - Input simples para pernas não ativas */}
        {!canEditExtracao && (
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground w-16">Extração:</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                step="10"
                min="0"
                max="100"
                value={perna.percentualExtracao}
                onChange={(e) => onExtracaoChange(parseFloat(e.target.value) || 0)}
                className="w-16 h-8 text-sm bg-muted/50"
                disabled={true}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
          </div>
        )}
      </div>

      {/* Slider de Extração Percentual - Aparece apenas na perna ativa */}
      {canEditExtracao && (
        <ExtracaoSlider
          passivoAtual={perna.passivoAtual}
          percentualExtracao={perna.percentualExtracao}
          oddLay={perna.oddLay}
          comissao={0.05} // 5% comissão padrão
          moeda={moeda}
          onExtracaoChange={onExtracaoChange}
        />
      )}

      {/* Stake LAY calculado automaticamente */}
      <div className="mb-3 p-2 rounded bg-primary/10 border border-primary/30">
        <div className="flex justify-between text-xs">
          <span className="text-muted-foreground">Stake LAY necessário:</span>
          <span className="font-bold text-primary">{formatValue(perna.stakeLayNecessario)}</span>
        </div>
        <div className="flex justify-between text-xs mt-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground flex items-center gap-1 cursor-help">
                  Resp. LAY (Risco Máx.):
                  <HelpCircle className="h-3 w-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px] text-xs">
                <p>Risco máximo assumido nesta perna caso o evento ganhe na Bookmaker. Não representa o prejuízo final.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <span className="font-bold text-warning">{formatValue(perna.responsabilidade)}</span>
        </div>
      </div>

      {/* Botões de confirmação - só aparecem na perna ativa */}
      {canConfirm && (
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

      {/* Cenários da Perna - Grid lado a lado */}
      {isAtiva && (
        <div className="pt-2 border-t border-border/30">
          <p className="text-[10px] text-muted-foreground mb-2 text-center">Cenários possíveis</p>
          <div className="grid grid-cols-2 gap-2">
            {/* Coluna Esquerda - Se RED (objetivo) */}
            <div className="p-2 rounded bg-success/10 border border-success/30 flex flex-col">
              <div className="flex items-center gap-1 text-success text-xs font-medium mb-2">
                <Check className="h-3 w-3" />
                Se RED
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Recuperado:</span>
                  <span className="font-bold text-success">
                    {formatValue(perna.capitalExtraidoSeRed)}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Lucro Líq.:</span>
                  <span className="font-bold text-success">
                    {formatValue(perna.capitalExtraidoSeRed - stakeInicial, true)}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">ROI:</span>
                  <span className="font-bold text-success">
                    +{(((perna.capitalExtraidoSeRed - stakeInicial) / stakeInicial) * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-1 border-t border-success/20 text-center">
                <span className="text-[9px] text-success font-medium">Passivo zerado ✓</span>
              </div>
            </div>

            {/* Coluna Direita - Se GREEN (passivo cresce) */}
            <div className="p-2 rounded bg-warning/10 border border-warning/30 flex flex-col">
              <div className="flex items-center gap-1 text-warning text-xs font-medium mb-2">
                <ArrowUpRight className="h-3 w-3" />
                Se GREEN
              </div>
              <div className="space-y-1 flex-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">
                    {perna.resultadoSeGreen < 0 ? 'Prejuízo:' : 'Resultado:'}
                  </span>
                  <span className={cn(
                    'font-bold',
                    perna.resultadoSeGreen < 0 ? 'text-destructive' : 'text-success'
                  )}>
                    {formatValue(perna.resultadoSeGreen, true)}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Novo passivo:</span>
                  <span className="font-bold text-warning">
                    {formatValue(perna.novoPassivoSeGreen)}
                  </span>
                </div>
              </div>
              <div className="mt-2 pt-1 border-t border-warning/20 text-center">
                <span className="text-[9px] text-warning font-medium">→ Próxima perna</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Resultado confirmado GREEN - resultado normalmente é NEGATIVO (prejuízo) */}
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
              <span className="text-muted-foreground">
                {perna.resultadoSeGreen < 0 ? 'Prejuízo da perna:' : 'Resultado:'}
              </span>
              <span className={cn(
                'font-bold',
                perna.resultadoSeGreen < 0 ? 'text-destructive' : 'text-success'
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
              <span className="text-muted-foreground">Capital Inicial:</span>
              <span className="font-medium text-foreground">{formatValue(stakeInicial)}</span>
            </div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Capital Recuperado (via Exchange):</span>
              <span className="font-medium text-success">{formatValue(perna.capitalExtraidoSeRed)}</span>
            </div>
            <div className="flex justify-between text-xs mb-1 pt-1 border-t border-success/20">
              <span className="text-muted-foreground">Lucro Líquido Real:</span>
              <span className="font-bold text-success">{formatValue(perna.capitalExtraidoSeRed - stakeInicial, true)}</span>
            </div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">ROI:</span>
              <span className="font-bold text-success">+{(((perna.capitalExtraidoSeRed - stakeInicial) / stakeInicial) * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between text-xs pt-1 border-t border-success/20">
              <span className="text-muted-foreground">Passivo:</span>
              <span className="font-bold text-success">Zerado ✓</span>
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
      
      <p className="text-xs text-muted-foreground">
        O BACK já está definido. Ajuste a odd LAY e extração apenas na perna ativa.
      </p>
      
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