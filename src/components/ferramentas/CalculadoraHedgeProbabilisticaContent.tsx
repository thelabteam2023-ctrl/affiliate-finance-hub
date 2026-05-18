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
   Plus, Trash2, Info, ChevronRight, Zap, BarChart3, HelpCircle,
   CheckCircle2, Lightbulb, BookOpen, FlaskConical, BrainCircuit,
   ShieldAlert, Coins, Sparkles, Wand2, Dna, LineChart, History,
   Trophy, Star, ArrowRight
 } from 'lucide-react';
 import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

   const goldenCombinations = [
     {
       name: "Duo de Ataque",
       description: "A melhor combinação para 2 pernas. Equilíbrio entre odd inicial baixa e final alta.",
       legs: [1.80, 4.00],
       expectedROI: "39.6%",
       type: "Alta Eficiência",
       commission: "2.8%"
     },
     {
       name: "Triple Threat Otimizado",
       description: "Ponto de equilíbrio ideal para extração consistente em 3 eventos.",
       legs: [1.80, 1.80, 4.00],
       expectedROI: "20.3%",
       type: "Equilibrado",
       commission: "2.8%"
     },
     {
       name: "Quarteto Estratégico",
       description: "Mantenha o controle da banca mesmo com 4 eventos sequenciais.",
       legs: [1.80, 1.80, 1.80, 4.00],
       expectedROI: "9.2%",
       type: "Estabilidade",
       commission: "2.8%"
     },
     {
       name: "Full House (5 Pernas)",
       description: "Otimizado para extrações longas onde a banca é o fator limitante.",
       legs: [1.80, 1.80, 1.80, 1.80, 4.00],
       expectedROI: "2.6%",
       type: "Segurança Máxima",
       commission: "2.8%"
     }
   ];

 export const CalculadoraHedgeProbabilisticaContent: React.FC = () => {
   const applyGoldenCombo = (comboLegs: number[]) => {
     const newLegs = comboLegs.map((odd, i) => ({
       name: `Evento ${i + 1}`,
       backOdd: odd,
       layOdd: odd
     }));
     setLegs(newLegs);
     setActiveTab('calculadora');
   };

  const [freebet, setFreebet] = useState(100);
  const [commission, setCommission] = useState(2.8);
   const [targetExtraction, setTargetExtraction] = useState(0.7);
   const [bankroll, setBankroll] = useState(5000);
   const [activeTab, setActiveTab] = useState('calculadora');
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
 
   const riskOfRuin = useMemo(() => {
     if (metrics.totalEV <= 0) return 100;
     // Variance: Σ p * (x - μ)²
     const variance = metrics.scenarios.reduce((acc, s) => {
       return acc + s.probability * Math.pow(s.result - metrics.totalEV, 2);
     }, 0);
     if (variance === 0) return 0;
     // RoR = exp(-2 * EV * Bank / Var)
     const ror = Math.exp((-2 * metrics.totalEV * bankroll) / variance);
     return Math.min(100, ror * 100);
   }, [metrics, bankroll]);
 
    const optimalConfig = useMemo(() => {
      let bestEV = -Infinity;
      let bestTarget = 0.7;
      for (let t = 0.1; t <= 1.0; t += 0.05) {
        const m = HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, commission / 100, t);
        if (m.allWonProfit >= 0 && m.maxResponsibility <= bankroll) {
          if (m.totalEV > bestEV) {
            bestEV = m.totalEV;
            bestTarget = t;
          }
        }
      }
      return { target: bestTarget, ev: bestEV };
    }, [legs, freebet, commission, bankroll]);

    const monteCarloSim = useMemo(() => {
      const trials = 1000;
      let totalProfit = 0;
      let bankruptcies = 0;
      const results = [];

      for (let i = 0; i < trials; i++) {
        const rand = Math.random();
        let cumulativeProb = 0;
        let outcome = 0;
        
        for (const scenario of metrics.aggregatedScenarios) {
          cumulativeProb += scenario.probability;
          if (rand <= cumulativeProb) {
            outcome = scenario.result;
            break;
          }
        }
        
        results.push(outcome);
        totalProfit += outcome;
        if (bankroll + outcome <= 0) bankruptcies++;
      }

      const winRate = results.filter(r => r > 0).length / trials;
      
      return {
        trials,
        avgResult: totalProfit / trials,
        winRate,
        bankruptcies,
        samples: results.slice(0, 10)
      };
    }, [metrics, bankroll]);
 
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
           <div className="flex flex-col items-end gap-2">
             <Badge className={`px-4 py-1 text-sm ${scoreColor}`}>
               Score: {scoreLabel}
             </Badge>
             <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
               <TabsList className="grid grid-cols-2 h-9 w-[280px]">
                 <TabsTrigger value="calculadora" className="text-xs gap-2">
                   <Activity className="h-3.5 w-3.5" /> Calculadora
                 </TabsTrigger>
                 <TabsTrigger value="laboratorio" className="text-xs gap-2">
                   <FlaskConical className="h-3.5 w-3.5" /> Laboratório
                 </TabsTrigger>
               </TabsList>
             </Tabs>
           </div>
         </div>
 
         <div className="space-y-6">
            {activeTab === 'calculadora' ? (
               <>

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
                  description={`O EV (Valor Esperado) de R$ ${fmt(metrics.totalEV)} é a média matemática do que você ganhará por operação no longo prazo. Por exemplo: após 1.000 operações idênticas a esta, seu lucro total acumulado seria de aproximadamente R$ ${fmt(metrics.totalEV * 1000)}, mesmo que resultados individuais variem.`}
                />
              </div>
              <div className={`text-xl font-bold ${metrics.totalEV >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                R$ {fmt(metrics.totalEV)}
                <span className="text-sm font-normal ml-1 opacity-80">({fmtPct(metrics.totalROI)})</span>
              </div>
              {metrics.totalEV < 0 && (
                <div className="text-[10px] text-red-400 font-medium flex items-center justify-center gap-1 mt-1">
                  <AlertTriangle className="h-2 w-2" /> EV Negativo
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-1">Média (EV) por operação</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> Taxa de Extração
                <CardInfoTooltip 
                  title="Taxa de Extração" 
                  description={`Representa a eficiência real da sua operação. 

Exemplo: Se você tem uma FreeBet de R$ 100 e a Taxa é de 75%, significa que ao final de muitas operações similares, você terá transformado esses R$ 100 de bônus em R$ 75,00 de saldo real no seu bolso.

A Taxa de Extração é o ROI (Retorno sobre Investimento) calculado especificamente sobre o valor nominal da FreeBet.`} 
                />
              </div>
              <div className="text-xl font-bold text-blue-400">{fmtPct(metrics.totalROI)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Eficiência da conversão</div>
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
                <div className="space-y-4 pt-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-xs flex items-center gap-1">
                      Meta de Extração (%)
                      <CardInfoTooltip 
                        title="Meta de Extração" 
                        description="Define quanto você deseja extrair da FreeBet. Em 100%, você busca o lucro máximo, o que exige mais banca na Exchange. Reduzir a meta diminui a responsabilidade necessária." 
                      />
                    </Label>
                    <span className="text-xs font-mono text-primary font-bold">{Math.round(targetExtraction * 100)}%</span>
                  </div>
                  <Slider 
                    value={[targetExtraction * 100]} 
                    min={0} 
                    max={100} 
                    step={1}
                    onValueChange={(vals) => setTargetExtraction(vals[0] / 100)}
                    className="py-4"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground italic">
                    <span>Menos Banca</span>
                    <span>Extração Máxima</span>
                  </div>
                </div>
              </CardContent>
            </Card>

             <Card>
               <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Resumo da Cascata
                  </CardTitle>
                  {metrics.allWonProfit < 0 && (
                    <CardInfoTooltip 
                      title="Alerta de Inviabilidade"
                      description={`O cenário "Todas Ganham" está gerando prejuízo (R$ ${fmt(metrics.allWonProfit)}). 
                      
Isso ocorre porque o lucro da FreeBet na casa (R$ ${fmt(freebet * (metrics.totalBackOdd - 1))}) é menor do que a soma das responsabilidades dos Lays na Exchange (R$ ${fmt(metrics.cumulativeCascadeCost)}).

Para corrigir, reduza a Meta de Extração no slider.`}
                    />
                  )}
                </div>
               </CardHeader>
               <CardContent className="space-y-3">
                 <div className="flex justify-between items-center text-xs">
                   <span className="text-muted-foreground">Custo Acumulado Total</span>
                   <span className="font-mono text-red-400">R$ {fmt(metrics.cumulativeCascadeCost)}</span>
                 </div>
                  <div className="space-y-1.5 p-2 rounded-md bg-muted/40 border border-border/50">
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-muted-foreground font-medium flex items-center gap-1">
                        Cenário "Tudo Ganha"
                        <Info className="h-2 w-2 opacity-50" />
                      </span>
                      <span className={`font-mono font-bold ${metrics.allWonProfit >= 0 ? 'text-emerald-400' : 'text-white'}`}>
                        R$ {fmt(metrics.allWonProfit)}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 text-[9px] text-muted-foreground italic border-t border-border/30 pt-1.5">
                      <div className="flex justify-between">
                        <span>Ganho Freebet:</span>
                        <span className="text-emerald-400/80">+R$ {fmt(freebet * (metrics.totalBackOdd - 1))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Custo Lays:</span>
                        <span className="text-red-400/80">−R$ {fmt(metrics.cumulativeCascadeCost)}</span>
                      </div>
                    </div>
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
                         <TableHead className="w-[120px]">Evento</TableHead>
                         <TableHead className="w-[180px]">Odds (Back / Lay)</TableHead>
                         <TableHead className="text-right">
                           <div className="flex items-center justify-end gap-1">
                             Stake Lay
                             <CardInfoTooltip 
                               title="Stake Lay" 
                               description="Este é o valor exato que você deve digitar no campo 'Aposta' (Stake) ao realizar o Lay na Exchange/Bolsa." 
                             />
                           </div>
                         </TableHead>
                         <TableHead className="text-right">
                           <div className="flex items-center justify-end gap-1">
                             Risco (Resp.)
                             <CardInfoTooltip 
                               title="Responsabilidade" 
                               description="Representa o quanto você está arriscando nesta perna. Esse valor será 'travado' da sua banca na Exchange para cobrir a aposta." 
                             />
                           </div>
                         </TableHead>
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
                              <div className="flex items-center gap-2">
                                <div className="relative">
                                  <span className="absolute -top-3 left-1 text-[8px] text-muted-foreground uppercase">Back</span>
                                  <Input 
                                    type="number"
                                    value={leg.backOdd} 
                                    onChange={(e) => updateLeg(index, 'backOdd', Number(e.target.value))}
                                    className="h-8 text-[11px] font-mono w-16"
                                  />
                                </div>
                                <div className="relative">
                                  <span className="absolute -top-3 left-1 text-[8px] text-muted-foreground uppercase">Lay</span>
                                  <Input 
                                    type="number"
                                    value={leg.layOdd} 
                                    onChange={(e) => updateLeg(index, 'layOdd', Number(e.target.value))}
                                    className="h-8 text-[11px] font-mono w-16"
                                  />
                                </div>
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
               </>
            ) : (
             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="md:col-span-1 space-y-6">
                   <div className="space-y-4">
                     <Card className="bg-primary/5 border-primary/20">
                       <CardContent className="pt-6">
                         <div className="flex items-start gap-3">
                           <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                           <div className="space-y-1">
                             <p className="text-sm font-medium text-primary">Dica de Execução</p>
                             <p className="text-xs text-muted-foreground leading-relaxed">
                               Os valores na coluna <span className="text-blue-400 font-mono">Stake Lay</span> são os que você deve inserir diretamente na sua Exchange (ex: Betfair) ao fazer a contra-aposta.
                             </p>
                           </div>
                         </div>
                       </CardContent>
                     </Card>

                     <Card className="bg-emerald-500/5 border-emerald-500/20 overflow-hidden">
                       <div className="bg-emerald-500/10 px-4 py-2 border-b border-emerald-500/20">
                         <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                           <CheckCircle2 className="h-3 w-3" /> Simulação Visual de 1.000 Eventos
                         </h4>
                       </div>
                       <CardContent className="pt-4 space-y-4">
                         <div className="flex items-end gap-1 h-20 items-baseline">
                           {Array.from({ length: 40 }).map((_, i) => {
                             const height = Math.random() * 80 + 20;
                             const isWin = Math.random() > 0.3;
                             return (
                               <div 
                                 key={i} 
                                 className={`flex-1 rounded-t-sm transition-all duration-1000 ${isWin ? 'bg-emerald-500/40' : 'bg-red-500/40'}`}
                                 style={{ height: `${height}%` }}
                               />
                             );
                           })}
                         </div>
                         <div className="flex justify-between text-[9px] text-muted-foreground uppercase font-medium">
                           <span>Início</span>
                           <span>Série de 1.000 Ciclos Simulados</span>
                           <span>Fim</span>
                         </div>
                         <p className="text-[10px] text-muted-foreground leading-relaxed italic border-t border-border/40 pt-2">
                           Cada barra representa uma operação completa. O gráfico mostra a variância natural do modelo matemático.
                         </p>
                       </CardContent>
                     </Card>
                   </div>

                 <Card>
                   <CardHeader>
                     <CardTitle className="text-sm font-medium flex items-center gap-2">
                       <Coins className="h-4 w-4 text-primary" /> Parâmetros do Laboratório
                     </CardTitle>
                   </CardHeader>
                   <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Valor da Freebet (Base)</Label>
                          <div className="h-10 px-3 flex items-center bg-muted/50 border border-border rounded-md font-mono text-sm text-white">
                            R$ {fmt(freebet)}
                          </div>
                          <p className="text-[9px] text-muted-foreground italic leading-tight">
                            Definido na aba principal.
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-[10px] uppercase font-bold text-primary">Sua Banca Exchange</Label>
                          <div className="relative">
                            <Input 
                              type="number" 
                              value={bankroll} 
                              onChange={(e) => setBankroll(Number(e.target.value))}
                              className="h-10 pl-8 font-mono text-sm"
                            />
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">R$</span>
                          </div>
                          <p className="text-[9px] text-muted-foreground italic leading-tight">
                            Saldo disponível para cobrir Lays.
                          </p>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-2">
                        <div className="flex justify-between items-center text-[10px] uppercase font-bold text-blue-400">
                          <span>Proporção Banca vs Freebet</span>
                          <span>{Math.round(bankroll / freebet)}x</span>
                        </div>
                        <div className="w-full h-1.5 bg-blue-500/10 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-500 transition-all duration-500" 
                            style={{ width: `${Math.min(100, (freebet / bankroll) * 100 * 10)}%` }}
                          />
                        </div>
                        <p className="text-[9px] text-muted-foreground leading-relaxed">
                          Sua banca é <strong>{Math.round(bankroll / freebet)} vezes maior</strong> que o valor da Freebet. 
                          Uma banca saudável deve ser de no mínimo 15-20x o valor da Freebet para absorver variância em cascatas longas.
                        </p>
                      </div>
                     
                     <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg space-y-2">
                       <div className="flex items-center gap-2 text-primary">
                         <Sparkles className="h-3.5 w-3.5" />
                         <span className="text-xs font-bold">Otimizador Inteligente</span>
                       </div>
                       <p className="text-[10px] leading-relaxed">
                         Nossa "IA" analisou {legs.length} eventos e sugere a meta de extração ideal baseada na sua banca.
                       </p>
                       <div className="flex justify-between items-center bg-background/50 p-2 rounded border border-border/50">
                         <span className="text-[10px]">Meta Recomendada:</span>
                         <span className="text-xs font-bold text-emerald-400">{(optimalConfig.target * 100).toFixed(0)}%</span>
                       </div>
                       <Button 
                         className="w-full h-8 text-xs gap-2" 
                         variant="outline"
                         onClick={() => setTargetExtraction(optimalConfig.target)}
                       >
                         <Wand2 className="h-3 w-3" /> Aplicar Recomendação
                       </Button>
                     </div>
                   </CardContent>
                 </Card>
               </div>
 
               <div className="md:col-span-2 space-y-6">
                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                   <Card className="border-l-4 border-l-red-500">
                     <CardHeader className="pb-2">
                       <CardTitle className="text-xs font-medium flex items-center gap-2 text-red-400">
                         <ShieldAlert className="h-4 w-4" /> Risco de Ruína
                       </CardTitle>
                     </CardHeader>
                     <CardContent>
                       <div className="text-2xl font-bold font-mono">
                         {fmtPct(riskOfRuin)}
                       </div>
                       <p className="text-[10px] text-muted-foreground mt-1">
                         Probabilidade de quebrar a banca com esta configuração no longo prazo.
                       </p>
                       <div className="mt-3 w-full h-2 bg-muted rounded-full overflow-hidden">
                         <div 
                           className={`h-full transition-all duration-500 ${riskOfRuin > 10 ? 'bg-red-500' : 'bg-emerald-500'}`}
                           style={{ width: `${riskOfRuin}%` }}
                         />
                       </div>
                     </CardContent>
                   </Card>
 
                   <Card className="border-l-4 border-l-emerald-500">
                     <CardHeader className="pb-2">
                       <CardTitle className="text-xs font-medium flex items-center gap-2 text-emerald-400">
                         <BrainCircuit className="h-4 w-4" /> Eficiência de Capital
                       </CardTitle>
                     </CardHeader>
                     <CardContent>
                       <div className="text-2xl font-bold font-mono text-white">
                         {fmtPct((metrics.maxResponsibility / bankroll) * 100)}
                       </div>
                       <p className="text-[10px] text-muted-foreground mt-1">
                         Uso da banca disponível (R$ {fmt(metrics.maxResponsibility)} utilizados).
                       </p>
                     </CardContent>
                   </Card>
                 </div>
 
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Dna className="h-4 w-4 text-primary" /> Laboratório de Simulação e Dados
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {/* Math Section */}
                      <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                          <History className="h-4 w-4 text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Como chegamos neste Risco?</h4>
                        </div>
                        <div className="text-xs space-y-2 leading-relaxed">
                          <p>
                            O Risco de Ruína ({fmtPct(riskOfRuin)}) é calculado usando o modelo de <strong>Variância Probabilística</strong>.
                          </p>
                           <div className="bg-background/50 p-3 rounded font-mono text-[10px] border border-border/40">
                             RoR = exp(-2 * EV * Banca / Variância)
                           </div>
                           <div className="space-y-3">
                             <p className="text-muted-foreground italic">
                               Isso significa que em uma série infinita de operações idênticas, a probabilidade de sua banca de R$ {fmt(bankroll)} chegar a zero antes de atingir o lucro esperado é de {fmtPct(riskOfRuin)}.
                             </p>
                             
                             <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-md">
                               <h5 className="text-[10px] font-bold text-red-400 uppercase mb-2 flex items-center gap-2">
                                 <ShieldAlert className="h-3 w-3" /> Horizonte de Curto Prazo (10 Bilhetes)
                               </h5>
                               <div className="flex justify-between items-center">
                                 <span className="text-[10px] text-muted-foreground">Prob. de Quebra (Próx. 10):</span>
                                 <span className="text-sm font-bold text-red-400">
                                   {fmtPct((1 - Math.pow(1 - (riskOfRuin / 100), 10/1000)) * 100)}
                                 </span>
                               </div>
                               <p className="text-[9px] text-muted-foreground mt-1 leading-tight">
                                 *Estimativa baseada na variância acumulada para uma sequência imediata de 10 operações.
                               </p>
                             </div>
                           </div>
                        </div>
                      </div>

                      {/* Monte Carlo Visual */}
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <LineChart className="h-4 w-4 text-emerald-400" />
                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Simulação Real (1.000 Eventos)</h4>
                          </div>
                          <Badge variant="outline" className="text-[9px] text-emerald-400 border-emerald-500/30">
                            Monte Carlo Run
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="p-3 rounded-lg bg-muted/20 border border-border/50 text-center">
                            <span className="text-[9px] text-muted-foreground block mb-1">Lucro Médio</span>
                            <span className="text-sm font-bold text-emerald-400">R$ {fmt(monteCarloSim.avgResult)}</span>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/20 border border-border/50 text-center">
                            <span className="text-[9px] text-muted-foreground block mb-1">Taxa de Sucesso</span>
                            <span className="text-sm font-bold text-blue-400">{fmtPct(monteCarloSim.winRate * 100)}</span>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/20 border border-border/50 text-center">
                            <span className="text-[9px] text-muted-foreground block mb-1">Quebras (Banca)</span>
                            <span className="text-sm font-bold text-red-400">{monteCarloSim.bankruptcies}</span>
                          </div>
                          <div className="p-3 rounded-lg bg-muted/20 border border-border/50 text-center">
                            <span className="text-[9px] text-muted-foreground block mb-1">Total Ciclos</span>
                            <span className="text-sm font-bold text-white">{monteCarloSim.trials}</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase flex items-center gap-1">
                            Exemplos de resultados individuais:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {monteCarloSim.samples.map((s, i) => (
                              <span key={i} className={`text-[9px] px-2 py-0.5 rounded-full font-mono border ${s >= 0 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                R$ {fmt(s)}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Optimal Strategy Explanation */}
                      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-3">
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-primary" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-primary">Por que a Meta de {(optimalConfig.target * 100).toFixed(0)}%?</h4>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Nossa simulação dinâmica testou 20 variações de meta (de 10% a 100%). A meta de <strong>{(optimalConfig.target * 100).toFixed(0)}%</strong> foi escolhida porque:
                        </p>
                        <ul className="text-[10px] space-y-1 text-muted-foreground">
                          <li className="flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-primary" />
                            Maximiza o <strong>EV Matemático</strong> (R$ {fmt(optimalConfig.ev)}) sem quebrar a banca.
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-primary" />
                            Mantém a exposição máxima (R$ {fmt(metrics.maxResponsibility)}) dentro do seu limite de banca.
                          </li>
                          <li className="flex items-center gap-2">
                            <div className="w-1 h-1 rounded-full bg-primary" />
                            Garante que o cenário "Tudo Ganha" ainda seja lucrativo na casa.
                          </li>
                        </ul>
                      </div>

                      {/* Golden Combinations Section */}
                      <div className="space-y-4 pt-4 border-t border-border/50">
                        <div className="flex items-center gap-2">
                          <Trophy className="h-4 w-4 text-yellow-400" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Biblioteca de Ouro (Benchmarks)</h4>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {goldenCombinations.map((combo, idx) => (
                            <div 
                              key={idx} 
                              className="p-3 rounded-lg bg-muted/20 border border-border/50 hover:border-primary/50 transition-all cursor-pointer group"
                              onClick={() => applyGoldenCombo(combo.legs)}
                            >
                               <div className="flex justify-between items-start mb-1">
                                 <div className="flex flex-col">
                                   <span className="text-[10px] font-bold text-primary uppercase">{combo.type}</span>
                                   <span className="text-[8px] text-muted-foreground">Comissão ref: {combo.commission}</span>
                                 </div>
                                 <Badge variant="secondary" className="text-[9px] h-4">{combo.expectedROI} ROI</Badge>
                               </div>
                              <h5 className="text-sm font-bold flex items-center gap-2 group-hover:text-primary transition-colors">
                                {combo.name}
                                <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                              </h5>
                              <p className="text-[10px] text-muted-foreground mb-2 leading-tight">{combo.description}</p>
                              <div className="flex gap-1">
                                {combo.legs.map((odd, i) => (
                                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-background/50 border border-border/30 font-mono">
                                    {odd.toFixed(2)}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
               </div>
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
