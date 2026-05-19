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
     <div 
       ref={setNodeRef} 
       style={style} 
       className={`relative group ${isDragging ? 'ring-2 ring-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.2)] rounded-lg' : ''}`}
     >
       <div 
         {...attributes} 
         {...listeners} 
         className="absolute top-3 right-3 p-1 rounded hover:bg-muted/50 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity z-10"
       >
         <GripVertical className="h-3 w-3 text-muted-foreground" />
       </div>
       {children}
     </div>
   );
 };
 
 export const CalculadoraHedgeProbabilisticaContent: React.FC = () => {
   const [labLayout, setLabLayout] = useState<string[]>(() => {
     const saved = localStorage.getItem('hedge-calc-lab-layout');
     return saved ? JSON.parse(saved) : [
       'simulation-visual',
       'projection-double',
       'lab-parameters',
       'doctor-insights',
       'efficiency-matrix'
     ];
   });

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
 
   const handleLabDragEnd = (event: DragEndEvent) => {
     const { active, over } = event;
     if (over && active.id !== over.id) {
       setLabLayout((items) => {
         const oldIndex = items.indexOf(active.id as string);
         const newIndex = items.indexOf(over.id as string);
         const newLayout = arrayMove(items, oldIndex, newIndex);
         localStorage.setItem('hedge-calc-lab-layout', JSON.stringify(newLayout));
         return newLayout;
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

  const [freebet, setFreebet] = useState(100);
  const [commission, setCommission] = useState(2.8);
   const [targetExtraction, setTargetExtraction] = useState(0.7);
  const [labBenchmark, setLabBenchmark] = useState<string>('70');
   const [bankroll, setBankroll] = useState(5000);
   const [simMode, setSimMode] = useState<'accumulative' | 'capped'>('accumulative');
   const [bankrollCeilingMultiplier, setBankrollCeilingMultiplier] = useState(5);
   const [activeTab, setActiveTab] = useState('calculadora');
 
   const [liveInput, setLiveInput] = useState<LiveHedgeInput>({
     layOdd: 3.00,
     backOddActual: 2.70,
     backOddProjected: 3.00,
     backStake: 100,
     commission: 2.0
   });

  const ODDS_RULESETS = useMemo(() => [
    {
      id: "standard",
      label: "1.50 → 10.00",
      minOdd: 1.5,
      maxOdd: 10,
      description: "Alta flexibilidade, maior ROI potencial.",
      variance: "Alta",
      efficiency: "Média"
    },
    {
      id: "restricted_medium",
      label: "1.80 → 8.00",
      minOdd: 1.8,
      maxOdd: 8,
      description: "Equilíbrio entre risco e retorno.",
      variance: "Média",
      efficiency: "Alta"
    },
    {
      id: "restricted_high",
      label: "2.00 → 5.00",
      minOdd: 2,
      maxOdd: 5,
      description: "Restritivo, menor volatilidade.",
      variance: "Baixa",
      efficiency: "Máxima"
    },
    {
      id: "unlimited",
      label: "1.50 → Ilimitado",
      minOdd: 1.5,
      maxOdd: null,
      description: "Exploração total de mercados.",
      variance: "Extrema",
      efficiency: "Variável"
    },
    {
      id: "custom",
      label: "Personalizado",
      minOdd: 1.5,
      maxOdd: 10,
      description: "Defina suas próprias regras.",
      variance: "-",
      efficiency: "-"
    }
  ], []);

  const [activeRulesetId, setActiveRulesetId] = useState<string>(() => {
    return localStorage.getItem('hedge-calc-active-ruleset') || "standard";
  });

  const [customRules, setCustomRules] = useState(() => {
    const saved = localStorage.getItem('hedge-calc-custom-rules');
    return saved ? JSON.parse(saved) : { minOdd: 1.5, maxOdd: 15, maxLegs: 5 };
  });

  useEffect(() => {
    localStorage.setItem('hedge-calc-active-ruleset', activeRulesetId);
  }, [activeRulesetId]);

  useEffect(() => {
    localStorage.setItem('hedge-calc-custom-rules', JSON.stringify(customRules));
  }, [customRules]);

  const [legs, setLegs] = useState<LegInput[]>([
    { name: 'Evento 1', backOdd: 2.0, layOdd: 2.0 },
    { name: 'Evento 2', backOdd: 2.0, layOdd: 2.0 }
  ]);
  const [expanded, setExpanded] = useState<AggregatedScenario | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const goldenCombinationsByExtraction = useMemo(() => {
    const targets = Array.from(new Set([0.65, 0.70, 0.75, Number(targetExtraction.toFixed(2))])).sort();
    const result: Record<string, any[]> = {};
    const commDec = commission / 100;

    const activeRuleset = ODDS_RULESETS.find(r => r.id === activeRulesetId) || ODDS_RULESETS[0];
    const minOdd = activeRulesetId === 'custom' ? customRules.minOdd : activeRuleset.minOdd;
    const maxOdd = activeRulesetId === 'custom' ? customRules.maxOdd : (activeRuleset.maxOdd || 30);
    const maxLegs = activeRulesetId === 'custom' ? customRules.maxLegs : 5;

    /**
     * Constrói um grid denso de odds dentro da faixa permitida.
     * Usa passos não-lineares: mais resolução nas odds baixas (onde 0.05 importa)
     * e passos maiores nas odds altas (onde 0.05 é irrelevante).
     * Densidade controlada por `density`: 'fine' | 'medium' | 'coarse'.
     */
    const buildOddGrid = (min: number, max: number, density: 'fine' | 'medium' | 'coarse'): number[] => {
      const cap = Math.min(max, 30);
      const lo = Math.max(1.01, min);
      const out = new Set<number>();
      const push = (o: number) => {
        const rounded = Math.round(o * 100) / 100;
        if (rounded >= lo - 1e-9 && rounded <= cap + 1e-9) out.add(rounded);
      };
      const step = (from: number, to: number, s: number) => {
        for (let o = from; o <= to + 1e-9; o = Math.round((o + s) * 100) / 100) push(o);
      };
      if (density === 'fine') {
        step(1.50, 2.50, 0.05);
        step(2.60, 4.00, 0.10);
        step(4.25, 6.00, 0.25);
        step(6.50, 10.0, 0.50);
        step(11.0, 15.0, 1.00);
        step(17.5, cap,  2.50);
      } else if (density === 'medium') {
        step(1.50, 2.50, 0.10);
        step(2.75, 4.00, 0.25);
        step(4.50, 6.00, 0.50);
        step(7.00, 10.0, 1.00);
        step(12.0, cap,  2.00);
      } else {
        [1.50,1.65,1.80,2.00,2.25,2.50,3.00,3.50,4.00,5.00,6.50,8.00,10.0,12.0,15.0,20.0,30.0]
          .forEach(push);
      }
      // Garante âncoras da faixa
      push(lo); push(cap); push((lo + cap) / 2);
      return Array.from(out).sort((a, b) => a - b);
    };

    // Densidade decai conforme o número de pernas cresce (combinatória explode)
    const gridForLegs = (n: number) => {
      if (n <= 2) return buildOddGrid(minOdd, maxOdd, 'fine');
      if (n === 3) return buildOddGrid(minOdd, maxOdd, 'medium');
      return buildOddGrid(minOdd, maxOdd, 'coarse');
    };

    /** Avalia uma combinação (ordem importa: cascata acumula responsabilidade). */
    const evaluate = (combo: number[], target: number) => {
      const m = HedgeProbabilisticoEngine.calculateMetrics(
        combo.map(o => ({ name: '', backOdd: o, layOdd: o })),
        100,
        commDec,
        target,
      );
      if (!(m.allWonProfit > 0) || !(m.maxResponsibility > 0)) return null;
      return { m, roe: m.totalEV / m.maxResponsibility, roi: m.totalROI };
    };

    targets.forEach(target => {
      const optimizations: any[] = [];
     const legCounts = Array.from({ length: maxLegs }, (_, i) => i + 1);

      // Cache do melhor combo (ROE/ROI) por nº de pernas, para uso na expansão gulosa
      const bestByLegs: Record<number, { roe?: number[]; roi?: number[] }> = {};

      legCounts.forEach(numLegs => {
        let bestROE = -Infinity;
        let bestROI = -Infinity;
        let roeCombo: number[] = [];
        let roiCombo: number[] = [];

        const consider = (combo: number[]) => {
          const r = evaluate(combo, target);
          if (!r) return;
          if (r.roe > bestROE) { bestROE = r.roe; roeCombo = combo.slice(); }
          if (r.roi > bestROI) { bestROI = r.roi; roiCombo = combo.slice(); }
        };

        const grid = gridForLegs(numLegs);

        if (numLegs === 1) {
          grid.forEach(o => consider([o]));
        } else if (numLegs <= 4) {
          // Enumeração completa (ordem importa). 4 pernas com grid coarse (~17) = 83.5k combos
          const rec = (depth: number, acc: number[]) => {
            if (depth === numLegs) { consider(acc); return; }
            for (const o of grid) { acc.push(o); rec(depth + 1, acc); acc.pop(); }
          };
          rec(0, []);
        } else {
          // Expansão gulosa a partir dos melhores combos de (numLegs - 1)
          const seeds: number[][] = [];
          const prev = bestByLegs[numLegs - 1];
          if (prev?.roe) seeds.push(prev.roe);
          if (prev?.roi && (!prev.roe || JSON.stringify(prev.roi) !== JSON.stringify(prev.roe))) seeds.push(prev.roi);
          // Fallback se não houver semente
          if (seeds.length === 0) seeds.push(Array(numLegs - 1).fill(grid[0]));

          seeds.forEach(seed => {
            // Tenta inserir cada odd em cada posição
            for (let pos = 0; pos <= seed.length; pos++) {
              for (const o of grid) {
                const combo = [...seed.slice(0, pos), o, ...seed.slice(pos)];
                consider(combo);
              }
            }
            // Tenta também substituir 1 perna do seed (refinamento local)
            for (let i = 0; i < seed.length; i++) {
              for (const o of grid) {
                const combo = seed.slice();
                combo[i] = o;
                // adiciona âncora para chegar em numLegs
                combo.push(grid[grid.length - 1]);
                consider(combo);
              }
            }
          });
        }

        bestByLegs[numLegs] = { roe: roeCombo, roi: roiCombo };

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
  }, [commission, targetExtraction, activeRulesetId, customRules, ODDS_RULESETS]);

  const metrics: HedgeResult = useMemo(() => {
    return HedgeProbabilisticoEngine.calculateMetrics(
      legs, 
      freebet, 
      commission / 100, 
       targetExtraction
     );
   }, [legs, freebet, commission, targetExtraction]);

   const addLeg = () => {
     const maxLegs = activeRulesetId === 'custom' ? customRules.maxLegs : 6;
     if (legs.length >= maxLegs) return;
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
 
     const liveResults = useMemo(() => LiveHedgeEngine.calculate(liveInput), [liveInput]);
 
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
