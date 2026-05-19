import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
   Target, Activity, TrendingUp, AlertTriangle, Shield, 
   Plus, Trash2, Info, ChevronRight, Zap, BarChart3,
   Clock, Gauge, ArrowUpRight, Timer, MousePointer2, Settings2,
   FlaskConical, HelpCircle
} from 'lucide-react';
import { 
   HedgeProbabilisticoEngine,
   type LegInput,
   type HedgeResult
} from '@/lib/hedge-probabilistico-engine';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { LiveHedgeEngine, type LiveHedgeInput, type LiveHedgeResult } from '@/lib/live-hedge-engine';
import { CardInfoTooltip } from '@/components/ui/card-info-tooltip';

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

export const CalculadoraHedgeProbabilisticaContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('calculadora');
  const [showHelp, setShowHelp] = useState(false);
  const [freebet, setFreebet] = useState(100);
  const [commission, setCommission] = useState(2.8);
  const [efficiency, setEfficiency] = useState(0.8);
  const [legs, setLegs] = useState<LegInput[]>([
    { name: 'Evento 1', backOdd: 2.0, layOdd: 2.0 },
    { name: 'Evento 2', backOdd: 2.0, layOdd: 2.0 }
  ]);

  const [liveInput, setLiveInput] = useState<LiveHedgeInput>({
    layOdd: 3.00,
    backOddActual: 2.70,
    backOddProjected: 3.00,
     backStake: 100, // Valor da Freebet
     backOddProjected: 3.00, // Odd do Back
     layOdd: 2.80, // Odd do Lay
     backOddActual: 2.70,
     commission: 2.8,
     alreadyLaidStake: 0
  });

  const liveResults = useMemo(() => LiveHedgeEngine.calculate(liveInput), [liveInput]);

  const metrics: HedgeResult = useMemo(() => {
    return HedgeProbabilisticoEngine.calculateMetrics(
      legs, 
      freebet, 
      commission / 100, 
      efficiency
    );
  }, [legs, freebet, commission, efficiency]);

  const addLeg = () => {
    if (legs.length >= 5) return;
    setLegs([...legs, { name: `Evento ${legs.length + 1}`, backOdd: 2.0, layOdd: 2.0 }]);
  };

  const removeLeg = (index: number) => {
    if (legs.length <= 1) return;
    setLegs(legs.filter((_, i) => i !== index));
  };

  const updateLeg = (index: number, field: keyof LegInput, value: any) => {
    const newLegs = [...legs];
    newLegs[index] = { ...newLegs[index], [field]: value };
    setLegs(newLegs);
  };

  const scoreColor = {
    excellent: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    good: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    risky: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    critical: 'bg-red-500/15 text-red-400 border-red-500/30'
  }[metrics.score];

  const scoreLabel = {
    excellent: 'Excelente',
    good: 'Boa',
    risky: 'Arriscada',
    critical: 'Crítica'
  }[metrics.score];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Zap className="h-6 w-6 text-primary" />
                Calculadora de Hedge Probabilístico
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Motor quantitativo para extração de freebets com análise de risco e cascata.
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge className={`px-4 py-1 text-sm border ${scoreColor}`}>
              Score: {scoreLabel}
            </Badge>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
              <TabsList className="grid grid-cols-3 h-9 w-[420px]">
                <TabsTrigger value="calculadora" className="text-xs gap-2">
                  <Activity className="h-3.5 w-3.5" /> Calculadora
                </TabsTrigger>
                <TabsTrigger value="laboratorio" className="text-xs gap-2">
                  <FlaskConical className="h-3.5 w-3.5" /> Laboratório
                </TabsTrigger>
                <TabsTrigger value="live" className="text-xs gap-2">
                  <Clock className="h-3.5 w-3.5" /> Calculadora Live
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <div className="space-y-6">
          {activeTab === 'calculadora' ? (
            <>

        {/* KPIs Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Target className="h-3 w-3" /> EV Esperado
              </div>
              <div className="text-xl font-bold text-emerald-400">R$ {fmt(metrics.totalEV)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Valor médio probabilístico</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> ROI Final
              </div>
              <div className="text-xl font-bold text-blue-400">{fmtPct(metrics.totalROI)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Eficiência real da operação</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Risco Máximo
              </div>
              <div className="text-xl font-bold text-red-400">R$ {fmt(metrics.maxResponsibility)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Exposição na exchange</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Shield className="h-3 w-3" /> Capital Mínimo
              </div>
              <div className="text-xl font-bold text-primary">R$ {fmt(metrics.capitalRequired)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Necessidade de caixa</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Inputs Panel */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="h-4 w-4" /> Configurações Globais
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">Valor da Freebet (R$)</Label>
                    <span className="text-xs font-mono text-primary">R$ {freebet}</span>
                  </div>
                  <Input 
                    type="number" 
                    value={freebet} 
                    onChange={(e) => setFreebet(Number(e.target.value))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs">Comissão Exchange (%)</Label>
                    <span className="text-xs font-mono text-primary">{commission}%</span>
                  </div>
                  <Input 
                    type="number" 
                    step="0.1"
                    value={commission} 
                    onChange={(e) => setCommission(Number(e.target.value))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-4 pt-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs flex items-center gap-1">
                      Eficiência Operacional
                      <CardInfoTooltip title="Eficiência" description="Ajuste fino de quanto do lucro você quer extrair. 100% maximiza o EV mas pode aumentar a responsabilidade." />
                    </Label>
                    <span className="text-xs font-mono text-primary">{Math.round(efficiency * 100)}%</span>
                  </div>
                  <Slider 
                    value={[efficiency * 100]} 
                    min={70} 
                    max={100} 
                    step={1} 
                    onValueChange={(val) => setEfficiency(val[0] / 100)}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Seguro (70%)</span>
                    <span>Agressivo (100%)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Resumo do Risco
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Drawdown Probabilístico</span>
                  <span className="font-mono text-red-400">-R$ {fmt(metrics.maxDrawdown)}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground">Probabilidade de Sucesso Total</span>
                  <span className="font-mono text-emerald-400">
                    {fmtPct((metrics.scenarios.find(s => !s.path.includes('lost'))?.probability || 0) * 100)}
                  </span>
                </div>
                <div className="pt-2 border-t border-border mt-2">
                  <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                    * O capital mínimo necessário considera a maior responsabilidade individual exigida em qualquer perna da exchange.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Legs Panel */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-medium">Pernas da Operação (Máx 5)</CardTitle>
                <Button variant="outline" size="sm" onClick={addLeg} disabled={legs.length >= 5} className="h-8 gap-1">
                  <Plus className="h-3 w-3" /> Adicionar Perna
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Evento</TableHead>
                      <TableHead>Odd Back</TableHead>
                      <TableHead>Odd Lay</TableHead>
                      <TableHead className="text-right">Lay Stake</TableHead>
                      <TableHead className="text-right">Respons.</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {legs.map((leg, index) => {
                      const calcLeg = metrics.legs[index];
                      return (
                        <TableRow key={index}>
                          <TableCell className="font-medium">
                            <Input 
                              value={leg.name} 
                              onChange={(e) => updateLeg(index, 'name', e.target.value)}
                              className="h-8 text-xs"
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number"
                              value={leg.backOdd} 
                              onChange={(e) => updateLeg(index, 'backOdd', Number(e.target.value))}
                              className="h-8 text-xs font-mono w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number"
                              value={leg.layOdd} 
                              onChange={(e) => updateLeg(index, 'layOdd', Number(e.target.value))}
                              className="h-8 text-xs font-mono w-20"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-blue-400">
                            R$ {fmt(calcLeg.layStake)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-400">
                            R$ {fmt(calcLeg.responsibility)}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8 text-muted-foreground hover:text-red-400"
                              onClick={() => removeLeg(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Distribuição Probabilística de Cenários</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {metrics.scenarios
                    .sort((a, b) => b.probability - a.probability)
                    .map((scenario, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 border border-border/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Cenário {idx + 1}</span>
                          <span className="text-xs font-medium truncate">{scenario.description}</span>
                        </div>
                        <div className="flex gap-4">
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground uppercase">Probabilidade</span>
                            <span className="text-xs font-mono text-primary">{fmtPct(scenario.probability * 100)}</span>
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-muted-foreground uppercase">Resultado Final</span>
                            <span className={`text-xs font-mono ${scenario.result >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              R$ {fmt(scenario.result)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${scenario.result >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} 
                          style={{ width: `${scenario.probability * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            </div>
          </div>
            </>
          ) : activeTab === 'laboratorio' ? (
            <div className="space-y-6 animate-in fade-in duration-500">
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-primary" /> 
                    Módulo Laboratório (Em Desenvolvimento)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="p-12 text-center space-y-4">
                    <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                      <Settings2 className="h-8 w-8 text-primary animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold">Refatoração em Andamento</h3>
                      <p className="text-sm text-muted-foreground max-w-md mx-auto mt-2">
                        Estamos reconstruindo o Laboratório para integrar o novo motor de análise probabilística 
                        e a Biblioteca de Ouro dinâmica.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setActiveTab('calculadora')}>
                      Voltar para Calculadora
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-primary/10 border-primary/20">
                  <CardContent className="pt-4 flex flex-col items-center text-center">
                    <div className="text-xs text-primary mb-1 flex items-center gap-1 uppercase font-bold tracking-tighter">
                      <Target className="h-4 w-4" /> Proteção Recomendada
                    </div>
                    <div className="text-3xl font-black text-primary font-mono">
                      R$ {fmt(liveResults.recommendedLayStake)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">Apostar este valor no LAY agora</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="pt-4 flex flex-col items-center text-center">
                    <div className="text-xs text-red-400 mb-1 flex items-center gap-1 uppercase font-bold tracking-tighter">
                      <AlertTriangle className="h-3 w-3" /> Responsabilidade
                    </div>
                    <div className="text-2xl font-bold text-red-400 font-mono">
                      R$ {fmt(liveResults.liability)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">Exposição total na Exchange</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="pt-4 flex flex-col items-center text-center">
                    <div className="text-xs text-emerald-400 mb-1 flex items-center gap-1 uppercase font-bold tracking-tighter">
                      <TrendingUp className="h-3 w-3" /> Lucro Garantido
                    </div>
                    <div className="text-2xl font-bold text-emerald-400 font-mono">
                      R$ {fmt(liveResults.expectedProfit)}
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">Extração: {fmtPct(liveResults.roi)}</div>
                  </CardContent>
                </Card>
                <Card className="bg-muted/30">
                  <CardContent className="pt-4 flex flex-col items-center text-center">
                    <div className="text-xs text-blue-400 mb-1 flex items-center gap-1 uppercase font-bold tracking-tighter">
                      <Info className="h-3 w-3" /> Spread Atual
                    </div>
                    <div className="text-2xl font-bold text-blue-400 font-mono">
                      {liveResults.currentSpread.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">Gap entre Back e Lay</div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                  <Card className="border-primary/20">
                    <CardHeader className="pb-3 bg-primary/5">
                      <CardTitle className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
                        <Settings2 className="h-4 w-4 text-primary" /> Parâmetros Operacionais
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-5 pt-5">
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-primary">Valor da Freebet (R$)</Label>
                          <Input 
                            type="number" 
                            value={liveInput.backStake} 
                            onChange={(e) => setLiveInput({...liveInput, backStake: Number(e.target.value)})}
                            className="h-10 font-mono"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-emerald-400">Odd que Você Pegou (Back)</Label>
                            <Input 
                              type="number" 
                              value={liveInput.backOddProjected} 
                              onChange={(e) => setLiveInput({...liveInput, backOddProjected: Number(e.target.value)})}
                              className="h-10 font-mono border-emerald-500/20"
                              step="0.01"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-red-400">Odd Atual da Exchange (Lay)</Label>
                            <Input 
                              type="number" 
                              value={liveInput.layOdd} 
                              onChange={(e) => setLiveInput({...liveInput, layOdd: Number(e.target.value)})}
                              className="h-10 font-mono border-red-500/20"
                              step="0.01"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Comissão Exchange (%)</Label>
                            <Input 
                              type="number" 
                              value={liveInput.commission} 
                              onChange={(e) => setLiveInput({...liveInput, commission: Number(e.target.value)})}
                              className="h-8 font-mono"
                              step="0.1"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Já Coberto em Lay (R$)</Label>
                            <Input 
                              type="number" 
                              value={liveInput.alreadyLaidStake || 0} 
                              onChange={(e) => setLiveInput({...liveInput, alreadyLaidStake: Number(e.target.value)})}
                              className="h-8 font-mono opacity-80"
                              step="1"
                            />
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="lg:col-span-2 space-y-6">
                  <Card className="bg-primary/5 border-primary/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <HelpCircle className="h-4 w-4 text-primary" /> Como usar este exemplo (Freebet de R$ 100)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="p-3 rounded-md bg-background/50 border border-border">
                          <p className="font-bold text-primary mb-1">Passo 1: Entrada</p>
                          <p className="text-muted-foreground leading-relaxed">
                            Você recebeu uma <strong>Freebet de R$ 100</strong>. Escolha um evento com Odd Back alta (ex: 3.00) e faça a aposta.
                          </p>
                        </div>
                        <div className="p-3 rounded-md bg-background/50 border border-border">
                          <p className="font-bold text-primary mb-1">Passo 2: Proteção</p>
                          <p className="text-muted-foreground leading-relaxed">
                            Vá na Exchange e veja a <strong>Odd Lay</strong>. Se estiver 2.80, insira aqui. A calculadora dirá para você fazer um Lay de <strong>R$ {fmt(liveResults.recommendedLayStake)}</strong>.
                          </p>
                        </div>
                      </div>
                      <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <p className="text-sm font-bold text-emerald-400 mb-2">Resultado da Operação:</p>
                        <div className="flex justify-between items-center text-xs">
                          <span>Se o seu time <strong>Ganhar</strong> (Back):</span>
                          <span className="font-mono font-bold text-emerald-400">R$ {fmt(liveResults.expectedProfit)} líquido</span>
                        </div>
                        <div className="flex justify-between items-center text-xs mt-1">
                          <span>Se o seu time <strong>Perder/Empatar</strong> (Lay):</span>
                          <span className="font-mono font-bold text-emerald-400">R$ {fmt(liveResults.expectedProfit)} líquido</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-3 italic">
                          * O lucro é garantido e "travado" no momento que você executa o Lay recomendado, independente do que aconteça no jogo.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
};
