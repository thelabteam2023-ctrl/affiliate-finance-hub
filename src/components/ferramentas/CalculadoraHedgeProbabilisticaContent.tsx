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
   Plus, Trash2, Info, ChevronRight, Zap, BarChart3, HelpCircle, GripVertical,
   CheckCircle2, Lightbulb, BookOpen, FlaskConical, BrainCircuit,
   ShieldAlert, Coins, Sparkles, Wand2, Dna, LineChart, History,
   Trophy, Star, ArrowRight, RefreshCcw
 } from 'lucide-react';
 import {
   DndContext,
   closestCenter,
   KeyboardSensor,
   PointerSensor,
   useSensor,
   useSensors,
   DragEndEvent
 } from '@dnd-kit/core';
 import {
   arrayMove,
   SortableContext,
   sortableKeyboardCoordinates,
   verticalListSortingStrategy,
   useSortable,
   rectSortingStrategy
 } from '@dnd-kit/sortable';
 import { CSS } from '@dnd-kit/utilities';
 import { restrictToWindowEdges } from '@dnd-kit/modifiers';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
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

  interface SortableCardProps {
    id: string;
    children: React.ReactNode;
  }

  const SortableCard: React.FC<SortableCardProps> = ({ id, children }) => {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging
    } = useSortable({ id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      zIndex: isDragging ? 50 : 'auto',
      opacity: isDragging ? 0.5 : 1,
    };

    return (
      <div ref={setNodeRef} style={style} className="h-full">
        <div className="relative h-full group">
          <div 
            {...attributes} 
            {...listeners}
            className="absolute top-3 right-3 p-1 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10 hover:bg-muted rounded"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          {children}
        </div>
      </div>
    );
  };

  const LAB_DEFAULT_LAYOUT = [
    'visual-sim',
    'double-bankroll',
    'lab-params',
    'advanced-stats',
    'efficiency-matrix',
    'risk-ruin',
    'capital-efficiency',
    'lab-details',
    'golden-library',
    'restricted-golden-library'
  ];
   const [maxLabTotalOdd, setMaxLabTotalOdd] = useState<number>(() => {
     const saved = localStorage.getItem('hedge-calc-lab-max-odd');
     return saved ? Number(saved) : 8.0;
   });

   useEffect(() => {
     localStorage.setItem('hedge-calc-lab-max-odd', maxLabTotalOdd.toString());
   }, [maxLabTotalOdd]);


  export const CalculadoraHedgeProbabilisticaContent: React.FC = () => {
   const [labLayout, setLabLayout] = useState<string[]>(() => {
     const saved = localStorage.getItem('hedge-calc-lab-layout');
     return saved ? JSON.parse(saved) : LAB_DEFAULT_LAYOUT;
   });

   useEffect(() => {
     localStorage.setItem('hedge-calc-lab-layout', JSON.stringify(labLayout));
   }, [labLayout]);

   const sensors = useSensors(
     useSensor(PointerSensor, {
       activationConstraint: {
         distance: 8,
       },
     }),
     useSensor(KeyboardSensor, {
       coordinateGetter: sortableKeyboardCoordinates,
     })
   );

   const handleDragEnd = (event: DragEndEvent) => {
     const { active, over } = event;
     if (over && active.id !== over.id) {
       setLabLayout((items) => {
         const oldIndex = items.indexOf(active.id as string);
         const newIndex = items.indexOf(over.id as string);
         return arrayMove(items, oldIndex, newIndex);
       });
     }
   };

   const applyGoldenCombo = (comboLegs: number[]) => {
     const newLegs = comboLegs.map((odd, i) => ({
       name: `Evento ${i + 1}`,
       backOdd: odd,
       layOdd: odd
     }));
      setLegs(newLegs);
      // Removido o redirecionamento para manter o usuário no Laboratório
    };


  const [maxLabTotalOdd, setMaxLabTotalOdd] = useState<number>(() => {
    const saved = localStorage.getItem('hedge-calc-lab-max-odd');
    return saved ? Number(saved) : 8.0;
  });

  useEffect(() => {
    localStorage.setItem('hedge-calc-lab-max-odd', maxLabTotalOdd.toString());
  }, [maxLabTotalOdd]);

  const restrictedGoldenCombinations = useMemo(() => {
    const targets = [0.65, 0.70, 0.75];
    const result: any[] = [];
    const commDec = commission / 100;
    const commonOdds = [1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.2, 2.4, 2.6, 2.8, 3.0];

    targets.forEach(target => {
      [2, 3, 4, 5].forEach(numLegs => {
        let bestROE = -Infinity;
        let bestROECombo: number[] = [];

        commonOdds.forEach(baseOdd => {
          commonOdds.forEach(anchorOdd => {
            const candidateLegs = Array(numLegs - 1).fill(baseOdd).concat(anchorOdd);
            const totalOdd = candidateLegs.reduce((a, b) => a * b, 1);

            if (totalOdd <= maxLabTotalOdd) {
              const m = HedgeProbabilisticoEngine.calculateMetrics(
                candidateLegs.map(o => ({ name: '', backOdd: o, layOdd: o })),
                100,
                commDec,
                target
              );

              if (m.allWonProfit > 0 && m.maxResponsibility > 0) {
                const roe = m.totalEV / m.maxResponsibility;
                if (roe > bestROE) {
                  bestROE = roe;
                  bestROECombo = candidateLegs;
                }
              }
            }
          });
        });

        if (bestROECombo.length > 0) {
          const m = HedgeProbabilisticoEngine.calculateMetrics(
            bestROECombo.map(o => ({ name: '', backOdd: o, layOdd: o })),
            100,
            commDec,
            target
          );
          result.push({
            numLegs,
            target: (target * 100).toFixed(0) + '%',
            legs: bestROECombo,
            roi: fmtPct(m.totalROI),
            roe: (m.totalEV / m.maxResponsibility * 100).toFixed(1) + '%',
            totalOdd: bestROECombo.reduce((a, b) => a * b, 1).toFixed(2)
          });
        }
      });
    });
    return result;
  }, [commission, maxLabTotalOdd]);

  const [freebet, setFreebet] = useState(100);
  const [commission, setCommission] = useState(2.8);
   const [targetExtraction, setTargetExtraction] = useState(0.7);
  const [showHelp, setShowHelp] = useState(false);

  const goldenCombinationsByExtraction = useMemo(() => {
    const targets = Array.from(new Set([0.65, 0.70, 0.75, Number(targetExtraction.toFixed(2))])).sort();
    const result: Record<string, any[]> = {};
    
    // Amostra de odds comuns no mercado para teste
    const commonOdds = [1.5, 1.6, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2, 2.4, 2.6, 2.8, 3.0, 3.5, 4.0, 5.0, 6.0];
    const commDec = commission / 100;

    targets.forEach(target => {
      const optimizations: any[] = [];
      
      // Para cada número de pernas (2 a 5)
      [2, 3, 4, 5].forEach(numLegs => {
        let bestROE = -Infinity;
        let bestROI = -Infinity;
        let roeCombo: number[] = [];
        let roiCombo: number[] = [];

        // Simplificação matemática: testamos pernas iguais + uma perna final variável (âncora)
        // Isso cobre 90% dos cenários de eficiência prática
        commonOdds.forEach(baseOdd => {
          commonOdds.forEach(anchorOdd => {
            const candidateLegs = Array(numLegs - 1).fill(baseOdd).concat(anchorOdd);
            const m = HedgeProbabilisticoEngine.calculateMetrics(
              candidateLegs.map(o => ({ name: '', backOdd: o, layOdd: o })),
              100,
              commDec,
              target
            );

            if (m.allWonProfit > 0 && m.maxResponsibility > 0) {
              const roe = m.totalEV / m.maxResponsibility;
              const roi = m.totalROI;

              if (roe > bestROE) {
                bestROE = roe;
                roeCombo = candidateLegs;
              }
              if (roi > bestROI) {
                bestROI = roi;
                roiCombo = candidateLegs;
              }
            }
          });
        });

        // Adiciona os dois vencedores matemáticos para esta quantidade de pernas
        if (roeCombo.length > 0) {
          const mROE = HedgeProbabilisticoEngine.calculateMetrics(roeCombo.map(o => ({ name: '', backOdd: o, layOdd: o })), 100, commDec, target);
          optimizations.push({
            name: `${numLegs} Pernas (Eficiência)`,
            legs: roeCombo,
            roi: fmtPct(mROE.totalROI),
            roe: (mROE.totalEV / mROE.maxResponsibility * 100).toFixed(1) + '%',
            type: "Eficiência de Capital",
            description: "Melhor retorno por real exposto na Exchange."
          });
        }

        if (roiCombo.length > 0 && JSON.stringify(roiCombo) !== JSON.stringify(roeCombo)) {
          const mROI = HedgeProbabilisticoEngine.calculateMetrics(roiCombo.map(o => ({ name: '', backOdd: o, layOdd: o })), 100, commDec, target);
          optimizations.push({
            name: `${numLegs} Pernas (ROI Max)`,
            legs: roiCombo,
            roi: fmtPct(mROI.totalROI),
            roe: (mROI.totalEV / mROI.maxResponsibility * 100).toFixed(1) + '%',
            type: "Alta Performance",
            description: "Máxima extração bruta da Freebet."
          });
        }
      });

      result[target.toFixed(2)] = optimizations;
    });

    return result;
  }, [commission, targetExtraction]);

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

    const optimalConfig = useMemo(() => {
      let bestEV = -Infinity;
      let bestTarget = 0.7;
      // Análise Sólida de Background: 10.000 variações testadas
      const minTarget = 0.60;
      const maxTarget = 0.95;
      const steps = 10000;
      const stepSize = (maxTarget - minTarget) / steps;

      for (let i = 0; i <= steps; i++) {
        const t = minTarget + (i * stepSize);
        const m = HedgeProbabilisticoEngine.calculateMetrics(legs, freebet, commission / 100, t);
        if (m.allWonProfit > 0 && m.maxResponsibility <= bankroll) {
          if (m.totalEV > bestEV) {
            bestEV = m.totalEV;
            bestTarget = t;
          }
        }
      }
      return { target: bestTarget, ev: bestEV };
    }, [legs, freebet, commission, bankroll]);

    const monteCarloSim = useMemo(() => {
      const numTraj = 100000;
      const maxSteps = 1000; // Máximo de bilhetes por trajetória
      const ceiling = simMode === 'capped' ? bankroll * bankrollCeilingMultiplier : Infinity;
      
      let totalBankruptcies = 0;
      let bankruptciesIn10 = 0;
      let totalDoubleups = 0;
      let doubleupSteps: number[] = [];
      let cumulativeOutcome = 0;
      const samples: number[] = [];
      
      // Pré-calcula a CDF dos cenários para performance
      const cdf = metrics.aggregatedScenarios.map((s, i, arr) => ({
        ...s,
        upper: arr.slice(0, i + 1).reduce((sum, current) => sum + current.probability, 0)
      }));

      for (let t = 0; t < numTraj; t++) {
        let currentBank = bankroll;
        let broken = false;
        
        for (let step = 0; step < maxSteps; step++) {
          // Sorteia cenário
          const rand = Math.random();
          const scenario = cdf.find(s => rand <= s.upper) || cdf[cdf.length - 1];
          const outcome = scenario.result;
          
          // Verifica se pode pagar a exposição do próximo bilhete
          // A exposição máxima é necessária ANTES de saber o resultado do bilhete
          if (currentBank < metrics.maxResponsibility) {
            totalBankruptcies++;
            if (step < 10) bankruptciesIn10++;
            broken = true;
            break;
          }

          currentBank += outcome;
          if (currentBank > ceiling) currentBank = ceiling;

          // Coleta amostra dos primeiros 10 eventos da primeira trajetória para o UI
          if (t === 0 && samples.length < 10) {
            samples.push(outcome);
          }
          if (t === 0) cumulativeOutcome += outcome;

          if (currentBank >= bankroll * 2) {
            totalDoubleups++;
            doubleupSteps.push(step + 1);
            break;
          }
          
          if (currentBank <= 0) {
            totalBankruptcies++;
            if (step < 10) bankruptciesIn10++;
            broken = true;
            break;
          }
        }
      }

      const winRate = metrics.aggregatedScenarios
        .filter(s => s.result > 0)
        .reduce((acc, s) => acc + s.probability, 0);
      
      // Mediana de passos para dobrar
      const sortedSteps = [...doubleupSteps].sort((a, b) => a - b);
      const medianSteps = sortedSteps.length > 0 
        ? sortedSteps[Math.floor(sortedSteps.length / 2)] 
        : Math.ceil(bankroll / Math.max(0.01, metrics.totalEV));

      return {
        trials: numTraj,
        avgResult: metrics.totalEV,
        winRate,
        bankruptcies: totalBankruptcies,
        riskOfRuin: (totalBankruptcies / numTraj) * 100,
        riskOfRuin10: (bankruptciesIn10 / numTraj) * 100,
        probDouble: (totalDoubleups / numTraj) * 100,
        medianSteps,
        samples
      };
    }, [metrics, bankroll, simMode, bankrollCeilingMultiplier]);

    const longTermSim = useMemo(() => {
      const cycles = 100000;
      const step = 5;
      const trajectory = [];
      const ceiling = simMode === 'capped' ? bankroll * bankrollCeilingMultiplier : Infinity;
      
      let currentBank = bankroll;
      const cdf = metrics.aggregatedScenarios.map((s, i, arr) => ({
        ...s,
        upper: arr.slice(0, i + 1).reduce((sum, current) => sum + current.probability, 0)
      }));

      trajectory.push({ cycle: 0, balance: currentBank });

      for (let i = 1; i <= cycles; i++) {
        if (currentBank < metrics.maxResponsibility || currentBank <= 0) {
          currentBank = 0;
          if (i % step === 0 && i <= 1000) trajectory.push({ cycle: i, balance: 0 });
          continue;
        }

        const rand = Math.random();
        const scenario = cdf.find(s => rand <= s.upper) || cdf[cdf.length - 1];
        currentBank += scenario.result;
        if (currentBank > ceiling) currentBank = ceiling;

        if (i % step === 0 && i <= 1000) {
          trajectory.push({ cycle: i, balance: Math.max(0, currentBank) });
        }
      }

      return trajectory;
    }, [metrics, bankroll, simMode, bankrollCeilingMultiplier]);
    const riskOfRuin = monteCarloSim.riskOfRuin;

    const heatmapData = useMemo(() => {
      const extractionTargets = [0.60, 0.65, 0.70, 0.75, 0.80];
      const oddsRange = [1.5, 2.0, 2.5, 3.0, 3.5, 4.0];
      const results: any[] = [];

      extractionTargets.forEach(target => {
        oddsRange.forEach(odd => {
          const testLegs = legs.map(l => ({ ...l, backOdd: odd, layOdd: odd }));
          const m = HedgeProbabilisticoEngine.calculateMetrics(testLegs, freebet, commission / 100, target);
          
          const roe = m.maxResponsibility > 0 ? (m.totalEV / m.maxResponsibility) : 0;
          const score = m.allWonProfit > 0 ? (roe * 100) : -10;
          
          results.push({
            target,
            odd,
            score,
            roi: m.totalROI,
            isValid: m.allWonProfit > 0 && m.maxResponsibility <= bankroll
          });
        });
      });
      return results;
    }, [legs, freebet, commission, bankroll]);

    const advancedStats = useMemo(() => {
      const winRate = monteCarloSim.winRate;
      const lossRate = 1 - winRate;
      
      // 1. Sequências (Greens e Reds)
      const prob10Greens = Math.pow(winRate, 10);
      const prob10Reds = Math.pow(lossRate, 10);

      // 2. Desvio Padrão da Operação (Variação de lucro/prejuízo)
      const mean = metrics.totalEV;
      const variance = metrics.aggregatedScenarios.reduce((acc, s) => {
        return acc + s.probability * Math.pow(s.result - mean, 2);
      }, 0);
      const stdDev = Math.sqrt(variance);

      // 3. Fator de Recuperação (Quantos ganhos médios para pagar 1 perda média)
      const avgWin = metrics.aggregatedScenarios.filter(s => s.result > 0).reduce((acc, s, _, arr) => acc + (s.result * s.probability), 0) / winRate;
      const avgLoss = Math.abs(metrics.aggregatedScenarios.filter(s => s.result < 0).reduce((acc, s) => acc + (s.result * s.probability), 0) / (lossRate || 1));
      const recoveryFactor = avgLoss / (avgWin || 1);

      // 4. Expectativa Kelly (Fração Sugerida da Banca)
      // b = odd líquida (lucro/risco), p = prob sucesso, q = prob falha
      // f = (bp - q) / b
      const b = avgWin / (avgLoss || 1);
      const kelly = b > 0 ? (b * winRate - lossRate) / b : 0;

      // 5. Probabilidade de Lucro em 100 Ciclos (Teorema do Limite Central)
      // Z = (X - n*mean) / (sqrt(n) * stdDev)
      // Para X = 0 (ponto de equilíbrio)
      const n = 100;
      const z = (0 - n * mean) / (Math.sqrt(n) * stdDev);
      // Função de distribuição cumulativa normal aproximada
      const probProfit100 = 1 - (0.5 * (1 + Math.tanh(0.79788456 * (z + 0.035677408 * Math.pow(z, 3)))));

      return {
        prob10Greens,
        prob10Reds,
        stdDev,
        recoveryFactor,
        kelly: Math.max(0, kelly),
        probProfit100
      };
    }, [metrics, monteCarloSim.winRate]);

    const finalScore = useMemo(() => {
      const roi = metrics.totalROI;
      const ror = riskOfRuin;
      const drawdownRatio = metrics.maxDrawdown / bankroll;
      
      let score: 'excellent' | 'good' | 'risky' | 'critical' = 'good';
      let reason = "Equilíbrio adequado entre lucro e segurança.";

      if (ror > 20 || metrics.allWonProfit < 0 || roi < 30) {
        score = 'critical';
        reason = ror > 20 ? "Risco de Ruína extremamente alto." : "Operação inviável ou ROI muito baixo.";
      } else if (ror > 5 || drawdownRatio > 0.4 || roi < 50) {
        score = 'risky';
        reason = ror > 5 ? "Risco de Ruína considerável para esta banca." : "Drawdown elevado ou extração mediana.";
      } else if (roi > 75 && ror < 1 && drawdownRatio < 0.15) {
        score = 'excellent';
        reason = "Alta eficiência de extração com risco controlado.";
      } else {
        score = 'good';
      }

      return { score, reason };
    }, [metrics, riskOfRuin, bankroll]);

    const scoreColor = {
      excellent: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
      good: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      risky: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
      critical: 'bg-red-500/15 text-red-400 border-red-500/30'
    }[finalScore.score];

    const scoreLabel = {
      excellent: 'Excelente',
      good: 'Boa',
      risky: 'Arriscada',
      critical: 'Crítica'
    }[finalScore.score];
 
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
              <div className="flex items-center gap-2">
                <CardInfoTooltip 
                  title={`Score: ${scoreLabel}`}
                  description={finalScore.reason + " O score avalia ROI, Risco de Ruína e o Drawdown em relação à sua banca."}
                />
                <Badge className={`px-4 py-1 text-sm border ${scoreColor}`}>
                  Score: {scoreLabel}
                </Badge>
              </div>
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
             <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
               <SortableContext items={labLayout} strategy={rectSortingStrategy}>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-min">
                   {labLayout.map((layoutId) => {

                     if (layoutId === 'visual-sim') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="bg-emerald-500/5 border-emerald-500/20 overflow-hidden h-full">
                           <div className="bg-emerald-500/10 px-4 py-2 border-b border-emerald-500/20">
                             <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                               <CheckCircle2 className="h-3 w-3" /> Simulação Visual
                             </h4>
                           </div>
                           <CardContent className="pt-4 space-y-4">
                             <div className="flex items-end gap-1 h-24 mb-6 items-baseline">
                               {monteCarloSim.samples.map((s, i) => {
                                 const height = Math.min(100, Math.max(20, (Math.abs(s) / Math.max(metrics.allWonProfit, Math.abs(metrics.maxDrawdown))) * 100));
                                 return (
                                   <div key={i} className={`flex-1 rounded-t-sm transition-all cursor-help relative group ${s >= 0 ? 'bg-emerald-500/40 hover:bg-emerald-400' : 'bg-red-500/40 hover:bg-red-400'}`} style={{ height: `${height}%` }} />
                                 );
                               })}
                             </div>
                             <p className="text-[10px] text-muted-foreground italic border-t border-border/40 pt-2">Amostra da variância em 10 ciclos.</p>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'double-bankroll') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/20 space-y-3 h-full flex flex-col justify-center">
                           <div className="flex items-center gap-2">
                             <TrendingUp className="h-4 w-4 text-orange-400" />
                             <h4 className="text-xs font-bold uppercase tracking-wider text-orange-400">Projeção: Dobra</h4>
                           </div>
                           <div className="grid grid-cols-2 gap-4">
                             <div className="space-y-1">
                               <span className="text-[9px] text-muted-foreground uppercase">Eventos</span>
                               <p className="text-lg font-bold text-white font-mono">{monteCarloSim.medianSteps}</p>
                             </div>
                             <div className="space-y-1 text-right">
                               <span className="text-[9px] text-muted-foreground uppercase">Prob. Sucesso</span>
                               <p className={`text-lg font-bold font-mono ${monteCarloSim.probDouble > 70 ? 'text-emerald-400' : 'text-orange-400'}`}>{fmtPct(monteCarloSim.probDouble)}</p>
                             </div>
                           </div>
                         </div>
                       </SortableCard>
                     );
                     if (layoutId === 'lab-params') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="h-full">
                           <CardHeader>
                             <CardTitle className="text-sm font-medium flex items-center gap-2">
                               <Coins className="h-4 w-4 text-primary" /> Parâmetros do Laboratório
                             </CardTitle>
                           </CardHeader>
                           <CardContent className="space-y-4">
                             <div className="space-y-3">
                               <Label className="text-[10px] uppercase font-bold text-muted-foreground">Benchmark</Label>
                               <Tabs value={labBenchmark} onValueChange={(val) => { setLabBenchmark(val); if (val !== 'custom') setTargetExtraction(Number(val) / 100); }} className="w-full">
                                 <TabsList className="grid grid-cols-4 h-9 w-full">
                                   <TabsTrigger value="65" className="text-[10px]">65%</TabsTrigger>
                                   <TabsTrigger value="70" className="text-[10px]">70%</TabsTrigger>
                                   <TabsTrigger value="75" className="text-[10px]">75%</TabsTrigger>
                                   <TabsTrigger value="custom" className="text-[10px]">Livre</TabsTrigger>
                                 </TabsList>
                               </Tabs>
                             </div>
                             <div className="space-y-2">
                               <Label className="text-[10px] uppercase font-bold text-primary">Banca Exchange</Label>
                               <div className="relative">
                                 <Input type="number" value={bankroll} onChange={(e) => setBankroll(Number(e.target.value))} className="h-10 pl-8 font-mono text-sm" />
                                 <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">R$</span>
                               </div>
                             </div>

                             <div className="space-y-2 pt-2 border-t border-border/30">
                               <div className="flex justify-between items-center">
                                 <Label className="text-[10px] uppercase font-bold text-orange-400">Limite de Odd (Múltipla)</Label>
                                 <span className="text-xs font-mono font-bold text-white">{maxLabTotalOdd}x</span>
                               </div>
                               <Slider 
                                 value={[maxLabTotalOdd]} 
                                 min={2} max={30} step={0.5}
                                 onValueChange={(vals) => setMaxLabTotalOdd(vals[0])}
                               />
                               <p className="text-[8px] text-muted-foreground italic leading-tight">
                                 Filtra a Biblioteca de Ouro para respeitar o teto de odd da sua casa.
                               </p>
                             </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'advanced-stats') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="bg-primary/5 border-primary/20 h-full">
                           <CardHeader className="pb-2">
                             <CardTitle className="text-sm font-medium flex items-center gap-2">
                               <Sparkles className="h-4 w-4 text-primary" /> Estatísticas Avançadas
                             </CardTitle>
                           </CardHeader>
                           <CardContent className="space-y-3">
                             <div className="p-2 rounded-lg bg-background/40 border border-border/40 flex justify-between items-center">
                               <span className="text-[10px] uppercase font-bold text-muted-foreground">10 Greens</span>
                               <span className="text-sm font-bold font-mono text-emerald-400">{fmtPct(advancedStats.prob10Greens * 100)}</span>
                             </div>
                             <div className="p-2 rounded-lg bg-background/40 border border-border/40 flex justify-between items-center">
                               <span className="text-[10px] uppercase font-bold text-muted-foreground">10 Reds</span>
                               <span className="text-sm font-bold font-mono text-red-400">{(advancedStats.prob10Reds * 100).toFixed(4)}%</span>
                             </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'efficiency-matrix') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="border-primary/20 bg-primary/5 h-full">
                           <CardHeader className="pb-2 text-center">
                             <CardTitle className="text-[10px] font-medium flex items-center justify-center gap-2">
                               <BrainCircuit className="h-3 w-3 text-primary" /> Matriz de Eficiência
                             </CardTitle>
                           </CardHeader>
                           <CardContent className="p-2">
                             <div className="grid grid-cols-7 gap-1">
                               <div className="text-[6px] text-muted-foreground font-bold flex items-center justify-center">O\E</div>
                               {[0.60, 0.65, 0.70, 0.75, 0.80].map(t => <div key={t} className="text-[6px] text-muted-foreground font-mono text-center">{Math.round(t*100)}%</div>)}
                               {[1.5, 2.0, 2.5, 3.0, 3.5, 4.0].map(odd => (
                                 <React.Fragment key={odd}>
                                   <div className="text-[6px] text-muted-foreground font-mono flex items-center justify-center bg-muted/20 rounded">{odd.toFixed(1)}</div>
                                   {[0.60, 0.65, 0.70, 0.75, 0.80].map(target => {
                                      const cell = heatmapData.find(d => d.target === target && d.odd === odd);
                                      const score = cell?.score || 0;
                                      const isValid = cell?.isValid;
                                      return <div key={`${target}-${odd}`} className={`aspect-square rounded-[1px] flex items-center justify-center text-[5px] font-mono border border-white/5 ${isValid ? (score > 5 ? 'bg-emerald-500/30' : 'bg-blue-500/20') : 'bg-red-500/5'}`}>{isValid ? score.toFixed(0) : 'X'}</div>
                                   })}
                                 </React.Fragment>
                               ))}
                             </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'risk-ruin') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="border-l-4 border-l-red-500 h-full">
                           <CardHeader className="pb-1">
                             <CardTitle className="text-xs font-medium flex items-center gap-2 text-red-400">
                               <ShieldAlert className="h-4 w-4" /> Risco de Ruína
                             </CardTitle>
                           </CardHeader>
                           <CardContent>
                             <div className="text-xl font-bold font-mono">{fmtPct(riskOfRuin)}</div>
                             <div className="mt-1 w-full h-1 bg-muted rounded-full overflow-hidden">
                               <div className={`h-full ${riskOfRuin > 10 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${riskOfRuin}%` }} />
                             </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'capital-efficiency') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="border-l-4 border-l-emerald-500 h-full">
                           <CardHeader className="pb-1">
                             <CardTitle className="text-xs font-medium flex items-center gap-2 text-emerald-400">
                               <BrainCircuit className="h-4 w-4" /> Eficiência
                             </CardTitle>
                           </CardHeader>
                           <CardContent>
                             <div className="text-xl font-bold font-mono">{fmtPct((metrics.maxResponsibility / bankroll) * 100)}</div>
                             <p className="text-[8px] text-muted-foreground mt-1">Uso da banca (R$ {fmt(metrics.maxResponsibility)})</p>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'lab-details') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="h-full">
                           <CardHeader className="pb-1">
                             <CardTitle className="text-xs font-medium flex items-center gap-2">
                               <Dna className="h-4 w-4 text-primary" /> Dados do Lab
                             </CardTitle>
                           </CardHeader>
                           <CardContent className="space-y-1">
                              <div className="p-1 bg-muted/20 rounded border border-border/50 text-[9px]">
                                 Lucro Médio: <span className="font-bold text-emerald-400">R$ {fmt(monteCarloSim.avgResult)}</span>
                              </div>
                              <div className="p-1 bg-muted/20 rounded border border-border/50 text-[9px]">
                                 Win Rate: <span className="font-bold text-blue-400">{fmtPct(monteCarloSim.winRate * 100)}</span>
                              </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     if (layoutId === 'golden-library') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="h-full border-dashed">
                           <CardHeader className="pb-1">
                             <CardTitle className="text-xs font-medium flex items-center gap-2">
                               <Trophy className="h-4 w-4 text-yellow-400" /> Biblioteca
                             </CardTitle>
                           </CardHeader>
                           <CardContent>
                             <p className="text-[9px] text-muted-foreground leading-tight">Sugestões otimizadas para seu benchmark de {Math.round(targetExtraction * 100)}%.</p>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                     return null;

                     if (layoutId === 'restricted-golden-library') return (
                       <SortableCard key={layoutId} id={layoutId}>
                         <Card className="h-full border-dashed border-orange-500/50 bg-orange-500/5">
                           <CardHeader className="pb-1">
                             <CardTitle className="text-xs font-medium flex items-center gap-2 text-orange-400">
                               <ShieldAlert className="h-4 w-4" /> Lab: Limite de Odd ({maxLabTotalOdd}x)
                             </CardTitle>
                           </CardHeader>
                           <CardContent className="space-y-2">
                             <div className="text-[9px] text-muted-foreground leading-tight mb-2">
                               Sugestões otimizadas para casas com limite de odd total.
                             </div>
                             <div className="space-y-1 max-h-[150px] overflow-y-auto pr-1">
                               {restrictedGoldenCombinations.filter(c => c.target === (Number(targetExtraction) * 100).toFixed(0) + '%').map((combo, idx) => (
                                 <div 
                                   key={idx} 
                                   className="p-1.5 rounded bg-background/40 border border-orange-500/20 cursor-pointer hover:border-orange-500/50 transition-colors"
                                   onClick={() => applyGoldenCombo(combo.legs)}
                                 >
                                   <div className="flex justify-between items-center mb-1">
                                      <span className="text-[8px] font-bold text-orange-400">{combo.numLegs} Pernas</span>
                                      <span className="text-[8px] font-mono text-white">Odd: {combo.totalOdd}</span>
                                   </div>
                                   <div className="flex flex-wrap gap-0.5">
                                      {combo.legs.map((o, i) => (
                                        <span key={i} className="text-[7px] px-1 bg-muted rounded border border-border/50">{o.toFixed(2)}</span>
                                      ))}
                                   </div>
                                   <div className="flex justify-between mt-1 text-[7px] text-muted-foreground uppercase font-bold">
                                      <span>ROI: {combo.roi}</span>
                                      <span>ROE: {combo.roe}</span>
                                   </div>
                                 </div>
                               ))}
                             </div>
                           </CardContent>
                         </Card>
                       </SortableCard>
                     );
                   })}
                 </div>
               </SortableContext>
             </DndContext>
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
