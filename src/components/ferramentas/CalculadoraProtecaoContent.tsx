import React from 'react';
import { RotateCcw, Plus, Minus } from 'lucide-react';
import { useCalculadora, TipoAposta, MoedaCalc } from '@/contexts/CalculadoraContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { PernaTimeline } from './PernaTimeline';
import { MetricasGlobaisCard } from './MetricasGlobaisCard';
import { SimulacaoAtivaCard, SemSimulacao } from './ProximaAcaoCard';
import { GuiaProtecao } from './GuiaProtecao';

export const CalculadoraProtecaoContent: React.FC = () => {
  const {
    tipoAposta,
    stakeInicial,
    comissaoExchange,
    moeda,
    pernas,
    numPernas,
    setTipoAposta,
    setStakeInicial,
    setComissaoExchange,
    setMoeda,
    setNumPernas,
    updatePernaOddBack,
    updatePernaOddLay,
    updatePernaStakeLay,
    confirmarPerna,
    resetCalculadora,
    getMetricasGlobais,
    getSimulacaoAtiva,
  } = useCalculadora();

  const metricas = getMetricasGlobais();
  const simulacao = getSimulacaoAtiva();
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <GuiaProtecao />
            <Button variant="outline" size="sm" onClick={resetCalculadora} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reiniciar
            </Button>
          </div>

          {/* Configuração + Simulação */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Configuração Inicial */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
              <h3 className="font-semibold text-sm text-foreground">Configuração Inicial</h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={tipoAposta} onValueChange={(v) => setTipoAposta(v as TipoAposta)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dupla">Dupla</SelectItem>
                      <SelectItem value="tripla">Tripla</SelectItem>
                      <SelectItem value="multipla">Múltipla</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Moeda</Label>
                  <Select value={moeda} onValueChange={(v) => setMoeda(v as MoedaCalc)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BRL">R$ (BRL)</SelectItem>
                      <SelectItem value="USD">US$ (USD)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Stake ({currencySymbol})</Label>
                  <Input
                    type="number"
                    min="1"
                    step="10"
                    value={stakeInicial}
                    onChange={(e) => setStakeInicial(parseFloat(e.target.value) || 0)}
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Comissão (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="20"
                    step="0.5"
                    value={comissaoExchange}
                    onChange={(e) => setComissaoExchange(parseFloat(e.target.value) || 0)}
                    className="h-9"
                  />
                </div>
              </div>

              {tipoAposta === 'multipla' && (
                <div className="flex items-center gap-3 pt-1">
                  <Label className="text-xs text-muted-foreground">Pernas:</Label>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => setNumPernas(Math.max(2, numPernas - 1))}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center font-medium text-sm">{numPernas}</span>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => setNumPernas(Math.min(10, numPernas + 1))}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Nota explicativa */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground">
                  💡 Defina as odds e stake LAY para cada perna. A calculadora simula os resultados para cada cenário (GREEN ou RED).
                </p>
              </div>
            </div>

            {/* Simulação */}
            <div>
              {simulacao ? (
                <SimulacaoAtivaCard
                  simulacao={simulacao}
                  moeda={moeda}
                  stakeInicial={stakeInicial}
                />
              ) : metricas.operacaoEncerrada ? (
                <SemSimulacao
                  motivo={metricas.motivoEncerramento || 'todas_green'}
                  capitalFinal={metricas.capitalFinal}
                  eficiencia={metricas.eficienciaFinal}
                  moeda={moeda}
                  stakeInicial={stakeInicial}
                />
              ) : null}
            </div>
          </div>

          <Separator />

          {/* Timeline das Pernas */}
          <PernaTimeline
            pernas={pernas}
            moeda={moeda}
            stakeInicial={stakeInicial}
            onOddBackChange={updatePernaOddBack}
            onOddLayChange={updatePernaOddLay}
            onStakeLayChange={updatePernaStakeLay}
            onConfirmar={confirmarPerna}
          />

          <Separator />

          {/* Métricas Globais */}
          <MetricasGlobaisCard metricas={metricas} moeda={moeda} />
        </div>
      </ScrollArea>
    </div>
  );
};
