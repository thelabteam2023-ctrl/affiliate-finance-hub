import React from 'react';
import { RotateCcw, Plus, Minus, Lock } from 'lucide-react';
import { useCalculadora, TipoAposta, MoedaCalc } from '@/contexts/CalculadoraContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { PernaTimeline } from './PernaTimeline';
import { SimulacaoAtivaCard, SemSimulacao } from './ProximaAcaoCard';

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
          {/* Header com Reiniciar */}
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" onClick={resetCalculadora} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reiniciar
            </Button>
          </div>

          {/* Barra de Configuração Compacta */}
          <div className={`px-3 py-2 rounded-lg border flex flex-wrap items-center gap-x-4 gap-y-2 ${
            temPernaConfirmada 
              ? 'bg-muted/30 border-border/50' 
              : 'bg-muted/20 border-border'
          }`}>
            {temPernaConfirmada && (
              <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}

            {/* Tipo */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-muted-foreground font-medium">Tipo</span>
              <Select 
                value={tipoAposta} 
                onValueChange={(v) => setTipoAposta(v as TipoAposta)}
                disabled={temPernaConfirmada}
              >
                <SelectTrigger className="h-7 w-[90px] text-xs px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dupla">Dupla</SelectItem>
                  <SelectItem value="tripla">Tripla</SelectItem>
                  <SelectItem value="multipla">Múltipla</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Pernas (só para múltipla) */}
            {tipoAposta === 'multipla' && !temPernaConfirmada && (
              <div className="flex items-center gap-1">
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => setNumPernas(Math.max(2, numPernas - 1))}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-4 text-center text-xs font-medium">{numPernas}</span>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6"
                  onClick={() => setNumPernas(Math.min(10, numPernas + 1))}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            )}

            <div className="h-4 w-px bg-border/50 hidden sm:block" />

            {/* Moeda */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-muted-foreground font-medium">Moeda</span>
              <Select 
                value={moeda} 
                onValueChange={(v) => setMoeda(v as MoedaCalc)}
                disabled={temPernaConfirmada}
              >
                <SelectTrigger className="h-7 w-[80px] text-xs px-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">R$ BRL</SelectItem>
                  <SelectItem value="USD">US$ USD</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="h-4 w-px bg-border/50 hidden sm:block" />

            {/* Stake */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-muted-foreground font-medium">Stake</span>
              <Input
                type="number"
                min="1"
                step="10"
                value={stakeInicial}
                onChange={(e) => setStakeInicial(parseFloat(e.target.value) || 0)}
                className="h-7 w-[70px] text-xs px-2"
                disabled={temPernaConfirmada}
              />
            </div>

            <div className="h-4 w-px bg-border/50 hidden sm:block" />

            {/* Comissão */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase text-muted-foreground font-medium">Comissão %</span>
              <Input
                type="number"
                min="0"
                max="20"
                step="0.1"
                value={comissaoExchange}
                onChange={(e) => setComissaoExchange(parseFloat(e.target.value) || 0)}
                className="h-7 w-[50px] text-xs px-2"
                disabled={temPernaConfirmada}
              />
            </div>

            <div className="h-4 w-px bg-border/50 hidden sm:block" />

            {/* Odds BACK */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] uppercase text-muted-foreground font-medium">Odds</span>
              {pernas.map((perna) => (
                <Input
                  key={perna.id}
                  type="number"
                  step="0.01"
                  min="1.01"
                  placeholder={`E${perna.id}`}
                  value={perna.oddBack}
                  onChange={(e) => updatePernaOddBack(perna.id, parseFloat(e.target.value) || 1.01)}
                  className="h-7 w-[55px] text-xs px-2"
                  disabled={temPernaConfirmada}
                  title={`Entrada ${perna.id}`}
                />
              ))}
            </div>
          </div>

          {/* Simulação Ativa - Agora ocupa largura total */}
          {(simulacao || metricas.operacaoEncerrada) && (
            <div>
              {simulacao ? (
                <SimulacaoAtivaCard
                  simulacao={simulacao}
                  moeda={moeda}
                  stakeInicial={stakeInicial}
                  volumeExchange={metricas.volumeExchange}
                  exposicaoMaxima={metricas.exposicaoMaxima}
                />
              ) : metricas.operacaoEncerrada ? (
                <SemSimulacao
                  capitalFinal={metricas.capitalFinal}
                  eficiencia={metricas.eficienciaFinal}
                  moeda={moeda}
                  stakeInicial={stakeInicial}
                  volumeExchange={metricas.volumeExchange}
                  exposicaoMaxima={metricas.exposicaoMaxima}
                  motivoEncerramento={metricas.motivoEncerramento}
                  redFinal={metricas.redFinal}
                  greenFinal={metricas.greenFinal}
                />
              ) : null}
            </div>
          )}

          <Separator />

          {/* Timeline das Pernas */}
          <PernaTimeline
            pernas={pernas}
            moeda={moeda}
            stakeInicial={stakeInicial}
            onOddBackChange={updatePernaOddBack}
            onOddLayChange={updatePernaOddLay}
            onConfirmar={confirmarPerna}
          />
        </div>
      </ScrollArea>
    </div>
  );
};
