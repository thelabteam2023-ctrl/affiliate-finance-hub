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
     Sliders, Settings2, ShieldCheck, ZapOff, Infinity as InfinityIcon
 } from 'lucide-react';
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
        layOdd: Number((odd * (1 + oddSpread / 100)).toFixed(2))
      }));
      setLegs(newLegs);
    };

  const [freebet, setFreebet] = useState(100);
  const [commission, setCommission] = useState(2.8);
  const [oddSpread, setOddSpread] = useState(0);
   const [targetExtraction, setTargetExtraction] = useState(0.7);
  const [labBenchmark, setLabBenchmark] = useState<string>('70');
   const [bankroll, setBankroll] = useState(5000);
   const [simMode, setSimMode] = useState<'accumulative' | 'capped'>('accumulative');
   const [bankrollCeilingMultiplier, setBankrollCeilingMultiplier] = useState(5);
   const [activeTab, setActiveTab] = useState('calculadora');
   const [seqN, setSeqN] = useState<number>(10);

   const ODDS_RULESETS = useMemo(() => [
     { id: "150_05", label: "1.50 → 5", minOdd: 1.5, maxOdd: 5, description: "Curto alcance, alta densidade.", variance: "Baixa", efficiency: "Máxima" },
     { id: "150_06", label: "1.50 → 6", minOdd: 1.5, maxOdd: 6, description: "Equilíbrio em odds baixas.", variance: "Baixa", efficiency: "Alta" },
     { id: "150_08", label: "1.50 → 8", minOdd: 1.5, maxOdd: 8, description: "Alcance médio padrão.", variance: "Média", efficiency: "Média" },
     { id: "150_10", label: "1.50 → 10", minOdd: 1.5, maxOdd: 10, description: "Flexibilidade total de entrada.", variance: "Alta", efficiency: "Média" },
     { id: "160_05", label: "1.60 → 5", minOdd: 1.6, maxOdd: 5, description: "Filtro conservador inicial.", variance: "Baixa", efficiency: "Máxima" },
     { id: "160_06", label: "1.60 → 6", minOdd: 1.6, maxOdd: 6, description: "Filtro moderado.", variance: "Baixa", efficiency: "Alta" },
     { id: "170_05", label: "1.70 → 5", minOdd: 1.7, maxOdd: 5, description: "Filtro seletivo curto.", variance: "Baixa", efficiency: "Máxima" },
     { id: "170_06", label: "1.70 → 6", minOdd: 1.7, maxOdd: 6, description: "Filtro seletivo médio.", variance: "Média", efficiency: "Alta" },
     { id: "180_06", label: "1.80 → 6", minOdd: 1.8, maxOdd: 6, description: "Alta seletividade.", variance: "Média", efficiency: "Máxima" },
     { id: "180_08", label: "1.80 → 8", minOdd: 1.8, maxOdd: 8, description: "Equilíbrio profissional.", variance: "Média", efficiency: "Alta" },
     { id: "200_05", label: "2.00 → 5", minOdd: 2, maxOdd: 5, description: "Filtro restritivo máximo.", variance: "Mínima", efficiency: "Máxima" },
     { id: "200_06", label: "2.00 → 6", minOdd: 2, maxOdd: 6, description: "Risco controlado.", variance: "Mínima", efficiency: "Alta" },
     { id: "unlimited", label: "1.50 → ∞", minOdd: 1.5, maxOdd: null, description: "Exploração total.", variance: "Extrema", efficiency: "Variável" },
     { id: "custom", label: "Custom", minOdd: 1.5, maxOdd: 10, description: "Manual.", variance: "-", efficiency: "-" }
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
        combo.map(o => ({ 
          name: '', 
          backOdd: o, 
          layOdd: Number((o * (1 + oddSpread / 100)).toFixed(2)) 
        })),
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
       const samples: { outcome: number; type: 'lay' | 'back' }[] = [];
      
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
             const isBackWin = !scenario.canonicalPath.includes('lost');
             samples.push({ 
               outcome, 
               type: isBackWin ? 'back' : 'lay' 
             });
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
      
      // 1. Sequências (Perspectiva Bolsa/Lay conforme solicitado)
      // Green na Bolsa = Bater no Lay em qualquer perna (Ciclo interrompido com lucro via Lay)
      // Red na Bolsa = Não bater no Lay (Bater todas as pernas no Back)
      const probAllWonBack = metrics.aggregatedScenarios.find(
        s => !s.canonicalPath.includes('lost')
      )?.probability ?? 0;
      const probLayWinCycle = 1 - probAllWonBack;
      const safeN = Math.max(1, Math.min(100, Math.floor(seqN || 1)));
      const probNGreens = Math.pow(probLayWinCycle, safeN);
      const probNReds = Math.pow(probAllWonBack, safeN);

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
        probNGreens,
        probNReds,
        seqN: safeN,
        stdDev,
        recoveryFactor,
        kelly: Math.max(0, kelly),
        probProfit100
      };
    }, [metrics, monteCarloSim.winRate, seqN]);

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
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-4 xl:col-span-3 space-y-6">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                     onDragEnd={handleLabDragEnd}
                    modifiers={[restrictToVerticalAxis, restrictToWindowEdges]}
                  >
                    <SortableContext 
                      items={labLayout}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-4">
                        {labLayout.map((id) => (
                          <SortableLabCard key={id} id={id}>
                            {id === 'simulation-visual' && (
                              <Card className="bg-emerald-500/5 border-emerald-500/20 overflow-hidden">
                                <div className="bg-emerald-500/10 px-4 py-2 border-b border-emerald-500/20">
                                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                                    <CheckCircle2 className="h-3 w-3" /> Simulação Visual de 100 Mil Ciclos
                                  </h4>
                                </div>
                                <CardContent className="pt-4 space-y-4">
                                  <div className="flex items-end gap-1 h-24 mb-10 items-baseline">
                                     {monteCarloSim.samples.map((s, i) => {
                                       const val = s.outcome;
                                       const height = Math.min(100, Math.max(20, (Math.abs(val) / Math.max(metrics.allWonProfit, Math.abs(metrics.maxDrawdown))) * 100));
                                       const isWin = val >= 0;
                                      return (
                                        <div 
                                          key={i} 
                                          className={`flex-1 rounded-t-sm transition-all cursor-help relative group ${isWin ? 'bg-emerald-500/40 hover:bg-emerald-400' : 'bg-red-500/40 hover:bg-red-400'}`}
                                          style={{ height: `${height}%` }}
                                        >
                                           <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-popover text-[9px] text-popover-foreground rounded border border-border shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none z-[60] whitespace-nowrap">
                                            <div className="font-bold">{isWin ? 'LUCRO' : 'PREJUÍZO'}</div>
                                             <div>Resultado: R$ {fmt(val)}</div>
                                             <div className={`font-bold ${s.type === 'lay' ? 'text-blue-400' : 'text-orange-400'}`}>TIPO: {s.type.toUpperCase()}</div>
                                             <div className="text-muted-foreground font-mono italic">Evento #{i + 1}</div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                  <div className="flex justify-between text-[9px] text-muted-foreground uppercase font-medium">
                                    <span>Início</span>
                                    <span>Amostra da Variância de Longo Prazo</span>
                                    <span>Fim</span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground leading-relaxed italic border-t border-border/40 pt-2">
                                    Passe o mouse sobre as barras para ver o resultado de cada ciclo individual.
                                  </p>
                                </CardContent>
                              </Card>
                            )}

                            {id === 'projection-double' && (
                              <div className="p-4 rounded-lg bg-orange-500/5 border border-orange-500/20 space-y-3">
                                <div className="flex items-center gap-2">
                                  <TrendingUp className="h-4 w-4 text-orange-400" />
                                  <h4 className="text-xs font-bold uppercase tracking-wider text-orange-400">Projeção: Dobrar a Banca</h4>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                   <div className="space-y-1">
                                     <span className="text-[9px] text-muted-foreground uppercase">Eventos Necessários</span>
                                     <p className="text-lg font-bold text-white font-mono">
                                       {monteCarloSim.medianSteps}
                                     </p>
                                   </div>
                                   <div className="space-y-1 text-right">
                                     <span className="text-[9px] text-muted-foreground uppercase">Prob. de Sucesso</span>
                                     <p className={`text-lg font-bold font-mono ${monteCarloSim.probDouble > 70 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                       {fmtPct(monteCarloSim.probDouble)}
                                     </p>
                                   </div>
                                 </div>
                                  <div className="text-[10px] text-muted-foreground leading-relaxed italic border-t border-border/40 pt-2 space-y-3">
                                    <p>
                                      <strong>Hipótese de Reinvestimento:</strong> Esta simulação assume que você <strong>não realiza saques</strong>, reinvestindo 100% dos lucros para compor a banca (Juros Compostos).
                                    </p>
                                    <p>
                                      {metrics.totalEV > 0 
                                        ? "Em cenários de EV+, a banca tende ao infinito, mas a variância pode causar ruína se a exposição for alta." 
                                        : "Atenção: Em cenários de EV negativo, a quebra é estatisticamente inevitável no longo prazo."}
                                    </p>
                                    <p>
                                      Para dobrar a banca (ganhar R$ {fmt(bankroll)}), a mediana necessária é de <strong>{monteCarloSim.medianSteps} eventos</strong>, com <strong>{fmtPct(monteCarloSim.probDouble)}</strong> de chance de sucesso antes da quebra.
                                    </p>
                                  </div>
                              </div>
                            )}

                            {id === 'lab-parameters' && (
                              <Card>
                                <CardHeader>
                                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <Coins className="h-4 w-4 text-primary" /> Parâmetros do Laboratório
                                  </CardTitle>
                                </CardHeader>
                                 <CardContent className="space-y-4">
                                    <div className="space-y-3">
                                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Referência de Extração (Benchmark)</Label>
                                      <Tabs 
                                        value={labBenchmark} 
                                        onValueChange={(val) => {
                                          setLabBenchmark(val);
                                          if (val !== 'custom') setTargetExtraction(Number(val) / 100);
                                        }} 
                                        className="w-full"
                                      >
                                        <TabsList className="grid grid-cols-4 h-9 w-full">
                                          <TabsTrigger value="65" className="text-[10px]">65%</TabsTrigger>
                                          <TabsTrigger value="70" className="text-[10px]">70%</TabsTrigger>
                                          <TabsTrigger value="75" className="text-[10px]">75%</TabsTrigger>
                                          <TabsTrigger value="custom" className="text-[10px]">Livre</TabsTrigger>
                                        </TabsList>
                                      </Tabs>
                                      <div className="p-2 rounded bg-muted/30 border border-border/50">
                                        <p className="text-[9px] text-muted-foreground leading-tight italic">
                                          {labBenchmark === '65' && "Conservador: Menor exposição na Exchange, maior segurança para bancas pequenas."}
                                          {labBenchmark === '70' && "Equilibrado: O padrão ouro da indústria para extração sustentável."}
                                          {labBenchmark === '75' && "Agressivo: Maior lucro por freebet, exige banca robusta para suportar a variância."}
                                          {labBenchmark === 'custom' && "Manual: Ajuste livre conforme sua estratégia específica."}
                                        </p>
                                      </div>
                                    </div>
              
                                    {labBenchmark === 'custom' && (
                                      <div className="space-y-3 p-3 bg-muted/20 border border-border rounded-lg">
                                        <div className="flex justify-between items-center">
                                          <Label className="text-[10px] uppercase font-bold text-primary">Ajuste Manual</Label>
                                          <span className="text-xs font-mono font-bold text-white">{Math.round(targetExtraction * 100)}%</span>
                                        </div>
                                        <Slider 
                                          value={[targetExtraction * 100]} 
                                          min={50} max={95} step={1}
                                          onValueChange={(vals) => setTargetExtraction(vals[0] / 100)}
                                        />
                                      </div>
                                    )}
              
                                    <div className="grid grid-cols-2 gap-4">
                                      <div className="space-y-2">
                                        <div className="flex items-center gap-1.5">
                                          <Label className="text-[10px] uppercase font-bold text-muted-foreground">Valor da Freebet (Base)</Label>
                                          <Link2 className="h-2.5 w-2.5 text-muted-foreground/50" />
                                        </div>
                                        <div className="relative">
                                          <Input 
                                            type="number" 
                                            value={freebet} 
                                            onChange={(e) => setFreebet(Number(e.target.value))}
                                            className="h-10 pl-8 font-mono text-sm"
                                          />
                                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">R$</span>
                                        </div>
                                        <p className="text-[9px] text-muted-foreground italic leading-tight">
                                          Sincronizado com a aba Calculadora.
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
              
                                    <div className="space-y-3 pt-2 border-t border-border/30">
                                      <Label className="text-[10px] uppercase font-bold text-muted-foreground">Modelo de Gestão (Simulação)</Label>
                                      <Tabs 
                                        value={simMode} 
                                        onValueChange={(val) => setSimMode(val as 'accumulative' | 'capped')} 
                                        className="w-full"
                                      >
                                        <TabsList className="grid grid-cols-2 h-9 w-full">
                                          <TabsTrigger value="accumulative" className="text-[10px]">Accumulativa</TabsTrigger>
                                          <TabsTrigger value="capped" className="text-[10px]">Banca Fixa (Teto)</TabsTrigger>
                                        </TabsList>
                                      </Tabs>
                                      
                                      {simMode === 'capped' && (
                                        <div className="space-y-3 p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                                          <div className="flex justify-between items-center">
                                            <Label className="text-[10px] uppercase font-bold text-blue-400">Limite de Crescimento</Label>
                                            <span className="text-xs font-mono font-bold text-white">{bankrollCeilingMultiplier}x Banca</span>
                                          </div>
                                          <Slider 
                                            value={[bankrollCeilingMultiplier]} 
                                            min={1} max={20} step={1}
                                            onValueChange={(vals) => setBankrollCeilingMultiplier(vals[0])}
                                          />
                                          <p className="text-[9px] text-muted-foreground italic leading-tight">
                                            Simula a realidade onde você saca o lucro ao atingir R$ {fmt(bankroll * bankrollCeilingMultiplier)}.
                                          </p>
                                        </div>
                                      )}
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
                                 </CardContent>
                               </Card>
                            )}

                            {id === 'doctor-insights' && (
                              <Card className="bg-primary/5 border-primary/20">
                                <CardHeader className="pb-2">
                                   <CardTitle className="text-sm font-medium flex items-center gap-2">
                                     <LineChart className="h-4 w-4 text-primary" /> Estatística de Operação
                                   </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                  <div className="grid grid-cols-1 gap-3">
                                     <div className="grid grid-cols-2 gap-2">
                                       <div className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/10 space-y-1">
                                         <div className="flex justify-between items-center text-[9px] uppercase font-bold text-emerald-400/70">
                                           <span>Sucesso Financeiro</span>
                                           <CardInfoTooltip
                                             title="Sucesso Financeiro"
                                             description="Probabilidade de o ciclo terminar em lucro (independente de onde bater). No hedge perfeito, este valor é próximo de 100%."
                                           />
                                         </div>
                                         <p className="text-base font-bold font-mono text-emerald-400">
                                           {fmtPct(monteCarloSim.winRate * 100)}
                                         </p>
                                       </div>
                                       <div className="p-2.5 rounded-lg bg-blue-500/5 border border-blue-500/10 space-y-1">
                                         <div className="flex justify-between items-center text-[9px] uppercase font-bold text-blue-400/70">
                                           <span>Extração Bolsa</span>
                                           <CardInfoTooltip
                                             title="Extração na Bolsa (Lay)"
                                             description="Probabilidade de o valor ser transferido da casa para a bolsa neste ciclo (Lay vencedor)."
                                           />
                                         </div>
                                         <p className="text-base font-bold font-mono text-blue-400">
                                           {fmtPct((1 - (metrics.aggregatedScenarios.find(s => !s.canonicalPath.includes('lost'))?.probability ?? 0)) * 100)}
                                         </p>
                                       </div>
                                     </div>

                                     <div className="grid grid-cols-2 gap-2">
                                       <div className="p-2.5 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                         <div className="flex justify-between items-center text-[9px] uppercase font-bold text-muted-foreground">
                                           <span>Seq. {advancedStats.seqN} Bolsa</span>
                                           <CardInfoTooltip
                                             title={`Sequência ${advancedStats.seqN} Greens (Bolsa)`}
                                             description={`Probabilidade de ${advancedStats.seqN} ciclos seguidos vencerem na Bolsa (Lay), com base na taxa implícita das odds atuais. Ajuste N no campo acima.`}
                                           />
                                         </div>
                                         <p className="text-base font-bold font-mono text-emerald-400">
                                           {fmtPct(advancedStats.probNGreens * 100)}
                                         </p>
                                       </div>
                                       <div className="p-2.5 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                         <div className="flex justify-between items-center text-[9px] uppercase font-bold text-muted-foreground">
                                           <span>Seq. {advancedStats.seqN} Casa</span>
                                           <CardInfoTooltip
                                             title={`Sequência ${advancedStats.seqN} Casa (Back)`}
                                             description={`Probabilidade de ${advancedStats.seqN} ciclos seguidos baterem integralmente na Casa (Back). Cenário raro em odds de extração.`}
                                           />
                                         </div>
                                         <p className="text-base font-bold font-mono text-orange-400">
                                           {(advancedStats.probNReds * 100).toFixed(6)}%
                                         </p>
                                       </div>
                                     </div>
              
                                    <div className="p-3 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                      <div className="flex justify-between items-center text-[10px] uppercase font-bold text-muted-foreground">
                                        <span>Fator de Recuperação</span>
                                        <CardInfoTooltip 
                                          title="Fator de Recuperação" 
                                          description="Quantas operações vitoriosas (em média) são necessárias para cobrir o prejuízo de uma única operação perdedora."
                                        />
                                      </div>
                                      <p className="text-lg font-bold font-mono text-blue-400">
                                        {advancedStats.recoveryFactor.toFixed(2)} ops
                                      </p>
                                    </div>
              
                                    <div className="p-3 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                      <div className="flex justify-between items-center text-[10px] uppercase font-bold text-muted-foreground">
                                        <span>Crescimento (100 Ciclos)</span>
                                        <CardInfoTooltip 
                                          title="Probabilidade de Lucro" 
                                          description="Chance de você estar no lucro após completar um bloco de 100 operações, considerando a variância e o EV esperado."
                                        />
                                      </div>
                                      <p className={`text-lg font-bold font-mono ${advancedStats.probProfit100 > 0.8 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                        {fmtPct(advancedStats.probProfit100 * 100)}
                                      </p>
                                    </div>
              
                                    <div className="p-3 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                      <div className="flex justify-between items-center text-[10px] uppercase font-bold text-muted-foreground">
                                        <span>Kelly Sugerido (Risco)</span>
                                        <CardInfoTooltip 
                                          title="Critério de Kelly" 
                                          description="Teoria matemática de otimização de banca. Sugere a porcentagem máxima da banca que deveria ser exposta neste cenário específico."
                                        />
                                      </div>
                                      <p className="text-lg font-bold font-mono text-primary">
                                        {fmtPct(advancedStats.kelly * 100)}
                                      </p>
                                    </div>
                                  </div>
              
                                  <p className="text-[9px] text-muted-foreground italic leading-tight text-center mt-2">
                                    "No mundo probabilístico, a sorte é apenas o resíduo de um bom design estatístico."
                                  </p>
                                </CardContent>
                              </Card>
                            )}

                            {id === 'efficiency-matrix' && (
                              <Card className="border-primary/20 bg-primary/5">
                                <CardHeader className="pb-2">
                                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                                    <BrainCircuit className="h-4 w-4 text-primary" /> Matriz de Eficiência
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                  <div className="grid grid-cols-7 gap-1">
                                    <div className="text-[8px] text-muted-foreground uppercase font-bold flex items-center justify-center">Odd \ Ext</div>
                                    {[0.60, 0.65, 0.70, 0.75, 0.80].map(t => (
                                      <div key={t} className="text-[8px] text-muted-foreground font-mono text-center">{Math.round(t*100)}%</div>
                                    ))}
                                    
                                    {[1.5, 2.0, 2.5, 3.0, 3.5, 4.0].map(odd => (
                                      <React.Fragment key={odd}>
                                        <div className="text-[8px] text-muted-foreground font-mono flex items-center justify-center bg-muted/20 rounded">{odd.toFixed(1)}</div>
                                        {[0.60, 0.65, 0.70, 0.75, 0.80].map(target => {
                                          const cell = heatmapData.find(d => d.target === target && d.odd === odd);
                                          const score = cell?.score || 0;
                                          const isValid = cell?.isValid;
                                          
                                          let bgColor = "bg-muted/10";
                                          if (isValid) {
                                            if (score > 10) bgColor = "bg-emerald-500/40";
                                            else if (score > 5) bgColor = "bg-emerald-500/20";
                                            else if (score > 0) bgColor = "bg-blue-500/20";
                                            else bgColor = "bg-yellow-500/10";
                                          } else {
                                            bgColor = "bg-red-500/5";
                                          }

                                          return (
                                            <button
                                              key={`${target}-${odd}`}
                                              onClick={() => {
                                                setTargetExtraction(target);
                                                setLegs(legs.map(l => ({ ...l, backOdd: odd, layOdd: odd })));
                                              }}
                                              className={`aspect-square rounded-[2px] flex items-center justify-center text-[7px] font-mono transition-all hover:scale-110 hover:z-10 cursor-pointer border border-white/5 ${bgColor} ${Math.abs(targetExtraction - target) < 0.01 && Math.abs(legs[0].backOdd - odd) < 0.01 ? 'ring-1 ring-primary border-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]' : ''}`}
                                              title={`Extração ${Math.round(target*100)}% | Odd ${odd.toFixed(2)} | Score: ${score.toFixed(1)}`}
                                            >
                                              {isValid ? score.toFixed(0) : 'X'}
                                            </button>
                                          );
                                        })}
                                      </React.Fragment>
                                    ))}
                                  </div>
                                  <div className="space-y-2">
                                    <div className="flex justify-between items-center text-[10px] uppercase font-bold text-muted-foreground">
                                      <span>Veredito do Doutor</span>
                                      <Trophy className="h-3 w-3 text-yellow-500" />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground leading-tight italic">
                                      {targetExtraction > 0.75 
                                        ? "Você está priorizando o lucro bruto, o que sobrecarrega a sua banca. Considere reduzir a extração para 70% para aumentar o ROE (Retorno sobre Exposição)."
                                        : "Excelente design. Sua extração está equilibrada com as odds, permitindo uma cascata sustentável e menor volatilidade de banca."}
                                    </p>
                                  </div>
                                </CardContent>
                              </Card>
                            )}
                           </SortableLabCard>
                         ))}
                       </div>
                     </SortableContext>
                   </DndContext>
                 </div>

                  <div className="lg:col-span-8 xl:col-span-9 space-y-6">
                    {/* Fixed Top Metrics */}
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
 
                    <div className="space-y-6">
                      {/* Laboratório de Simulação e Dados */}
                      <Card>
                                  <CardHeader>
                                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                                      <Dna className="h-4 w-4 text-primary" /> Laboratório de Simulação e Dados
                                    </CardTitle>
                                  </CardHeader>
                                  <CardContent className="space-y-6">
                                    <div className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <History className="h-4 w-4 text-primary" />
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Como chegamos neste Risco?</h4>
                                      </div>
                                      <div className="text-xs space-y-2 leading-relaxed">
                                        <p>
                                          O Risco de Ruína ({fmtPct(riskOfRuin)}) é calculado via <strong>Simulação de Trajetória</strong> (Monte Carlo).
                                        </p>
                                        <div className="bg-background/50 p-3 rounded font-mono text-[9px] border border-border/40 leading-relaxed text-muted-foreground">
                                          Diferente de fórmulas estáticas, simulamos 5.000 jornadas reais. O risco aumenta drasticamente se a exposição (R$ {fmt(metrics.maxResponsibility)}) for alta em relação à banca (R$ {fmt(bankroll)}).
                                        </div>
                                        <div className="space-y-4">
                                          <p className="text-muted-foreground italic border-l-2 border-primary/30 pl-3">
                                            A ruína ocorre quando a banca cai para R$ 0 ou se torna insuficiente para cobrir a responsabilidade de R$ {fmt(metrics.maxResponsibility)}.
                                          </p>

                                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            <div className="p-3 bg-muted/20 rounded-md border border-border/50">
                                              <h5 className="text-[10px] font-bold uppercase mb-1 text-primary flex items-center gap-1">
                                                <Zap className="h-3 w-3" /> Dinâmica de EV
                                              </h5>
                                              <p className="text-[9px] text-muted-foreground leading-tight">
                                                {metrics.totalEV > 0 
                                                  ? "O lucro esperado é positivo, mas a exposição agressiva pode forçar a quebra antes da lei dos grandes números atuar." 
                                                  : "O lucro esperado é negativo. Mesmo com sorte no curto prazo, a quebra é matematicamente garantida no infinito."}
                                              </p>
                                            </div>
                                            <div className="p-3 bg-muted/20 rounded-md border border-border/50">
                                              <h5 className="text-[10px] font-bold uppercase mb-1 text-primary flex items-center gap-1">
                                                <RefreshCcw className="h-3 w-3" /> Regra de Saques
                                              </h5>
                                              <p className="text-[9px] text-muted-foreground leading-tight">
                                                {simMode === 'accumulative' 
                                                  ? "Baseada em Banca Fechada: todos os lucros retornam para o capital de giro (juros compostos)." 
                                                  : `Baseada em Banca Fixa: o crescimento é limitado a ${bankrollCeilingMultiplier}x o inicial, simulando saques regulares.`}
                                              </p>
                                            </div>
                                          </div>
                                          
                                          <div className={`p-3 border rounded-md ${monteCarloSim.riskOfRuin10 > 5 ? 'bg-red-500/10 border-red-500/20' : 'bg-muted/30 border-border/50'}`}>
                                            <h5 className={`text-[10px] font-bold uppercase mb-2 flex items-center gap-2 ${monteCarloSim.riskOfRuin10 > 5 ? 'text-red-400' : 'text-muted-foreground'}`}>
                                              <ShieldAlert className="h-3 w-3" /> Horizonte de Curto Prazo (10 Bilhetes)
                                            </h5>
                                            <div className="flex justify-between items-center">
                                              <span className="text-[10px] text-muted-foreground">Prob. de Quebra (Próx. 10):</span>
                                              <span className={`text-sm font-bold ${monteCarloSim.riskOfRuin10 > 5 ? 'text-red-400' : 'text-white'}`}>
                                                {fmtPct(monteCarloSim.riskOfRuin10)}
                                              </span>
                                            </div>
                                            {monteCarloSim.riskOfRuin10 > 5 && (
                                              <p className="text-[9px] text-red-400/80 mt-1 leading-tight">
                                                ⚠️ Perigo: Exposição de {((metrics.maxResponsibility / bankroll) * 100).toFixed(1)}% da banca é crítica para o curto prazo.
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="space-y-4">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <LineChart className="h-4 w-4 text-emerald-400" />
                                          <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Simulação Real (100.000 Trajetórias)</h4>
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
                                          <span className="text-sm font-bold text-white">100.000</span>
                                        </div>
                                      </div>

                                      <div className="space-y-3 bg-muted/20 p-3 rounded-lg border border-border/50">
                                        <div className="flex justify-between items-center">
                                          <p className="text-[10px] font-bold text-muted-foreground uppercase">
                                            Amostra Sequencial (10 Ciclos)
                                          </p>
                                          <div className="text-[10px] font-mono text-white">
                                             Total: <span className={monteCarloSim.samples.reduce((a, b) => a + b.outcome, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                               R$ {fmt(monteCarloSim.samples.reduce((a, b) => a + b.outcome, 0))}
                                            </span>
                                          </div>
                                        </div>
                                         <div className="grid grid-cols-5 gap-1.5">
                                           {Array.from({ length: 10 }).map((_, i) => {
                                             const s = monteCarloSim.samples[i];
                                             const exists = s !== undefined;
                                             return (
                                               <div key={i} className="space-y-1">
                                                 <div 
                                                   className={`text-[9px] py-1 rounded text-center font-mono border transition-all ${
                                                     !exists 
                                                       ? 'bg-muted/10 border-border/20 text-muted-foreground/30' 
                                                       : s.outcome >= 0 
                                                         ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.05)]' 
                                                         : 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.05)]'
                                                   }`}
                                                 >
                                                   {exists ? `R$ ${fmt(s.outcome)}` : '---'}
                                                 </div>
                                                 {exists && (
                                                   <div className={`text-[7px] text-center font-bold uppercase ${s.type === 'lay' ? 'text-blue-400' : 'text-orange-400'}`}>
                                                     {s.type}
                                                   </div>
                                                 )}
                                               </div>
                                             );
                                           })}
                                         </div>
                                        <p className="text-[8px] text-muted-foreground italic leading-tight text-center">
                                          Simulação de uma jornada real de 10 operações consecutivas.
                                        </p>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>

                      {/* Perfil Operacional Ativo */}
                      <Card className="bg-muted/10 border-border/50 shadow-none overflow-hidden">
                                  <div className="p-4 border-b border-border/50 bg-muted/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-primary" />
                                        <h3 className="text-xs font-bold text-white uppercase tracking-wider">Perfil Operacional Ativo</h3>
                                        <Badge variant="outline" className="text-[9px] h-4 text-primary border-primary/30">
                                          Meta: {Math.round(targetExtraction * 100)}%
                                        </Badge>
                                      </div>
                                      <p className="text-[10px] text-muted-foreground mt-1">
                                        Visão dos mil primeiros ciclos (Simulação de 100.000) operando com ROI de {fmtPct(metrics.totalROI)}.
                                      </p>
                                    </div>
                                    <div className="flex gap-4">
                                      <div className="text-right">
                                        <div className="flex items-center justify-end gap-1">
                                          <span className="text-[9px] text-muted-foreground uppercase block">ROE p/ Ciclo</span>
                                          <CardInfoTooltip 
                                            title="ROE — Return on Exposure" 
                                            description="Retorno esperado por ciclo sobre o capital máximo travado em Lays na Exchange. Diferença vs ROI: o ROI mede o lucro sobre o valor da freebet; o ROE mede o lucro sobre o dinheiro real que fica preso na Exchange."
                                          />
                                        </div>
                                        <span className="text-xs font-bold text-emerald-400">+{((metrics.totalEV / metrics.maxResponsibility) * 100).toFixed(2)}%</span>
                                      </div>
                                      <div className="text-right border-l border-border/50 pl-4">
                                        <span className="text-[9px] text-muted-foreground uppercase block">Exposição</span>
                                        <span className="text-xs font-bold text-orange-400">{fmtPct((metrics.maxResponsibility / bankroll) * 100)}</span>
                                      </div>
                                    </div>
                                  </div>
                                  <CardContent className="p-0 h-[220px] w-full relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <AreaChart data={longTermSim} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                                        <defs>
                                          <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                          </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                                        <XAxis 
                                          dataKey="cycle" 
                                          hide={true} 
                                        />
                                        <YAxis 
                                          domain={["auto", "auto"]}
                                          tick={{ fontSize: 9, fill: "#666" }}
                                          tickFormatter={(value) => `R$ ${value >= 1000 ? (value/1000).toFixed(1) + "k" : value}`}
                                          axisLine={false}
                                          tickLine={false}
                                        />
                                        <RechartsTooltip 
                                          contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "4px", fontSize: "10px" }}
                                          labelStyle={{ color: "#666" }}
                                          itemStyle={{ color: "#10b981" }}
                                          formatter={(value: number) => [`R$ ${fmt(Number(value))}`, "Banca"]}
                                          labelFormatter={(label) => `Ciclo: ${label.toLocaleString()}`}
                                        />
                                        <Area 
                                          type="monotone" 
                                          dataKey="balance" 
                                          stroke="#10b981" 
                                          fillOpacity={1} 
                                          fill="url(#colorBalance)" 
                                          strokeWidth={2}
                                        />
                                      </AreaChart>
                                    </ResponsiveContainer>
                                    {longTermSim[longTermSim.length - 1].balance <= 0 && (
                                      <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
                                        <div className="bg-red-500/10 border border-red-500/20 p-2 rounded flex items-center gap-2">
                                          <AlertTriangle className="h-3 w-3 text-red-500" />
                                          <span className="text-[10px] font-bold text-red-500 uppercase tracking-tighter">Banca Insuficiente no Longo Prazo</span>
                                        </div>
                                      </div>
                                    )}
                                  </CardContent>
                                </Card>

                      {/* Biblioteca de Ouro */}
                      <Card>
                                  <CardContent className="pt-6">
                                    <div className="space-y-4">
                                       <div className="space-y-6">
                                         <div className="flex items-center justify-between">
                                           <div className="flex items-center gap-2">
                                             <Trophy className="h-4 w-4 text-yellow-400" />
                                             <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Biblioteca de Ouro Dinâmica</h4>
                                           </div>
                                           <div className="flex flex-col gap-2">
                                             <div className="flex items-center gap-2 justify-end">
                                               <span className="text-[8px] uppercase font-bold text-muted-foreground">Comissão:</span>
                                               <div className="flex gap-1">
                                                 {[2.8, 3.0, 4.8, 6.0].map((c) => (
                                                   <Button 
                                                     key={c}
                                                     variant={commission === c ? "default" : "outline"}
                                                     size="sm"
                                                     className="h-6 text-[8px] px-1.5"
                                                     onClick={() => setCommission(c)}
                                                   >
                                                     {c}%
                                                   </Button>
                                                 ))}
                                               </div>
                                             </div>
                                             <div className="flex items-center gap-3 justify-end">
                                               <div className="flex flex-col items-end">
                                                 <span className="text-[8px] uppercase font-bold text-muted-foreground leading-none">Ajuste de Spread:</span>
                                                 <span className="text-[7px] text-muted-foreground italic text-right">(Diferença Back vs Lay)</span>
                                               </div>
                                               <div className="flex items-center gap-2 w-32">
                                                 <Slider 
                                                   value={[oddSpread]} 
                                                   min={0} max={10} step={0.5}
                                                   onValueChange={(v) => setOddSpread(v[0])}
                                                   className="flex-1"
                                                 />
                                                 <span className="text-[9px] font-mono font-bold text-primary w-6 text-right">{oddSpread}%</span>
                                               </div>
                                             </div>
                                           </div>
                                         </div>

                                         <div className="space-y-4">
                                           <div className="flex flex-col gap-3">
                                             <Label className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-2">
                                               <Sliders className="h-3 w-3" /> Perfil Operacional de Odds
                                             </Label>
                                             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-1.5 p-1 bg-background/30 rounded-lg border border-border/20">
                                               {ODDS_RULESETS.map((preset) => (
                                                 <Button
                                                   key={preset.id}
                                                   variant={activeRulesetId === preset.id ? "default" : "ghost"}
                                                   className={`h-8 text-[9px] uppercase font-bold tracking-tighter px-1 transition-all duration-200 ${
                                                     activeRulesetId === preset.id 
                                                       ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]" 
                                                       : "hover:bg-primary/10 text-muted-foreground"
                                                   }`}
                                                   onClick={() => setActiveRulesetId(preset.id)}
                                                 >
                                                   {preset.label}
                                                 </Button>
                                               ))}
                                             </div>
                                           </div>

                                           {activeRulesetId === 'custom' ? (
                                             <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
                                               <div className="space-y-2">
                                                 <Label className="text-[10px] uppercase font-bold text-muted-foreground">Odd Mínima</Label>
                                                 <div className="flex items-center gap-3">
                                                   <Input 
                                                     type="number" 
                                                     value={customRules.minOdd} 
                                                     onChange={(e) => setCustomRules({...customRules, minOdd: Number(e.target.value)})}
                                                     className="h-8 text-xs font-mono"
                                                   />
                                                   <Slider 
                                                     value={[customRules.minOdd]} 
                                                     min={1.01} max={5} step={0.05}
                                                     onValueChange={(v) => setCustomRules({...customRules, minOdd: v[0]})}
                                                   />
                                                 </div>
                                               </div>
                                               <div className="space-y-2">
                                                 <Label className="text-[10px] uppercase font-bold text-muted-foreground">Odd Máxima</Label>
                                                 <div className="flex items-center gap-3">
                                                   <Input 
                                                     type="number" 
                                                     value={customRules.maxOdd} 
                                                     onChange={(e) => setCustomRules({...customRules, maxOdd: Number(e.target.value)})}
                                                     className="h-8 text-xs font-mono"
                                                   />
                                                   <Slider 
                                                     value={[customRules.maxOdd]} 
                                                     min={2} max={50} step={0.5}
                                                     onValueChange={(v) => setCustomRules({...customRules, maxOdd: v[0]})}
                                                   />
                                                 </div>
                                               </div>
                                               <div className="space-y-2">
                                                 <Label className="text-[10px] uppercase font-bold text-muted-foreground">Máximo de Pernas</Label>
                                                 <div className="flex items-center gap-3">
                                                   <Input 
                                                     type="number" 
                                                     value={customRules.maxLegs} 
                                                     onChange={(e) => setCustomRules({...customRules, maxLegs: Math.min(6, Math.max(2, Number(e.target.value)))})}
                                                     className="h-8 text-xs font-mono"
                                                   />
                                                   <Slider 
                                                     value={[customRules.maxLegs]} 
                                                     min={1} max={6} step={1}
                                                     onValueChange={(v) => setCustomRules({...customRules, maxLegs: v[0]})}
                                                   />
                                                 </div>
                                               </div>
                                             </div>
                                           ) : (
                                             <div className="grid grid-cols-2 md:grid-cols-4 gap-3 animate-in fade-in duration-300">
                                               {ODDS_RULESETS.find(r => r.id === activeRulesetId) && (
                                                 <>
                                                   <div className="p-2.5 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                                     <span className="text-[8px] uppercase font-bold text-muted-foreground block">Variância</span>
                                                     <div className="flex items-center gap-1.5">
                                                        <ShieldCheck className={`h-3 w-3 ${['200_05', '200_06'].includes(activeRulesetId) ? 'text-emerald-400' : 'text-orange-400'}`} />
                                                       <span className="text-xs font-bold text-white">{ODDS_RULESETS.find(r => r.id === activeRulesetId)?.variance}</span>
                                                     </div>
                                                   </div>
                                                   <div className="p-2.5 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                                     <span className="text-[8px] uppercase font-bold text-muted-foreground block">Eficiência</span>
                                                     <div className="flex items-center gap-1.5">
                                                       <Zap className="h-3 w-3 text-blue-400" />
                                                       <span className="text-xs font-bold text-white">{ODDS_RULESETS.find(r => r.id === activeRulesetId)?.efficiency}</span>
                                                     </div>
                                                   </div>
                                                   <div className="p-2.5 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                                     <span className="text-[8px] uppercase font-bold text-muted-foreground block">Flexibilidade</span>
                                                     <div className="flex items-center gap-1.5">
                                                       {activeRulesetId === 'unlimited' ? <InfinityIcon className="h-3 w-3 text-primary" /> : <Settings2 className="h-3 w-3 text-primary" />}
                                                       <span className="text-xs font-bold text-white">
                                                          {['150_10', '150_08'].includes(activeRulesetId) ? 'Alta' : activeRulesetId === 'unlimited' ? 'Total' : 'Moderada'}
                                                       </span>
                                                     </div>
                                                   </div>
                                                   <div className="p-2.5 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                                     <span className="text-[8px] uppercase font-bold text-muted-foreground block">Recomendação</span>
                                                     <span className="text-[9px] text-muted-foreground leading-tight block">
                                                       {activeRulesetId === 'restricted_high' ? 'Ideal para bancas conservadoras.' : 'Foco em maximização de extração.'}
                                                     </span>
                                                   </div>
                                                 </>
                                               )}
                                             </div>
                                           )}
                                         </div>
                                       </div>

                                         <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                           {/* Estratégia de 1 Perna (Hedge Simples) */}
                                           <div 
                                             className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 hover:border-primary/50 transition-all cursor-pointer group flex flex-col justify-between"
                                             onClick={() => {
                                               // Calcula odd ideal para a extração alvo: Odd = 1 / (1 - extração)
                                               // Para 70% de extração, odd ~ 3.33
                                               const idealOdd = Number((1 / (1 - targetExtraction)).toFixed(2));
                                               applyGoldenCombo([idealOdd]);
                                             }}
                                           >
                                             <div>
                                               <div className="flex justify-between items-start mb-1">
                                                 <Badge variant="outline" className="text-[8px] h-4 uppercase text-blue-400 border-blue-400/30">
                                                   Hedge Simples
                                                 </Badge>
                                                 <div className="flex flex-col items-end">
                                                   <span className="text-[10px] font-bold text-white">{fmtPct(targetExtraction * 100)} ROI</span>
                                                   <span className="text-[8px] text-muted-foreground">Extração Direta</span>
                                                 </div>
                                               </div>
                                               <h5 className="text-xs font-bold flex items-center gap-2 group-hover:text-primary transition-colors mt-1">
                                                 1 Perna (Padrão)
                                                 <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                               </h5>
                                               <p className="text-[9px] text-muted-foreground leading-tight mt-1 mb-2">
                                                 Hedge clássico de perna única para extração imediata.
                                               </p>
                                             </div>
                                             <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-border/20">
                                               <span className="text-[9px] px-1.5 py-0.5 rounded bg-background/50 border border-border/30 font-mono">
                                                 {(1 / (1 - targetExtraction)).toFixed(2)}
                                               </span>
                                             </div>
                                           </div>

                                           {(goldenCombinationsByExtraction[targetExtraction.toFixed(2)] || goldenCombinationsByExtraction["0.70"] || []).map((combo, idx) => (
                                             <div 
                                               key={idx} 
                                            className="p-3 rounded-lg bg-muted/20 border border-border/50 hover:border-primary/50 transition-all cursor-pointer group flex flex-col justify-between"
                                            onClick={() => applyGoldenCombo(combo.legs)}
                                          >
                                            <div>
                                              <div className="flex justify-between items-start mb-1">
                                                <Badge variant="outline" className={`text-[8px] h-4 uppercase ${combo.type === 'Eficiência de Capital' ? 'text-blue-400 border-blue-400/30' : 'text-emerald-400 border-emerald-400/30'}`}>
                                                  {combo.type}
                                                </Badge>
                                                <div className="flex flex-col items-end">
                                                  <span className="text-[10px] font-bold text-white">{combo.roi} ROI</span>
                                                  <div className="flex items-center gap-1">
                                                    <span className="text-[8px] text-muted-foreground">ROE: {combo.roe}</span>
                                                    <CardInfoTooltip 
                                                      title="ROE (Return on Exposure)" 
                                                      description="Métrica de eficiência de capital: Lucro Esperado / Responsabilidade Máxima. Indica quanto seu dinheiro na Exchange rende por ciclo."
                                                    />
                                                  </div>
                                                </div>
                                              </div>
                                              <h5 className="text-xs font-bold flex items-center gap-2 group-hover:text-primary transition-colors mt-1">
                                                {combo.name}
                                                <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
                                              </h5>
                                              <p className="text-[9px] text-muted-foreground leading-tight mt-1 mb-2">
                                                {combo.description}
                                              </p>
                                            </div>
                                            <div className="flex flex-wrap gap-1 mt-auto pt-2 border-t border-border/20">
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
                </div>
              )
            }
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
