import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { CardInfoTooltip } from '@/components/ui/card-info-tooltip';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { calculateScenarios, runMonteCarlo, runSequenceSimulation } from '@/lib/ferramentas/extracao-bonus/engine';
import { ExtractionConfig, ExtractionMode, CapitalType, SimulationParams, BancaParams, PlannedOp } from '@/lib/ferramentas/extracao-bonus/types';
import { TrendingUp, Target, Zap, Calculator, Clock, Shield, AlertTriangle, CheckCircle2, Trophy, Medal, Search, Info, Bug, ShieldAlert, ListPlus, Play, Trash2, ArrowRight } from 'lucide-react';

const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const calculateMinOps = (config: ExtractionConfig, meta: number, oddMax: number) => {
  const o1 = Math.sqrt(oddMax);
  const sc = calculateScenarios(config, o1, o1);
  const profit = Math.max(sc.eVal, 1);
  return Math.ceil(meta / profit);
};

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
  const [nSimOps, setNSimOps] = useState(100);

  const [optParams, setOptParams] = useState<SimulationParams>({
    meta: 5000,
    nOps: 100,
    oddMin: 1.60,
    oddMaxDupla: 10.00,
    nSims: 400,
    initialBanca: 1000
  });

  const [auditTarget, setAuditTarget] = useState<any>(null);
  const [globalAlerts, setGlobalAlerts] = useState<string[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optProgress, setOptProgress] = useState(0);
  const [optResults, setOptResults] = useState<any[]>([]);
  const [optRankTab, setOptRankTab] = useState<'pMeta' | 'medSeq' | 'eVal' | 'p50' | 'medOps'>('pMeta');
  const [optIsDirty, setOptIsDirty] = useState(false);

  const [bancaParams, setBancaParams] = useState<BancaParams>({
    initialBanca: 5000,
    lucroDesejado: 5000,
    maxOps: 200,
    nSims: 1000
  });

  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simResult, setSimResult] = useState<any>(null);

  const [sequence, setSequence] = useState<PlannedOp[]>([]);
  const [seqBanca, setSeqBanca] = useState(1000);
  const [seqMeta, setSeqMeta] = useState(500);
  const [seqResult, setSeqResult] = useState<{ probSuccess: number, probFailure: number } | null>(null);

  const sc = useMemo(() => calculateScenarios(config, o1, o2), [config, o1, o2]);
  
  const minOpsRequired = useMemo(() => {
    return calculateMinOps(config, optParams.meta, optParams.oddMaxDupla);
  }, [config, optParams.meta, optParams.oddMaxDupla]);

  const updateConfig = (key: keyof ExtractionConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
    setOptIsDirty(true);
  };

  const updateOptParams = (key: keyof SimulationParams, value: any) => {
    setOptParams(prev => ({ ...prev, [key]: value }));
    setOptIsDirty(true);
  };

  const updateBancaParams = (key: keyof BancaParams, value: any) => {
    setBancaParams(prev => ({ ...prev, [key]: value }));
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
    setOptIsDirty(false);
    setGlobalAlerts([]);

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
    const batchSize = 5;

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

  const handleSimulateBanca = async () => {
    setIsSimulating(true);
    setSimProgress(0);
    const totalSims = bancaParams.nSims;
    const batchSize = 100;
    let allMcResults: any[] = [];

    for (let i = 0; i < totalSims; i += batchSize) {
      const mc = runMonteCarlo(config, o1, o2, bancaParams.lucroDesejado, bancaParams.maxOps, batchSize, bancaParams.initialBanca);
      allMcResults = allMcResults.concat(mc.results);
      setSimProgress(Math.round(((i + batchSize) / totalSims) * 100));
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    const successCount = allMcResults.filter(r => r.hitMeta).length;
    const brokeCount = allMcResults.filter(r => r.broke).length;
    const zoneRiscoCount = allMcResults.filter(r => r.vezSemP2 > 0).length;
    const fatalSemP2Count = allMcResults.filter(r => r.vezFatalSemP2 > 0).length;
    const saldosFinais = allMcResults.map(r => r.saldoFinal).sort((a, b) => a - b);
    const getPercentile = (p: number) => saldosFinais[Math.floor(saldosFinais.length * (p / 100))];

    setSimResult({
      pMeta: successCount / totalSims,
      pQuebra: brokeCount / totalSims,
      pZonaRisco: zoneRiscoCount / totalSims,
      pFatalSemP2: fatalSemP2Count / totalSims,
      percentis: { p10: getPercentile(10), p25: getPercentile(25), p50: getPercentile(50), p75: getPercentile(75), p90: getPercentile(90), p95: getPercentile(95), p99: getPercentile(99) }
    });
    setIsSimulating(false);
  };

  const sortedOptResults = useMemo(() => {
    return [...optResults].sort((a, b) => {
      if (optRankTab === 'medSeq' || optRankTab === 'medOps') return a[optRankTab] - b[optRankTab];
      return b[optRankTab] - a[optRankTab];
    });
  }, [optResults, optRankTab]);

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6 pb-20">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="parametros">Parâmetros</TabsTrigger>
          <TabsTrigger value="calculadora">Calculadora</TabsTrigger>
          <TabsTrigger value="otimizador">Otimizador</TabsTrigger>
          <TabsTrigger value="planejador">Planejador IA</TabsTrigger>
        </TabsList>
        
        <TabsContent value="parametros" className="space-y-6 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm font-bold uppercase text-muted-foreground">Configuração Global</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Valor da Stake ($)</Label>
                <Input type="number" value={config.bonusAmount} onChange={e => updateConfig('bonusAmount', Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Modelo de Extração</Label>
                <Select value={config.model} onValueChange={(v: any) => updateConfig('model', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Equilibrado">Equilibrado (Lucro Fixo)</SelectItem>
                    <SelectItem value="Cascata">Cascata (Proteção Total)</SelectItem>
                    <SelectItem value="Cenário 3 Zero">Cenário 3 Zero (Risco Reduzido)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Capital</Label>
                <Select value={config.capitalType} onValueChange={(v: any) => updateConfig('capitalType', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bonus">Bônus</SelectItem>
                    <SelectItem value="real">Saldo Real</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calculadora" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-xs font-bold uppercase text-muted-foreground">Entrada de Odds</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Odd Perna 1</Label>
                  <Input type="number" step="0.01" value={o1} onChange={e => setO1(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Odd Perna 2</Label>
                  <Input type="number" step="0.01" value={o2} onChange={e => setO2(Number(e.target.value))} />
                </div>
                <Button onClick={addOpToSequence} className="w-full gap-2"><ListPlus className="w-4 h-4" /> Adicionar ao Planejador</Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-xs font-bold uppercase text-muted-foreground">Resultados</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-muted/20 rounded border text-center">
                  <p className="text-[10px] uppercase">Lucro Médio</p>
                  <p className="text-lg font-bold text-emerald-400">${fmt(sc.eVal)}</p>
                </div>
                <div className="p-3 bg-muted/20 rounded border text-center">
                  <p className="text-[10px] uppercase">Risco (C3)</p>
                  <p className="text-lg font-bold text-red-400">${fmt(Math.abs(sc.c3))}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="otimizador" className="space-y-6 pt-4">
          <Card>
            <CardHeader><CardTitle className="text-sm font-bold uppercase text-muted-foreground">Otimizador de Estratégia</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Meta ($)</Label>
                <Input type="number" value={optParams.meta} onChange={e => updateOptParams('meta', Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Banca Inicial ($)</Label>
                <Input type="number" value={optParams.initialBanca} onChange={e => updateOptParams('initialBanca', Number(e.target.value))} />
              </div>
              <div className="flex items-end">
                <Button onClick={handleOptimize} disabled={isOptimizing} className="w-full">
                  {isOptimizing ? 'Otimizando...' : 'Iniciar Otimização'}
                </Button>
              </div>
            </CardContent>
          </Card>
          {isOptimizing && <Progress value={optProgress} />}
          
          <div className="space-y-4">
            {sortedOptResults.map((res, i) => (
              <Card key={i} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setAuditTarget(res)}>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">Estratégia</p>
                      <p className="text-sm font-bold">{res.o1.toFixed(2)} × {res.o2.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">P(Meta)</p>
                      <p className="text-sm font-bold text-emerald-400">{(res.pMeta * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">P(Quebra)</p>
                      <p className="text-sm font-bold text-red-400">{(res.pQuebra * 100).toFixed(1)}%</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-muted-foreground">EV/Op</p>
                      <p className="text-sm font-bold">${fmt(res.eVal)}</p>
                    </div>
                    <div className="flex items-center justify-end">
                      <Search className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="planejador" className="space-y-4 pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-sm font-bold uppercase text-muted-foreground">Configuração da Meta</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Banca Inicial</Label>
                    <Input type="number" value={seqBanca} onChange={e => setSeqBanca(Number(e.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Meta de Lucro</Label>
                    <Input type="number" value={seqMeta} onChange={e => setSeqMeta(Number(e.target.value))} />
                  </div>
                  <Button className="w-full gap-2" disabled={sequence.length === 0} onClick={simulateSequence}>
                    <Play className="w-4 h-4" /> Simular Sequência
                  </Button>
                </CardContent>
              </Card>
              {seqResult && (
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="pt-6 text-center">
                    <p className="text-[10px] uppercase font-bold text-muted-foreground">Probabilidade de Sucesso</p>
                    <p className="text-3xl font-black text-emerald-400">{(seqResult.probSuccess * 100).toFixed(1)}%</p>
                  </CardContent>
                </Card>
              )}
            </div>
            <div className="lg:col-span-2 space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-bold uppercase text-muted-foreground">Minha Estratégia</CardTitle>
                  <Badge variant="outline">{sequence.length} ops</Badge>
                </CardHeader>
                <CardContent className="space-y-2">
                  {sequence.map((op, index) => (
                    <div key={op.id} className="flex items-center gap-3 p-3 bg-muted/20 border rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{index + 1}</div>
                      <div className="flex-1 grid grid-cols-4 gap-4">
                        <div><p className="text-[9px] uppercase text-muted-foreground">Odd P1</p><p className="text-sm font-mono font-bold">{op.odd1.toFixed(2)}</p></div>
                        <div><p className="text-[9px] uppercase text-muted-foreground">Odd P2</p><p className="text-sm font-mono font-bold">{op.odd2.toFixed(2)}</p></div>
                        <div><p className="text-[9px] uppercase text-muted-foreground">EV</p><p className="text-sm font-bold text-emerald-400">${fmt(calculateScenarios(config, op.odd1, op.odd2).eVal)}</p></div>
                        <div><p className="text-[9px] uppercase text-muted-foreground">Risco</p><p className="text-sm font-bold text-red-400">${fmt(Math.abs(calculateScenarios(config, op.odd1, op.odd2).c3))}</p></div>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeOp(op.id)} className="text-red-400"><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: 'Mínimo', val: auditTarget.diagnostics.stats.min },
                    { label: 'P25', val: auditTarget.diagnostics.stats.p25 },
                    { label: 'Mediana (P50)', val: auditTarget.diagnostics.stats.p50 },
                    { label: 'P75', val: auditTarget.diagnostics.stats.p75 },
                    { label: 'P95', val: auditTarget.diagnostics.stats.p95 },
                    { label: 'Máximo', val: auditTarget.diagnostics.stats.max },
                  ].map((item, i) => (
                    <div key={i} className="p-2 bg-slate-900 rounded border border-slate-800">
                      <p className="text-[9px] text-slate-500 uppercase">{item.label}</p>
                      <p className={`text-xs font-bold font-mono ${item.val >= (auditTarget.diagnostics.input.initialBanca) ? 'text-emerald-400' : 'text-red-400'}`}>
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
