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
   CheckCircle2, Lightbulb, BookOpen
} from 'lucide-react';
import { 
  HedgeProbabilisticoEngine, 
  type LegInput,
  type HedgeResult,
  type AggregatedScenario
} from '@/lib/hedge-probabilistico-engine';
import { CardInfoTooltip } from '@/components/ui/card-info-tooltip';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

export const CalculadoraHedgeProbabilisticaContent: React.FC = () => {
  const [freebet, setFreebet] = useState(100);
  const [commission, setCommission] = useState(2.8);
   const [targetExtraction, setTargetExtraction] = useState(0.8);
  const [legs, setLegs] = useState<LegInput[]>([
    { name: 'Evento 1', backOdd: 2.0, layOdd: 2.0 },
    { name: 'Evento 2', backOdd: 2.0, layOdd: 2.0 }
  ]);
  const [expanded, setExpanded] = useState<AggregatedScenario | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const metrics: HedgeResult = useMemo(() => {
    return HedgeProbabilisticoEngine.calculateMetrics(
      legs, 
      freebet, 
      commission / 100, 
       targetExtraction
     );
   }, [legs, freebet, commission, targetExtraction]);

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
      <div className="p-4 space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Zap className="h-6 w-6 text-primary" />
                Calculadora de Hedge Probabilístico
              </h1>
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setShowHelp(true)}
              >
                <HelpCircle className="h-4 w-4" />
                Como funciona?
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Motor quantitativo para extração de freebets com análise de risco e cascata.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={`px-4 py-1 text-sm ${scoreColor}`}>
              Score: {scoreLabel}
            </Badge>
          </div>
        </div>

        {/* KPIs Section */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <BarChart3 className="h-3 w-3" /> Odd Total
              </div>
              <div className="text-xl font-bold text-white">{metrics.totalBackOdd.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Multiplicação das odds</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Target className="h-3 w-3" /> Extração Estimada
                <CardInfoTooltip 
                  title="Extração Estimada (EV)" 
                  description="É a média matemática de quanto você vai extrair da FreeBet considerando todos os cenários e suas probabilidades. Não é o lucro fixo, mas o valor esperado no longo prazo." 
                />
              </div>
              <div className="text-xl font-bold text-emerald-400">R$ {fmt(metrics.totalEV)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Valor médio da operação</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Taxa de Extração
              </div>
              <div className="text-xl font-bold text-blue-400">{fmtPct(metrics.totalROI)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Rendimento sobre a FreeBet</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Risco Real
              </div>
              <div className="text-xl font-bold text-red-400">R$ {fmt(metrics.maxDrawdown)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Maior perda possível</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Shield className="h-3 w-3" /> Exposição Máx.
              </div>
              <div className="text-xl font-bold text-orange-400">R$ {fmt(metrics.maxResponsibility)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Saldo necessário</div>
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
                <div className="space-y-2 pt-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs flex items-center gap-1">
                      Meta de Extração (%)
                      <CardInfoTooltip title="Meta de Extração" description="Define quanto você deseja extrair da FreeBet. Valores maiores aumentam o lucro mas exigem mais responsabilidade (banca) na Exchange." />
                    </Label>
                    <span className="text-xs font-mono text-primary">{Math.round(targetExtraction * 100)}%</span>
                  </div>
                  <Input 
                    type="number" 
                    value={Math.round(targetExtraction * 100)} 
                    onChange={(e) => setTargetExtraction(Number(e.target.value) / 100)}
                    className="h-9 text-sm"
                  />
                  <p className="text-[10px] text-muted-foreground italic">
                    Sugerido: 70% a 90% para operações equilibradas.
                  </p>
                </div>
              </CardContent>
            </Card>

             <Card>
               <CardHeader className="pb-3">
                 <CardTitle className="text-sm font-medium flex items-center gap-2">
                   <BarChart3 className="h-4 w-4" /> Resumo da Cascata
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-3">
                 <div className="flex justify-between items-center text-xs">
                   <span className="text-muted-foreground">Custo Acumulado Total</span>
                   <span className="font-mono text-red-400">R$ {fmt(metrics.cumulativeCascadeCost)}</span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                   <span className="text-muted-foreground">Lucro "Todas Ganham"</span>
                   <span className={`font-mono ${metrics.allWonProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                     R$ {fmt(metrics.allWonProfit)}
                   </span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                   <span className="text-muted-foreground">Probabilidade de Sucesso</span>
                   <span className="font-mono text-emerald-400">
                     {fmtPct((metrics.scenarios.find(s => !s.path.includes('lost'))?.probability || 0) * 100)}
                   </span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                   <span className="text-muted-foreground">Drawdown Máximo</span>
                   <span className="font-mono text-red-400">-R$ {fmt(metrics.maxDrawdown)}</span>
                 </div>
                 <div className="pt-2 border-t border-border mt-2">
                   <p className="text-[10px] text-muted-foreground leading-relaxed italic">
                     * O capital necessário é acumulativo: se a operação avança, as responsabilidades das pernas anteriores já foram consumidas.
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
                       <TableHead className="w-[140px]">Evento</TableHead>
                       <TableHead>Odd B/L</TableHead>
                       <TableHead className="text-right">Stake</TableHead>
                       <TableHead className="text-right">Resp.</TableHead>
                       <TableHead className="text-right">R. Acum</TableHead>
                       <TableHead className="text-right font-bold">Exp. Tot</TableHead>
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
                             <div className="flex flex-col gap-1">
                               <Input 
                                 type="number"
                                 value={leg.backOdd} 
                                 onChange={(e) => updateLeg(index, 'backOdd', Number(e.target.value))}
                                 className="h-7 text-[10px] font-mono w-16"
                                 placeholder="Back"
                               />
                               <Input 
                                 type="number"
                                 value={leg.layOdd} 
                                 onChange={(e) => updateLeg(index, 'layOdd', Number(e.target.value))}
                                 className="h-7 text-[10px] font-mono w-16"
                                 placeholder="Lay"
                               />
                             </div>
                           </TableCell>
                           <TableCell className="text-right font-mono text-blue-400 text-xs">
                             R$ {fmt(calcLeg.layStake)}
                           </TableCell>
                           <TableCell className="text-right font-mono text-red-400 text-xs">
                             R$ {fmt(calcLeg.responsibility)}
                           </TableCell>
                           <TableCell className="text-right font-mono text-muted-foreground text-[10px]">
                             R$ {fmt(calcLeg.cumulativeResponsibility)}
                           </TableCell>
                           <TableCell className="text-right font-mono text-orange-400 font-bold text-xs">
                             R$ {fmt(calcLeg.totalExposure)}
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
                  {metrics.aggregatedScenarios.map((scenario, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => scenario.subScenarios.length > 1 && setExpanded(scenario)}
                      className={`w-full text-left flex items-center gap-3 p-2 rounded-lg bg-muted/20 border border-border/50 transition-colors ${
                        scenario.subScenarios.length > 1 ? 'hover:bg-muted/40 cursor-pointer' : 'cursor-default'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Cenário {idx + 1}</span>
                          <span className="text-xs font-medium truncate">{scenario.description}</span>
                          {scenario.subScenarios.length > 1 && (
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                              {scenario.subScenarios.length} combinações
                            </Badge>
                          )}
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
                      {scenario.subScenarios.length > 1 && (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
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
                  <p className={`text-lg font-bold font-mono ${expanded && expanded.result >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
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
                    <div className="p-3 bg-muted/20 border border-border/50 rounded-md">
                      <p className="text-xs font-semibold mb-1">Extração Estimada (EV)</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        O "Expected Value" não é o seu lucro garantido hoje, mas a <strong>média matemática</strong> de retorno da operação. Como você está fazendo coberturas sequenciais, o EV mostra quanto você extrai da FreeBet (em média) considerando todos os caminhos possíveis.
                      </p>
                    </div>
                    <div className="p-3 bg-muted/20 border border-border/50 rounded-md">
                      <p className="text-xs font-semibold mb-1">Meta de Extração vs. Taxa de Extração</p>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        A <strong>Meta</strong> é quanto você <i>tenta</i> tirar da FreeBet (ex: 80%). A <strong>Taxa Real</strong> é quanto o mercado permite tirar após as comissões e odds reais. Se a Taxa for próxima da Meta, sua operação está otimizada.
                      </p>
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
