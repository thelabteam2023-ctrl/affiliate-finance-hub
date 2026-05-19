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
  Plus, Trash2, Info, ChevronRight, Zap, BarChart3, HelpCircle,
  FlaskConical, BookOpen, Clock
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  HedgeProbabilisticoEngine,
  type LegInput,
  type AggregatedScenario
} from '@/lib/hedge-probabilistico-engine';
import { LiveHedgeEngine, type LiveHedgeInput } from '@/lib/live-hedge-engine';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { BibliotecaOuroDinamica } from './BibliotecaOuroDinamica';

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
}

const SortableLabCard: React.FC<SortableItemProps> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.8 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
      {children}
    </div>
  );
};

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
  const [labCardsOrder, setLabCardsOrder] = useState(['info', 'library', 'monte-carlo']);

  const [liveInput, setLiveInput] = useState<LiveHedgeInput>({
    layOdd: 3.0,
    backOddActual: 2.7,
    backOddProjected: 3.0,
    backStake: 100,
    commission: 2
  });

  const metrics = useMemo(() => HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, commission, targetExtraction), [legs, freebet, commission, targetExtraction]);
  const liveResults = useMemo(() => LiveHedgeEngine.calculate(liveInput), [liveInput]);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLabCardsOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

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
              <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => setShowHelp(true)}><HelpCircle className="h-5 w-5" /></Button>
            </div>
          </div>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
            <TabsList className="grid grid-cols-3 h-9 w-[420px]">
              <TabsTrigger value="calculadora" className="text-xs gap-2"><Activity className="h-3.5 w-3.5" /> Calculadora</TabsTrigger>
              <TabsTrigger value="laboratorio" className="text-xs gap-2"><FlaskConical className="h-3.5 w-3.5" /> Laboratório</TabsTrigger>
              <TabsTrigger value="live" className="text-xs gap-2"><Clock className="h-3.5 w-3.5" /> Calculadora Live</TabsTrigger>
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
                 <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToVerticalAxis]}>
                   <SortableContext items={labCardsOrder} strategy={verticalListSortingStrategy}>
                     {labCardsOrder.map((id) => (
                       <SortableLabCard key={id} id={id}>
                         {id === 'info' && (
                           <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20 mb-4">
                             <p className="text-xs font-bold text-emerald-400">Análise Quantitativa Ativa</p>
                           </div>
                         )}
                         {id === 'library' && (
                           <Card className="mb-4">
                             <CardHeader className="p-3"><CardTitle className="text-[10px] uppercase text-muted-foreground tracking-wider">Biblioteca Dinâmica</CardTitle></CardHeader>
                             <CardContent className="p-3 pt-0">
                                <BibliotecaOuroDinamica freebet={freebet} target={targetExtraction} commission={commission} />
                             </CardContent>
                           </Card>
                         )}
                         {id === 'monte-carlo' && (
                           <Card className="mb-4">
                             <CardHeader className="p-3"><CardTitle className="text-[10px] uppercase text-muted-foreground tracking-wider">Métricas de Risco</CardTitle></CardHeader>
                             <CardContent className="p-3 pt-0">
                               <div className="space-y-2">
                                  <div className="flex justify-between text-[10px]"><span>Exposição Máxima:</span><span className="text-orange-400">R$ {fmt(metrics.maxResponsibility)}</span></div>
                                  <div className="flex justify-between text-[10px]"><span>Capital Necessário:</span><span className="text-blue-400">R$ {fmt(metrics.capitalRequired)}</span></div>
                               </div>
                             </CardContent>
                           </Card>
                         )}
                       </SortableLabCard>
                     ))}
                   </SortableContext>
                 </DndContext>
               </div>
               <div className="lg:col-span-8 xl:col-span-9 space-y-6">
                 <Card><CardHeader><CardTitle className="text-sm">Cascata Probabilística</CardTitle></CardHeader>
                 <CardContent>
                    <div className="h-[400px] w-full bg-muted/20 rounded-md p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={metrics.aggregatedScenarios} onClick={(data) => data && data.activePayload && setExpanded(data.activePayload[0].payload)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis dataKey="description" stroke="#666" fontSize={10} />
                          <YAxis stroke="#666" fontSize={10} />
                          <RechartsTooltip />
                          <Area type="monotone" dataKey="result" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                       {metrics.aggregatedScenarios.map((s, i) => (
                         <div key={i} className="p-2 border border-border/40 rounded bg-muted/10 cursor-pointer hover:bg-muted/20 transition-colors" onClick={() => setExpanded(s)}>
                           <div className="text-[8px] uppercase text-muted-foreground">{s.description}</div>
                           <div className="text-xs font-bold text-primary">{fmtPct(s.probability * 100)}</div>
                           <div className={`text-[10px] font-mono ${s.result >= 0 ? "text-emerald-400" : "text-red-400"}`}>R$ {fmt(s.result)}</div>
                         </div>
                       ))}
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

        <Dialog open={!!expanded} onOpenChange={(o) => !o && setExpanded(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalhamento: {expanded?.description}</DialogTitle>
              <DialogDescription>Probabilidade: {fmtPct((expanded?.probability || 0) * 100)}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="p-4 bg-muted/30 rounded-lg">
                <span className="text-[10px] uppercase text-muted-foreground">Resultado</span>
                <p className="text-xl font-bold">R$ {fmt(expanded?.result || 0)}</p>
              </div>
              <div className="p-4 bg-muted/30 rounded-lg">
                <span className="text-[10px] uppercase text-muted-foreground">Exposição</span>
                <p className="text-xl font-bold">R$ {fmt(expanded?.maxExposure || 0)}</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={showHelp} onOpenChange={setShowHelp}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="text-xl flex items-center gap-2"><BookOpen className="h-5 w-5 text-primary" /> Guia do Hedge Probabilístico</DialogTitle>
            </DialogHeader>
            <ScrollArea className="flex-1 p-6 pt-2">
              <div className="space-y-6 pb-6">
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-primary uppercase tracking-wider">O Conceito</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">O Hedge Probabilístico é uma técnica de arbitragem sequencial para maximizar o valor de freebets.</p>
                </section>
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider">Glossário</h3>
                  <div className="space-y-2">
                    <div className="p-3 bg-muted/30 rounded border border-border/50">
                      <p className="text-xs font-bold">EV (Expected Value)</p>
                      <p className="text-[11px] text-muted-foreground">O lucro médio esperado no longo prazo.</p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded border border-border/50">
                      <p className="text-xs font-bold">ROE (Return on Exposure)</p>
                      <p className="text-[11px] text-muted-foreground">O retorno sobre o capital que você precisa ter na exchange.</p>
                    </div>
                  </div>
                </section>
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </ScrollArea>
  );
};
