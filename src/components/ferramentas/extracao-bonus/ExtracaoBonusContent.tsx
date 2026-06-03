import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { calculateScenarios, runMonteCarlo, runSequenceSimulation } from '@/lib/ferramentas/extracao-bonus/engine';
import { ExtractionConfig, SimulationParams, PlannedOp } from '@/lib/ferramentas/extracao-bonus/types';
import { Calculator, Bug, Info, Search } from 'lucide-react';
import { CalculadoraExtração } from './CalculadoraExtração';
import { OtimizadorOdds } from './OtimizadorOdds';
import { PlanejadorIA } from './PlanejadorIA';

const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ExtracaoBonusContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('parametros');
  
  const [config, setConfig] = useState<ExtractionConfig>({
    bonusAmount: 200,
    spread: 3.0,
    exchangeCommission: 5.0,
    model: 'Equilibrado',
    capitalType: 'bonus'
  });

  const [o1, setO1] = useState(2.0);
  const [o2, setO2] = useState(2.0);

  const [optParams, setOptParams] = useState<SimulationParams>({
    meta: 500,
    nOps: 100,
    oddMin: 1.60,
    oddMaxDupla: 10.00,
    nSims: 400,
    initialBanca: 1000
  });

  const [auditTarget, setAuditTarget] = useState<any>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optProgress, setOptProgress] = useState(0);
  const [optResults, setOptResults] = useState<any[]>([]);
  const [optRankTab] = useState<'pMeta'>('pMeta');

  const [sequence, setSequence] = useState<PlannedOp[]>([]);
  const [seqBanca, setSeqBanca] = useState(1000);
  const [seqMeta, setSeqMeta] = useState(500);
  const [seqResult, setSeqResult] = useState<{ probSuccess: number, probFailure: number } | null>(null);

  const sc = useMemo(() => calculateScenarios(config, o1, o2), [config, o1, o2]);
  
  const updateConfig = (key: keyof ExtractionConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const updateOptParams = (key: keyof SimulationParams, value: any) => {
    setOptParams(prev => ({ ...prev, [key]: value }));
  };

  const addOpToSequence = () => {
    const newOp: PlannedOp = {
      id: Math.random().toString(36).substr(2, 9),
      odd1: o1,
      odd2: o2,
      label: `Op ${sequence.length + 1}`
    };
    setSequence([...sequence, newOp]);
  };

  const removeOp = (id: string) => {
    setSequence(sequence.filter(op => op.id !== id));
  };

  const simulateSequence = () => {
    const result = runSequenceSimulation(config, sequence, seqBanca, seqMeta);
    setSeqResult(result);
  };

  const handleOptimize = async () => {
    setIsOptimizing(true);
    setOptProgress(0);
    setOptResults([]);

    const pool = [1.60, 1.65, 1.70, 1.75, 1.80, 1.85, 1.90, 1.95, 2.00, 2.10, 2.20, 2.30, 2.40, 2.50, 2.60, 2.80, 3.00, 3.20, 3.50, 4.00, 4.50, 5.00, 5.50, 6.00, 7.00, 8.00, 9.00, 10.00];
    const combinations: [number, number][] = [];
    
    for (let i = 0; i < pool.length; i++) {
      for (let j = i; j < pool.length; j++) {
        const od1 = pool[i];
        const od2 = pool[j];
        if (od1 >= optParams.oddMin && od2 >= optParams.oddMin && od1 * od2 <= optParams.oddMaxDupla) {
          combinations.push([od1, od2]);
        }
      }
    }

    const total = combinations.length;
    const results: any[] = [];
    const batchSize = 10;

    for (let i = 0; i < total; i += batchSize) {
      const batch = combinations.slice(i, i + batchSize);
      for (const [odd1, odd2] of batch) {
        const mc = runMonteCarlo(config, odd1, odd2, optParams.meta, optParams.nOps, optParams.nSims, optParams.initialBanca || 0);
        const scLocal = calculateScenarios(config, odd1, odd2);
        results.push({
          o1: odd1,
          o2: odd2,
          oMult: odd1 * odd2,
          pMeta: mc.pMeta,
          pQuebra: mc.pQuebra,
          medOps: mc.medOps,
          medSeq: mc.medSeq,
          p50: mc.p50,
          std: mc.stdPerOp,
          eVal: scLocal.eVal,
          sc: scLocal,
          diagnostics: mc.diagnostics
        });
      }
      setOptProgress(Math.round(((i + batchSize) / total) * 100));
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    setOptResults(results);
    setIsOptimizing(false);
  };

  const sortedOptResults = useMemo(() => {
    return [...optResults].sort((a, b) => b[optRankTab] - a[optRankTab]);
  }, [optResults, optRankTab]);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6 pb-20">
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-100">Extração de Bônus — Otimizador</h1>
        <p className="text-slate-400">Maximize sua eficiência com o Planejador IA e Otimizador de Odds.</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 h-12 bg-slate-900/50 border border-slate-800 p-1">
          <TabsTrigger value="parametros" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">Configurações</TabsTrigger>
          <TabsTrigger value="calculadora" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">Calculadora</TabsTrigger>
          <TabsTrigger value="otimizador" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">Otimizador</TabsTrigger>
          <TabsTrigger value="planejador" className="rounded-md data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all">Planejador IA</TabsTrigger>
        </TabsList>
        
        <TabsContent value="parametros" className="space-y-6 pt-6">
          <Card className="border-slate-800 bg-slate-900/50">
            <CardHeader><CardTitle className="text-sm font-bold uppercase text-muted-foreground">Configuração Global</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="text-slate-300">Valor da Stake ($)</Label>
                <Input type="number" value={config.bonusAmount} onChange={e => updateConfig('bonusAmount', Number(e.target.value))} className="bg-slate-950 border-slate-800" />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Modelo de Extração</Label>
                <Select value={config.model} onValueChange={(v: any) => updateConfig('model', v)}>
                  <SelectTrigger className="bg-slate-950 border-slate-800"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-800">
                    <SelectItem value="Equilibrado">Equilibrado (Lucro Fixo)</SelectItem>
                    <SelectItem value="Cascata">Cascata (Proteção Total)</SelectItem>
                    <SelectItem value="Cenário 3 Zero">Cenário 3 Zero (Risco Reduzido)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">Capital</Label>
                <Select value={config.capitalType} onValueChange={(v: any) => updateConfig('capitalType', v)}>
                  <SelectTrigger className="bg-slate-950 border-slate-800"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-950 border-slate-800">
                    <SelectItem value="bonus">Bônus</SelectItem>
                    <SelectItem value="real">Saldo Real</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calculadora" className="space-y-4 pt-6">
          <CalculadoraExtração 
            config={config} 
            o1={o1} setO1={setO1} 
            o2={o2} setO2={setO2} 
            addOpToSequence={addOpToSequence} 
            sc={sc} 
            fmt={fmt} 
          />
        </TabsContent>

        <TabsContent value="otimizador" className="space-y-6 pt-6">
          <OtimizadorOdds 
            optParams={optParams} 
            updateOptParams={updateOptParams} 
            handleOptimize={handleOptimize} 
            isOptimizing={isOptimizing} 
            optProgress={optProgress} 
            sortedOptResults={sortedOptResults} 
            setAuditTarget={setAuditTarget} 
            fmt={fmt} 
          />
        </TabsContent>

        <TabsContent value="planejador" className="space-y-4 pt-6">
          <PlanejadorIA 
            sequence={sequence} 
            seqBanca={seqBanca} setSeqBanca={setSeqBanca} 
            seqMeta={seqMeta} setSeqMeta={setSeqMeta} 
            simulateSequence={simulateSequence} 
            seqResult={seqResult} 
            removeOp={removeOp} 
            config={config} 
            fmt={fmt} 
          />
        </TabsContent>
      </Tabs>

      <Dialog open={!!auditTarget} onOpenChange={(open) => !open && setAuditTarget(null)}>
        <DialogContent className="max-w-2xl bg-slate-950 border-slate-800 text-slate-100 max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-primary">
              <Bug className="w-5 h-5" />
              Relatório de Auditoria e Observabilidade
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              Diagnóstico detalhado da estratégia: {auditTarget?.o1?.toFixed(2)} × {auditTarget?.o2?.toFixed(2)}
            </DialogDescription>
          </DialogHeader>

          {auditTarget && (
            <div className="space-y-6 pt-4">
              <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg space-y-2">
                <h4 className="text-sm font-bold text-blue-400 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Resumo de Diagnóstico (Leigo)
                </h4>
                <div className="text-xs text-slate-300 leading-relaxed space-y-2">
                  <p>
                    Esta simulação rodou <span className="font-bold text-white">{auditTarget.diagnostics.input.nSims} "futuros possíveis"</span>. 
                    Em cada um deles, você tentou fazer até <span className="font-bold text-white">{auditTarget.diagnostics.input.nOps} apostas</span>.
                  </p>
                  <ul className="list-disc pl-4 space-y-1">
                    <li>
                      <span className="font-bold text-emerald-400">Sucesso:</span> Você atingiu o lucro de ${fmt(auditTarget.diagnostics.input.meta)} antes do prazo acabar. Isso aconteceu em <span className="font-bold">{(auditTarget.pMeta * 100).toFixed(1)}%</span> das vezes.
                    </li>
                    <li>
                      <span className="font-bold text-red-400">Quebra:</span> Sua banca da Exchange acabou. O dinheiro migrou para a Casa de Apostas, mas você perdeu a capacidade de continuar protegendo suas apostas.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                  <Calculator className="w-3 h-3" />
                  Estatísticas de Dispersão (Percentis)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {[
                    { label: 'Mínimo', val: auditTarget.diagnostics.stats.min },
                    { label: 'P25', val: auditTarget.diagnostics.stats.p25 },
                    { label: 'Mediana (P50)', val: auditTarget.diagnostics.stats.p50 },
                    { label: 'P75', val: auditTarget.diagnostics.stats.p75 },
                    { label: 'P95', val: auditTarget.diagnostics.stats.p95 },
                    { label: 'Máximo', val: auditTarget.diagnostics.stats.max },
                  ].map((item, i) => (
                    <div key={i} className="p-3 bg-slate-900 rounded border border-slate-800">
                      <p className="text-[9px] text-slate-500 uppercase mb-1">{item.label}</p>
                      <p className={`text-sm font-bold font-mono ${item.val >= (auditTarget.diagnostics.input.initialBanca) ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${fmt(item.val)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
