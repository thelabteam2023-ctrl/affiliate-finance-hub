import React, { useState, useMemo, useEffect } from 'react';
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
  Plus, Trash2, Info, ChevronRight, Zap, BarChart3, HelpCircle, Link2,
  CheckCircle2, Lightbulb, BookOpen, FlaskConical, BrainCircuit,
  ShieldAlert, Coins, Sparkles, Wand2, Dna, LineChart, History,
  Trophy, Star, ArrowRight, RefreshCcw, GripVertical, GripHorizontal,
  Sliders, Settings2, ShieldCheck, ZapOff, Infinity as InfinityIcon,
  Clock, Gauge, ArrowUpRight, Timer, MousePointer2
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  HedgeProbabilisticoEngine,
  type LegInput,
  type HedgeResult,
  type AggregatedScenario
} from '@/lib/hedge-probabilistico-engine';
import { LiveHedgeEngine, type LiveHedgeInput, type LiveHedgeResult } from '@/lib/live-hedge-engine';
import { CardInfoTooltip } from '@/components/ui/card-info-tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

export const CalculadoraHedgeProbabilisticaContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('calculadora');
  const [freebet, setFreebet] = useState(100);
  const [targetExtraction, setTargetExtraction] = useState(0.7);
  const [commission, setCommission] = useState(0.02);
  const [legs, setLegs] = useState<LegInput[]>([
    { name: 'Evento 1', backOdd: 2.0, layOdd: 2.1 },
    { name: 'Evento 2', backOdd: 2.0, layOdd: 2.1 }
  ]);
  const [expanded, setExpanded] = useState<AggregatedScenario | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // Live State
  const [liveInput, setLiveInput] = useState<LiveHedgeInput>({
    layOdd: 3.0,
    backOddActual: 2.7,
    backOddProjected: 3.0,
    backStake: 100,
    commission: 2
  });

  const metrics = useMemo(() => {
    return HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, commission, targetExtraction);
  }, [legs, freebet, commission, targetExtraction]);

  const liveResults = useMemo(() => {
    return LiveHedgeEngine.calculate(liveInput);
  }, [liveInput]);

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
          <div className="flex-1">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              Calculadora de Hedge Probabilístico
            </h1>
          </div>
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

        <div className="space-y-6">
          {activeTab === 'calculadora' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Odd Total</div><div className="text-xl font-bold text-white">{metrics.totalBackOdd.toFixed(2)}</div></CardContent></Card>
                <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Target className="h-3 w-3" /> EV</div><div className="text-xl font-bold text-emerald-400">R$ {fmt(metrics.totalEV)}</div></CardContent></Card>
                <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Extração</div><div className="text-xl font-bold text-blue-400">{fmtPct(metrics.totalROI)}</div></CardContent></Card>
                <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Risco</div><div className="text-xl font-bold text-red-400">R$ {fmt(metrics.maxDrawdown)}</div></CardContent></Card>
                <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Shield className="h-3 w-3" /> Exposição</div><div className="text-xl font-bold text-orange-400">R$ {fmt(metrics.maxResponsibility)}</div></CardContent></Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-1">
                  <CardHeader><CardTitle className="text-sm">Configurações</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>Valor da Freebet (R$)</Label>
                      <Input type="number" value={freebet} onChange={(e) => setFreebet(Number(e.target.value))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Meta de Extração ({fmtPct(targetExtraction * 100)})</Label>
                      <Slider value={[targetExtraction * 100]} min={10} max={100} step={1} onValueChange={(v) => setTargetExtraction(v[0] / 100)} />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="md:col-span-2">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-sm">Pernas do Hedge</CardTitle>
                    <Button variant="outline" size="sm" onClick={() => setLegs([...legs, { name: `Evento ${legs.length + 1}`, backOdd: 2.0, layOdd: 2.1 }])}>
                      <Plus className="h-4 w-4 mr-1" /> Adicionar
                    </Button>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Evento</TableHead>
                          <TableHead>Back Odd</TableHead>
                          <TableHead>Lay Odd</TableHead>
                          <TableHead>Lay Stake</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metrics.legs.map((leg, i) => (
                          <TableRow key={i}>
                            <TableCell>{legs[i].name}</TableCell>
                            <TableCell>
                              <Input className="h-8 w-20" type="number" value={legs[i].backOdd} onChange={(e) => {
                                const newLegs = [...legs];
                                newLegs[i].backOdd = Number(e.target.value);
                                setLegs(newLegs);
                              }} />
                            </TableCell>
                            <TableCell>
                              <Input className="h-8 w-20" type="number" value={legs[i].layOdd} onChange={(e) => {
                                const newLegs = [...legs];
                                newLegs[i].layOdd = Number(e.target.value);
                                setLegs(newLegs);
                              }} />
                            </TableCell>
                            <TableCell className="font-mono text-primary">R$ {fmt(leg.layStake)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {activeTab === 'laboratorio' && (
             <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
               <div className="lg:col-span-4 xl:col-span-3 space-y-6">
                  <Card><CardHeader><CardTitle className="text-sm">Biblioteca Dinâmica</CardTitle></CardHeader>
                  <CardContent><p className="text-xs text-muted-foreground">Regras operacionais de odds dinâmicas configuradas.</p></CardContent></Card>
               </div>
               <div className="lg:col-span-8 xl:col-span-9 space-y-6">
                 <Card><CardHeader><CardTitle className="text-sm">Workspace de Análise</CardTitle></CardHeader>
                 <CardContent>
                    <div className="h-[300px] w-full bg-muted/20 rounded-md flex items-center justify-center">
                      <AreaChart width={600} height={250} data={metrics.aggregatedScenarios}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="description" />
                        <YAxis />
                        <RechartsTooltip />
                        <Area type="monotone" dataKey="result" stroke="#8884d8" fill="#8884d8" />
                      </AreaChart>
                    </div>
                 </CardContent></Card>
               </div>
             </div>
          )}

          {activeTab === 'live' && (
            <div className="space-y-6">
               <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="bg-primary/5 border-primary/20"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground uppercase font-bold">Proteção</div><div className="text-2xl font-bold text-primary">R$ {fmt(liveResults.recommendedLayStake)}</div></CardContent></Card>
                  <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground uppercase font-bold text-red-400">Responsabilidade</div><div className="text-2xl font-bold text-red-400">R$ {fmt(liveResults.liability)}</div></CardContent></Card>
                  <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground uppercase font-bold text-emerald-400">Lucro</div><div className="text-2xl font-bold text-emerald-400">R$ {fmt(liveResults.expectedProfit)}</div></CardContent></Card>
                  <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground uppercase font-bold text-blue-400">Spread</div><div className="text-2xl font-bold text-blue-400">+{liveResults.spreadReduction.toFixed(2)}%</div></CardContent></Card>
               </div>
               <Card><CardHeader><CardTitle className="text-sm">Hedge Temporal Live</CardTitle></CardHeader>
               <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-4">
                    <div className="space-y-2"><Label>Odd Atual do Lay</Label><Input type="number" value={liveInput.layOdd} onChange={(e) => setLiveInput({...liveInput, layOdd: Number(e.target.value)})} /></div>
                    <div className="space-y-2"><Label>Odd Atual do Back</Label><Input type="number" value={liveInput.backOddActual} onChange={(e) => setLiveInput({...liveInput, backOddActual: Number(e.target.value)})} /></div>
                    <div className="space-y-2"><Label>Odd Futura Projetada</Label><Input type="number" value={liveInput.backOddProjected} onChange={(e) => setLiveInput({...liveInput, backOddProjected: Number(e.target.value)})} /></div>
                    <div className="space-y-2"><Label>Valor Desejado no Back (R$)</Label><Input type="number" value={liveInput.backStake} onChange={(e) => setLiveInput({...liveInput, backStake: Number(e.target.value)})} /></div>
                 </div>
                 <div className="bg-muted/10 p-4 rounded-lg border border-border/50">
                    <h4 className="text-xs font-bold uppercase mb-4">Análise de Sensibilidade</h4>
                    <div className="space-y-2">
                       {liveResults.sensitivity.map((s, i) => (
                         <div key={i} className="flex justify-between text-xs">
                           <span>Se Back = {s.odd.toFixed(2)}</span>
                           <span className={s.profit >= 0 ? "text-emerald-400" : "text-red-400"}>R$ {fmt(s.profit)} ({fmtPct(s.extraction)})</span>
                         </div>
                       ))}
                    </div>
                 </div>
               </CardContent></Card>
            </div>
          )}
        </div>
      </div>
    </ScrollArea>
  );
};
