import React from 'react';
import { RotateCcw, Plus, Minus } from 'lucide-react';
import { useCalculadora, TipoAposta, ObjetivoAposta, MoedaCalc } from '@/contexts/CalculadoraContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ProtecaoPernaCard } from './ProtecaoPernaCard';
import { JuiceBar } from './JuiceBar';
import { AcaoRecomendada, SemAcaoRecomendada } from './AcaoRecomendada';
import { GuiaProtecao } from './GuiaProtecao';

export const CalculadoraProtecaoContent: React.FC = () => {
  const {
    tipoAposta,
    objetivo,
    stakeInicial,
    comissaoExchange,
    moeda,
    pernas,
    numPernas,
    setTipoAposta,
    setObjetivo,
    setStakeInicial,
    setComissaoExchange,
    setMoeda,
    setNumPernas,
    updatePernaOdd,
    setPernaStatus,
    resetCalculadora,
    getJuiceData,
    getAcaoRecomendada,
  } = useCalculadora();

  const juiceData = getJuiceData();
  const acaoRecomendada = getAcaoRecomendada();
  const algumRed = pernas.some(p => p.status === 'red');
  const todasProcessadas = pernas.every(p => p.status !== 'pendente');
  const currencySymbol = moeda === 'BRL' ? 'R$' : 'US$';

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Header com ações */}
          <div className="flex items-center justify-between">
            <GuiaProtecao />
            <Button variant="outline" size="sm" onClick={resetCalculadora} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reiniciar
            </Button>
          </div>

          {/* Cards lado a lado: Configuração + Objetivo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1 — Configuração Inicial */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
              <h3 className="font-semibold text-sm text-foreground">Configuração Inicial</h3>
              
              <div className="grid grid-cols-2 gap-3">
                {/* Tipo de Aposta */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <Select value={tipoAposta} onValueChange={(v) => setTipoAposta(v as TipoAposta)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simples">Simples</SelectItem>
                      <SelectItem value="dupla">Dupla</SelectItem>
                      <SelectItem value="tripla">Tripla</SelectItem>
                      <SelectItem value="personalizado">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Moeda */}
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

                {/* Stake Inicial */}
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

                {/* Comissão Exchange */}
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

              {/* Número de pernas (personalizado) */}
              {tipoAposta === 'personalizado' && (
                <div className="flex items-center gap-3 pt-1">
                  <Label className="text-xs text-muted-foreground">Pernas:</Label>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => setNumPernas(Math.max(1, numPernas - 1))}
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
            </div>

            {/* Card 2 — Objetivo */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
              <h3 className="font-semibold text-sm text-foreground">Objetivo da Proteção</h3>
              <RadioGroup 
                value={objetivo} 
                onValueChange={(v) => setObjetivo(v as ObjetivoAposta)}
                className="space-y-1"
              >
                <div className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="perder_casa" id="perder_casa" />
                  <Label htmlFor="perder_casa" className="text-sm cursor-pointer flex-1">
                    Perder na casa
                    <span className="block text-xs text-muted-foreground font-normal">Extração de bônus</span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="limitar_lucro" id="limitar_lucro" />
                  <Label htmlFor="limitar_lucro" className="text-sm cursor-pointer flex-1">
                    Limitar lucro
                    <span className="block text-xs text-muted-foreground font-normal">Trava resultado máximo</span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 p-2 rounded hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="neutralizar_greens" id="neutralizar_greens" />
                  <Label htmlFor="neutralizar_greens" className="text-sm cursor-pointer flex-1">
                    Neutralizar greens
                    <span className="block text-xs text-muted-foreground font-normal">Anular ganhos inesperados</span>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          <Separator />

          {/* Timeline das pernas */}
          <div className="space-y-3">
            <h3 className="font-semibold text-sm text-foreground">Progressão das Entradas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {pernas.map((perna, index) => {
                const pernaAnteriorRed = pernas.slice(0, index).some(p => p.status === 'red');
                return (
                  <ProtecaoPernaCard
                    key={perna.id}
                    perna={perna}
                    moeda={moeda}
                    onOddChange={(odd) => updatePernaOdd(perna.id, odd)}
                    onStatusChange={(status) => setPernaStatus(perna.id, status)}
                    disabled={pernaAnteriorRed}
                  />
                );
              })}
            </div>
          </div>

          <Separator />

          {/* JuiceBar */}
          <JuiceBar data={juiceData} moeda={moeda} />

          {/* Ação Recomendada */}
          {acaoRecomendada ? (
            <AcaoRecomendada
              valorLay={acaoRecomendada.valorLay}
              oddMinima={acaoRecomendada.oddMinima}
              resultadoSeGanhar={acaoRecomendada.resultadoSeGanhar}
              resultadoSePerder={acaoRecomendada.resultadoSePerder}
              pernaAtual={acaoRecomendada.pernaAtual}
              moeda={moeda}
            />
          ) : algumRed ? (
            <SemAcaoRecomendada motivo="red" />
          ) : todasProcessadas ? (
            <SemAcaoRecomendada motivo="concluido" />
          ) : null}
        </div>
      </ScrollArea>
    </div>
  );
};
