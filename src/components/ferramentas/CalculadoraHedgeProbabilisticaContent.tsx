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
 import { restrictToVerticalAxis, restrictToWindowEdges } from '@dnd-kit/modifiers';
 
 interface SortableItemProps {
   id: string;
   children: React.ReactNode;
 }
 
 const SortableLabCard: React.FC<SortableItemProps> = ({ id, children }) => {
   const {
     attributes,
     listeners,
     setNodeRef,
     transform,
     transition,
     isDragging,
   } = useSortable({ id });
 
   const style = {
     transform: CSS.Transform.toString(transform),
     transition,
     zIndex: isDragging ? 50 : undefined,
     opacity: isDragging ? 0.8 : 1,
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
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
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
            {activeTab === "calculadora" ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><BarChart3 className="h-3 w-3" /> Odd Total</div><div className="text-xl font-bold text-white">{metrics.totalBackOdd.toFixed(2)}</div></CardContent></Card>
                  <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Target className="h-3 w-3" /> EV</div><div className="text-xl font-bold text-emerald-400">R$ {fmt(metrics.totalEV)}</div></CardContent></Card>
                  <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> Extração</div><div className="text-xl font-bold text-blue-400">{fmtPct(metrics.totalROI)}</div></CardContent></Card>
                  <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Risco</div><div className="text-xl font-bold text-red-400">R$ {fmt(metrics.maxDrawdown)}</div></CardContent></Card>
                  <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Shield className="h-3 w-3" /> Exposição</div><div className="text-xl font-bold text-orange-400">R$ {fmt(metrics.maxResponsibility)}</div></CardContent></Card>
                </div>
                <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Use o slider e a tabela abaixo para configurar suas pernas e meta de extração.</p></CardContent></Card>
              </>
            ) : activeTab === "laboratorio" ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 xl:col-span-3 space-y-6">
                   <div className="p-4 rounded-lg bg-emerald-500/5 border border-emerald-500/20"><p className="text-xs font-bold text-emerald-400">Análise Quantitativa Ativa</p></div>
                </div>
                <div className="lg:col-span-8 xl:col-span-9 space-y-6">
                  <Card><CardHeader><CardTitle className="text-sm">Simulação Monte Carlo</CardTitle></CardHeader><CardContent><p className="text-xs">Resultados baseados em 100.000 trajetórias reais simuladas.</p></CardContent></Card>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="bg-primary/5 border-primary/20"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground uppercase font-bold">Proteção Recomendada</div><div className="text-2xl font-bold text-primary">R$ {fmt(liveResults.recommendedLayStake)}</div></CardContent></Card>
                  <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground uppercase font-bold text-red-400">Responsabilidade</div><div className="text-2xl font-bold text-red-400">R$ {fmt(liveResults.liability)}</div></CardContent></Card>
                  <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground uppercase font-bold text-emerald-400">Lucro Projetado</div><div className="text-2xl font-bold text-emerald-400">R$ {fmt(liveResults.expectedProfit)}</div></CardContent></Card>
                  <Card className="bg-muted/30"><CardContent className="pt-4 text-center"><div className="text-xs text-muted-foreground uppercase font-bold text-blue-400">Ganho Spread</div><div className="text-2xl font-bold text-blue-400">+{liveResults.spreadReduction.toFixed(2)}%</div></CardContent></Card>
                </div>
                <Card><CardContent className="p-6"><p className="text-sm text-muted-foreground">Módulo Live: Proteja na Exchange e aguarde a convergência para entrar no Back.</p></CardContent></Card>
              </div>
            )}
          </div>

        <Dialog open={!!expanded} onOpenChange={(o) => !o && setExpanded(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader className="mb-4">
              <DialogTitle className="flex items-center gap-2">
                Detalhamento do Cenário: {expanded?.description}
              </DialogTitle>
              <DialogDescription className="text-sm">
                Este cenário canônico representa todas as sequências de resultados que terminam nesta etapa da cascata.
                A probabilidade real de este desfecho ocorrer é <strong className="text-primary">{fmtPct((expanded?.probability || 0) * 100)}</strong>.
              </DialogDescription>
            </DialogHeader>
            
            <div className="bg-muted/30 rounded-lg p-4 border border-border/50 mb-6 space-y-3">
              <div className="flex justify-between items-center border-b border-border/50 pb-2">
                <span className="text-xs text-muted-foreground uppercase font-semibold">Resumo Financeiro</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Resultado</span>
                  <p className={`text-lg font-bold font-mono ${expanded && expanded.result >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    R$ {fmt(expanded?.result || 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-muted-foreground uppercase">Exposição Máx.</span>
                  <p className="text-lg font-bold font-mono text-orange-400">
                    R$ {fmt(expanded?.maxExposure || 0)}
                  </p>
                </div>
              </div>
            </div>

            {expanded && expanded.subScenarios.length > 1 && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground uppercase font-semibold">Caminhos Brutos ({expanded.subScenarios.length})</span>
                </div>
                <ScrollArea className="max-h-[300px] border rounded-md">
                  <div className="p-1">
                    {expanded.subScenarios
                      .slice()
                      .map((sub, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/20 transition-colors border-b last:border-0 border-border/30">
                          <span className="text-[11px] font-mono text-muted-foreground">{sub.path.join(' → ')}</span>
                          <div className="flex gap-4 text-[10px] font-mono">
                            <span className="text-muted-foreground/50">Peso: {fmtPct((1 / expanded.subScenarios.length) * 100)}</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </ScrollArea>
                <p className="text-[10px] text-muted-foreground italic leading-tight">
                  * Como a cascata para na primeira perda, todos os resultados acima são matematicamente idênticos em termos de P&L.
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showHelp} onOpenChange={setShowHelp}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="text-xl flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                Guia do Hedge Probabilístico
              </DialogTitle>
              <DialogDescription>
                Entenda como transformar sua múltipla de freebet em lucro garantido (ou alto valor esperado) de forma matemática.
              </DialogDescription>
            </DialogHeader>
            
             <ScrollArea className="flex-1 p-6 pt-2">
              <div className="space-y-6 pb-6">
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-primary uppercase tracking-wider">
                    <Target className="h-4 w-4" /> O Conceito
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    O <strong>Hedge Probabilístico</strong> (ou Cascata de Freebet) é uma técnica avançada de arbitragem. Em vez de cobrir uma múltipla inteira de uma só vez (o que geralmente dá um ROI baixo), você faz coberturas <strong>sequenciais</strong>.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    O objetivo é "parar a queda" em qualquer estágio da múltipla. Se um evento perde, você ganha na Exchange. Se ganha, você avança para o próximo evento e faz uma nova cobertura.
                  </p>
                </section>

                <section className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-emerald-400 uppercase tracking-wider">
                    <CheckCircle2 className="h-4 w-4" /> Exemplo Prático (3 Eventos)
                  </h3>
                  <div className="space-y-4">
                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">1</div>
                        <div className="w-0.5 flex-1 bg-border my-1"></div>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Evento A (Odd 2.0)</p>
                        <p className="text-xs text-muted-foreground italic">Você faz um Lay no valor calculado pela ferramenta.</p>
                        <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside">
                          <li>Se <span className="text-red-400">A perde</span>: Você ganha o Lay e termina com lucro. <span className="font-bold text-emerald-400">Fim!</span></li>
                          <li>Se <span className="text-emerald-400">A ganha</span>: Você perde a responsabilidade do Lay, mas sua freebet continua viva.</li>
                        </ul>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">2</div>
                        <div className="w-0.5 flex-1 bg-border my-1"></div>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Evento B (Odd 2.0)</p>
                        <p className="text-xs text-muted-foreground italic">Agora você faz um Lay no Evento B.</p>
                        <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside">
                          <li>Se <span className="text-red-400">B perde</span>: O ganho no Lay cobre a perda anterior e ainda gera lucro. <span className="font-bold text-emerald-400">Fim!</span></li>
                          <li>Se <span className="text-emerald-400">B ganha</span>: Você continua para o próximo evento.</li>
                        </ul>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">3</div>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Evento C (Último)</p>
                        <ul className="text-xs text-muted-foreground mt-1 list-disc list-inside">
                          <li>Se <span className="text-red-400">C perde</span>: O Lay final te dá o lucro.</li>
                          <li>Se <span className="text-emerald-400">C ganha</span>: Você ganha a múltipla na casa de apostas, que paga todo o custo da cascata e o lucro final.</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-yellow-400 uppercase tracking-wider">
                    <Lightbulb className="h-4 w-4" /> Quando utilizar?
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/20 border border-border/50 rounded-md">
                      <p className="text-xs font-semibold mb-1">Odds Médias/Altas</p>
                      <p className="text-[11px] text-muted-foreground">Melhor performance em múltiplas com odds individuais acima de 1.80.</p>
                    </div>
                    <div className="p-3 bg-muted/20 border border-border/50 rounded-md">
                      <p className="text-xs font-semibold mb-1">Eventos não Simultâneos</p>
                      <p className="text-[11px] text-muted-foreground">Fundamental: os eventos devem acontecer um após o outro para que você possa reagir.</p>
                    </div>
                    <div className="p-3 bg-muted/20 border border-border/50 rounded-md">
                      <p className="text-xs font-semibold mb-1">Extração de Valor</p>
                      <p className="text-[11px] text-muted-foreground">Ideal para "limpar" freebets de rollover difícil, garantindo uma porcentagem da banca.</p>
                    </div>
                    <div className="p-3 bg-muted/20 border border-border/50 rounded-md">
                      <p className="text-xs font-semibold mb-1">Gestão de Banca</p>
                      <p className="text-[11px] text-muted-foreground">Exige saldo na Exchange (Exposição Máxima) para cobrir a responsabilidade da cascata.</p>
                    </div>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2 text-primary uppercase tracking-wider">
                    <Info className="h-4 w-4" /> Glossário de Conceitos
                  </h3>
                  <div className="space-y-3">
                    <div className="p-3 bg-primary/10 border border-primary/30 rounded-md">
                      <p className="text-xs font-semibold mb-1 text-primary">Extração Estimada (EV - Expected Value)</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        O EV representa o seu lucro médio <strong>no longo prazo</strong>. 
                        <br /><br />
                        Diferente de um lucro fixo, em algumas operações você ganhará mais e em outras menos (ou terá o drawdown), mas se repetir esta estratégia <strong>1.000 vezes</strong>, seu lucro total será de aproximadamente <strong>R$ {fmt(metrics.totalEV * 1000)}</strong>.
                        <br /><br />
                        É a métrica mais importante para saber se uma operação de FreeBet vale a pena.
                      </p>
                    </div>
                    <div className="p-3 bg-blue-500/5 border border-blue-500/20 rounded-md">
                      <p className="text-xs font-semibold mb-1 text-blue-400">Taxa de Extração (ROI da FreeBet)</p>
                      <div className="text-[11px] text-muted-foreground leading-relaxed space-y-2">
                        <p>É a porcentagem da FreeBet que vira dinheiro real após todos os hedges e custos.</p>
                        <div className="bg-background/40 p-2 rounded border border-blue-500/20">
                          <p className="font-semibold text-blue-300">Exemplo Prático:</p>
                          <p>Se você tem uma <strong>FreeBet de R$ 100</strong> e a calculadora mostra uma <strong>Taxa de 80%</strong>, significa que na média de muitas operações, você termina com <strong>R$ 80,00 líquidos</strong> no seu bolso.</p>
                        </div>
                        <p>A <strong>Meta</strong> (no slider) é o seu objetivo; a <strong>Taxa</strong> é o que o mercado (as odds) permite extrair agora.</p>
                      </div>
                    </div>
                    <div className="p-3 bg-muted/20 border border-border/50 rounded-md">
                      <p className="text-xs font-semibold mb-1">Exposição vs. Responsabilidade</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        A <strong>Responsabilidade</strong> é o custo de um Lay individual. A <strong>Exposição Máxima</strong> é o saldo total que você precisa ter na Exchange para cobrir a cascata inteira até o fim.
                      </p>
                    </div>
                  </div>
                </section>

                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                  <p className="text-xs text-primary leading-relaxed">
                    <strong>Dica de Ouro:</strong> Uma boa extração de FreeBet gira entre 70% e 90% do seu valor nominal. Se o Score estiver "Crítico", considere aumentar as odds ou diminuir a Meta de Extração.
                  </p>
                   </div>
                 </div>
               </ScrollArea>
             </DialogContent>
           </Dialog>
        </div>
      </ScrollArea>
    );
};
