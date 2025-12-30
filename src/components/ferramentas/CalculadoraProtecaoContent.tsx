import React from 'react';
import { RotateCcw, Plus, Minus, AlertTriangle } from 'lucide-react';
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
    updatePernaExtracao,
    confirmarPerna,
    resetCalculadora,
    getMetricasGlobais,
    getSimulacaoAtiva,
  } = useCalculadora();

  const metricas = getMetricasGlobais();
  const simulacao = getSimulacaoAtiva();
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';

  // Verificar se tem alguma perna confirmada (não pode mais editar configuração inicial)
  const temPernaConfirmada = pernas.some(p => p.status === 'green' || p.status === 'red');

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

          {/* Aviso de Risco */}
          <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-warning text-sm">Modelo de Recuperação Progressiva</p>
              <p className="text-xs text-muted-foreground mt-1">
                O risco cresce a cada GREEN. Quanto mais você ganha na bookmaker, maior o passivo a carregar.
                Cair na Exchange (RED) é o objetivo — limpa o sistema e extrai o capital.
              </p>
            </div>
          </div>

          {/* Configuração + Simulação */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Configuração Inicial */}
            <div className={`p-4 rounded-lg border space-y-3 ${
              temPernaConfirmada 
                ? 'bg-muted/20 border-border/50 opacity-80' 
                : 'bg-muted/30 border-border'
            }`}>
              <h3 className="font-semibold text-sm text-foreground">
                Configuração Inicial
                {temPernaConfirmada && <span className="text-xs text-muted-foreground ml-2">(travada)</span>}
              </h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select 
                    value={tipoAposta} 
                    onValueChange={(v) => setTipoAposta(v as TipoAposta)}
                    disabled={temPernaConfirmada}
                  >
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
                  <Select 
                    value={moeda} 
                    onValueChange={(v) => setMoeda(v as MoedaCalc)}
                    disabled={temPernaConfirmada}
                  >
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
                  <Label className="text-xs text-muted-foreground">Stake Inicial ({currencySymbol})</Label>
                  <Input
                    type="number"
                    min="1"
                    step="10"
                    value={stakeInicial}
                    onChange={(e) => setStakeInicial(parseFloat(e.target.value) || 0)}
                    className="h-9"
                    disabled={temPernaConfirmada}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Comissão (%)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="20"
                    step="0.1"
                    value={comissaoExchange}
                    onChange={(e) => setComissaoExchange(parseFloat(e.target.value) || 0)}
                    className="h-9"
                    disabled={temPernaConfirmada}
                  />
                </div>
              </div>

              {tipoAposta === 'multipla' && !temPernaConfirmada && (
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

              {/* Odds BACK por entrada */}
              <div className="pt-3 border-t border-border/50 space-y-2">
                <Label className="text-xs text-muted-foreground">Odds BACK (definidas na aposta)</Label>
                <div className="grid grid-cols-2 gap-2">
                  {pernas.map((perna) => (
                    <div key={perna.id} className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground w-16">Entrada {perna.id}:</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="1.01"
                        value={perna.oddBack}
                        onChange={(e) => updatePernaOddBack(perna.id, parseFloat(e.target.value) || 1.01)}
                        className="w-20 h-8 text-sm"
                        disabled={temPernaConfirmada}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Nota explicativa */}
              <div className="pt-2 border-t border-border/50">
                <p className="text-[10px] text-muted-foreground">
                  💡 O BACK é definido aqui e fica fixo. A odd LAY será ajustada em cada perna no momento da execução.
                </p>
              </div>
            </div>

            {/* Simulação Ativa */}
            <div>
              {simulacao ? (
                <SimulacaoAtivaCard
                  simulacao={simulacao}
                  moeda={moeda}
                  stakeInicial={stakeInicial}
                />
              ) : metricas.operacaoEncerrada ? (
                <SemSimulacao
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
            onExtracaoChange={updatePernaExtracao}
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