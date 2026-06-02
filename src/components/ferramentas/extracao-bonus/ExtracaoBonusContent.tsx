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
import { calculateScenarios, runMonteCarlo } from '@/lib/ferramentas/extracao-bonus/engine';
import { ExtractionConfig, ExtractionMode, CapitalType, SimulationParams, BancaParams } from '@/lib/ferramentas/extracao-bonus/types';
import { TrendingUp, Target, Zap, Calculator, Clock, Shield, AlertTriangle, CheckCircle2, Trophy, Medal } from 'lucide-react';

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const ExtracaoBonusContent: React.FC = () => {
  const [activeTab, setActiveTab] = useState('parametros');
  
  // Parâmetros Globais
  const [config, setConfig] = useState<ExtractionConfig>({
    bonusAmount: 200,
    spread: 3.0,
    exchangeCommission: 5.0,
    model: 'Equilibrado',
    capitalType: 'bonus'
  });

  // Odds Preview
  const [o1, setO1] = useState(2.0);
  const [o2, setO2] = useState(2.0);
  const [nSimOps, setNSimOps] = useState(100);

  // Parâmetros do Otimizador
  const [optParams, setOptParams] = useState<SimulationParams>({
    meta: 5000,
    nOps: 100,
    oddMin: 1.60,
    oddMaxDupla: 10.00,
    nSims: 200
  });

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optProgress, setOptProgress] = useState(0);
  const [optResults, setOptResults] = useState<any[]>([]);
  const [optRankTab, setOptRankTab] = useState<'pMeta' | 'medSeq' | 'eVal' | 'p50' | 'medOps'>('pMeta');

  // Parâmetros de Simulação de Banca
  const [bancaParams, setBancaParams] = useState<BancaParams>({
    initialBanca: 5000,
    lucroDesejado: 5000,
    maxOps: 200,
    nSims: 1000
  });

  const [isSimulating, setIsSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [simResult, setSimResult] = useState<any>(null);

  const sc = useMemo(() => calculateScenarios(config, o1, o2), [config, o1, o2]);

  const updateConfig = (key: keyof ExtractionConfig, value: any) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const updateOptParams = (key: keyof SimulationParams, value: any) => {
    setOptParams(prev => ({ ...prev, [key]: value }));
  };

  const updateBancaParams = (key: keyof BancaParams, value: any) => {
    setBancaParams(prev => ({ ...prev, [key]: value }));
  };

  // Motor do Otimizador
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
    const batchSize = 5;

    for (let i = 0; i < total; i += batchSize) {
      const batch = combinations.slice(i, i + batchSize);
      for (const [odd1, odd2] of batch) {
        const mc = runMonteCarlo(config, odd1, odd2, optParams.meta, optParams.nOps, optParams.nSims);
        const scLocal = calculateScenarios(config, odd1, odd2);
        results.push({
          o1: odd1,
          o2: odd2,
          oMult: odd1 * odd2,
          pMeta: mc.pMeta,
          medOps: mc.medOps,
          medSeq: mc.medSeq,
          p50: mc.p50,
          eVal: scLocal.eVal,
          sc: scLocal
        });
      }
      setOptProgress(Math.round(((i + batchSize) / total) * 100));
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    setOptResults(results);
    setIsOptimizing(false);
  };

  // Simulação de Banca
  const handleSimulateBanca = async () => {
    setIsSimulating(true);
    setSimProgress(0);
    
    // Simulação em lotes para progresso
    const totalSims = bancaParams.nSims;
    const batchSize = 100;
    let allMcResults: any[] = [];

    for (let i = 0; i < totalSims; i += batchSize) {
      const mc = runMonteCarlo(
        config, 
        o1, 
        o2, 
        bancaParams.lucroDesejado, 
        bancaParams.maxOps, 
        batchSize, 
        bancaParams.initialBanca
      );
      allMcResults = allMcResults.concat(mc.results);
      setSimProgress(Math.round(((i + batchSize) / totalSims) * 100));
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    // Calcular agregados
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
      percentis: {
        p10: getPercentile(10),
        p25: getPercentile(25),
        p50: getPercentile(50),
        p75: getPercentile(75),
        p90: getPercentile(90),
        p95: getPercentile(95),
        p99: getPercentile(99)
      }
    });
    
    setIsSimulating(false);
  };

  const sortedOptResults = useMemo(() => {
    return [...optResults].sort((a, b) => {
      if (optRankTab === 'medSeq' || optRankTab === 'medOps') {
        return a[optRankTab] - b[optRankTab];
      }
      return b[optRankTab] - a[optRankTab];
    });
  }, [optResults, optRankTab]);

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6 pb-20">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="parametros">Parâmetros</TabsTrigger>
          <TabsTrigger value="otimizador">Otimizador</TabsTrigger>
          <TabsTrigger value="simulacao">Simulação de Banca</TabsTrigger>
        </TabsList>
        
        <TabsContent value="parametros" className="space-y-6">
          {/* 1.1 Parâmetros Globais */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                Parâmetros Globais da Operação
                <CardInfoTooltip title="Configurações Base" description="Estes valores definem os custos fixos e o modelo de cálculo para toda a ferramenta." />
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Valor apostado ($)</Label>
                <Input 
                  type="number" 
                  value={config.bonusAmount} 
                  onChange={e => updateConfig('bonusAmount', parseFloat(e.target.value) || 0)} 
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs">Spread ({config.spread.toFixed(1)}%)</Label>
                </div>
                <Slider 
                  value={[config.spread]} 
                  min={0} 
                  max={10} 
                  step={0.1} 
                  onValueChange={v => updateConfig('spread', v[0])} 
                />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label className="text-xs">Comissão ({config.exchangeCommission.toFixed(1)}%)</Label>
                </div>
                <Slider 
                  value={[config.exchangeCommission]} 
                  min={0} 
                  max={8} 
                  step={0.1} 
                  onValueChange={v => updateConfig('exchangeCommission', v[0])} 
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Modelo</Label>
                <Select value={config.model} onValueChange={(v: ExtractionMode) => updateConfig('model', v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Equilibrado">Equilibrado</SelectItem>
                    <SelectItem value="Cascata">Cascata</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Capital</Label>
                <Select value={config.capitalType} onValueChange={(v: CapitalType) => updateConfig('capitalType', v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bonus">Bônus (Gratuito)</SelectItem>
                    <SelectItem value="real">Saldo Real</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* 1.2 Prévia Interativa */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">Odd Perna 1 ({o1.toFixed(2)})</Label>
                  </div>
                  <Slider value={[o1]} min={1.3} max={10} step={0.05} onValueChange={v => setO1(v[0])} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <Label className="text-xs">Odd Perna 2 ({o2.toFixed(2)})</Label>
                  </div>
                  <Slider value={[o2]} min={1.3} max={10} step={0.05} onValueChange={v => setO2(v[0])} />
                </div>
              </CardContent>
            </Card>

            {/* 1.4 Bloco Hero do Valor Esperado */}
            <Card className={sc.eVal >= 0 ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'}>
              <CardContent className="pt-6 text-center space-y-2">
                <p className="text-xs text-muted-foreground font-medium uppercase">Valor Esperado por Operação</p>
                <p className={`text-4xl font-bold ${sc.eVal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${fmt(sc.eVal)}
                </p>
                <p className="text-xs text-muted-foreground max-w-[300px] mx-auto leading-relaxed">
                  Em cada operação você pode ganhar ${fmt(Math.max(sc.c1, sc.c2, sc.c3))} ou perder ${fmt(Math.abs(Math.min(sc.c1, sc.c2, sc.c3)))}. 
                  A média por operação converge para ${fmt(sc.eVal)}.
                </p>
                <div className={`inline-flex px-3 py-1 rounded-full text-[10px] font-bold uppercase ${sc.eVal >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {sc.eVal >= 0 ? 'Estratégia lucrativa no longo prazo' : 'Estratégia deficitária — ajuste os parâmetros'}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Os Três Cenários */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-sm">Cenário 1</h4>
                    <p className="text-[10px] text-muted-foreground uppercase">Exch ganha P1</p>
                  </div>
                  <span className="text-xs font-mono font-bold">{(sc.pC1 * 100).toFixed(1)}%</span>
                </div>
                <p className={`text-2xl font-bold ${sc.c1 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${fmt(sc.c1)}</p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">Exchange ganha perna 1 — A dupla morreu no 1º jogo. Bônus extraído.</p>
                <div className="pt-2 border-t text-[10px] text-muted-foreground flex justify-between">
                  <span>Contribuição EV:</span>
                  <span className="font-mono">${fmt(sc.pC1 * sc.c1)}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="pt-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-sm">Cenário 2</h4>
                    <p className="text-[10px] text-muted-foreground uppercase">Exch ganha P2</p>
                  </div>
                  <span className="text-xs font-mono font-bold">{(sc.pC2 * 100).toFixed(1)}%</span>
                </div>
                <p className={`text-2xl font-bold ${sc.c2 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${fmt(sc.c2)}</p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">Exchange ganha perna 2 — 1ª perna passou, dupla morreu no 2º jogo.</p>
                <div className="pt-2 border-t text-[10px] text-muted-foreground flex justify-between">
                  <span>Contribuição EV:</span>
                  <span className="font-mono">${fmt(sc.pC2 * sc.c2)}</span>
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="pt-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="font-bold text-sm">Cenário 3</h4>
                    <p className="text-[10px] text-muted-foreground uppercase">Dupla acerta</p>
                  </div>
                  <span className="text-xs font-mono font-bold">{(sc.pC3 * 100).toFixed(1)}%</span>
                </div>
                <p className={`text-2xl font-bold ${sc.c3 >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${fmt(sc.c3)}</p>
                <p className="text-[10px] leading-relaxed text-muted-foreground">Dupla acerta — Casas pagam, mas a exchange perdeu a responsabilidade.</p>
                <div className="pt-2 border-t text-[10px] text-muted-foreground flex justify-between">
                  <span>Contribuição EV:</span>
                  <span className="font-mono">${fmt(sc.pC3 * sc.c3)}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Probabilidade Visual */}
          <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Distribuição de Probabilidade</span>
              <span>Total: 100%</span>
            </div>
            <div className="h-4 w-full flex rounded-full overflow-hidden border border-border">
              <div style={{ width: `${sc.pC1 * 100}%` }} className="bg-blue-500" title={`C1: ${(sc.pC1 * 100).toFixed(1)}%`} />
              <div style={{ width: `${sc.pC2 * 100}%` }} className="bg-blue-400" title={`C2: ${(sc.pC2 * 100).toFixed(1)}%`} />
              <div style={{ width: `${sc.pC3 * 100}%` }} className="bg-amber-500" title={`C3: ${(sc.pC3 * 100).toFixed(1)}%`} />
            </div>
          </div>

          {/* Exemplo Concreto em N Operações */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xs uppercase text-muted-foreground">Exemplo Concreto em N Operações</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Slider value={[nSimOps]} min={10} max={1000} step={10} onValueChange={v => setNSimOps(v[0])} />
                </div>
                <span className="w-12 text-center text-sm font-bold">{nSimOps} ops</span>
              </div>
              <div className="bg-muted/30 rounded-lg p-4 text-xs leading-relaxed">
                <p>
                  Você fez <span className="font-bold text-foreground">{nSimOps}</span> operações. 
                  Em <span className="font-bold text-foreground">{Math.round(nSimOps * (sc.pC1 + sc.pC2))}</span> delas a exchange ganhou e você acumulou <span className="font-bold text-emerald-400">+${fmt(nSimOps * (sc.pC1 * Math.max(0, sc.c1) + sc.pC2 * Math.max(0, sc.c2)))}</span>. 
                  Em <span className="font-bold text-foreground">{Math.round(nSimOps * sc.pC3)}</span> delas a dupla acertou e você perdeu <span className="font-bold text-red-400">${fmt(Math.abs(nSimOps * sc.pC3 * sc.c3))}</span>. 
                  Saldo líquido: <span className={`font-bold ${nSimOps * sc.eVal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${fmt(nSimOps * sc.eVal)}</span>.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Lay Stakes e Responsabilidades */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Perna 1 (Lay)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-muted/20 rounded border">
                    <p className="text-[10px] text-muted-foreground uppercase">Odd Lay</p>
                    <p className="text-sm font-bold font-mono">{sc.oLay1.toFixed(2)}</p>
                  </div>
                  <div className="p-2 bg-muted/20 rounded border">
                    <p className="text-[10px] text-muted-foreground uppercase">Lay Stake</p>
                    <p className="text-sm font-bold font-mono">${fmt(sc.lay1)}</p>
                  </div>
                  <div className="p-2 bg-muted/20 rounded border">
                    <p className="text-[10px] text-muted-foreground uppercase">Responsabilidade</p>
                    <p className="text-sm font-bold font-mono text-red-400">${fmt(sc.resp1)}</p>
                  </div>
                  <div className="p-2 bg-muted/20 rounded border">
                    <p className="text-[10px] text-muted-foreground uppercase">Retorno Bruto</p>
                    <p className="text-sm font-bold font-mono text-emerald-400">${fmt(sc.ret1)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Perna 2 (Lay)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-muted/20 rounded border">
                    <p className="text-[10px] text-muted-foreground uppercase">Odd Lay</p>
                    <p className="text-sm font-bold font-mono">{sc.oLay2.toFixed(2)}</p>
                  </div>
                  <div className="p-2 bg-muted/20 rounded border">
                    <p className="text-[10px] text-muted-foreground uppercase">Lay Stake</p>
                    <p className="text-sm font-bold font-mono">${fmt(sc.lay2)}</p>
                  </div>
                  <div className="p-2 bg-muted/20 rounded border">
                    <p className="text-[10px] text-muted-foreground uppercase">Responsabilidade</p>
                    <p className="text-sm font-bold font-mono text-red-400">${fmt(sc.resp2)}</p>
                  </div>
                  <div className="p-2 bg-muted/20 rounded border">
                    <p className="text-[10px] text-muted-foreground uppercase">Retorno Bruto</p>
                    <p className="text-sm font-bold font-mono text-emerald-400">${fmt(sc.ret2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <Card>
              <CardContent className="pt-6 space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase">Limites Operacionais</p>
                <div className="flex justify-between items-center text-sm">
                  <span>Capacidade Completa:</span>
                  <span className="font-mono font-bold">${fmt(sc.limCompleta)}</span>
                </div>
                <div className="flex justify-between items-center text-sm border-t pt-2">
                  <span>Capacidade Mínima (P1):</span>
                  <span className="font-mono font-bold">${fmt(sc.limP1)}</span>
                </div>
              </CardContent>
            </Card>

            <div className="bg-blue-500/5 border-l-4 border-l-blue-500 p-4 rounded-r-lg">
              <h5 className="text-xs font-bold text-blue-400 uppercase mb-1 flex items-center gap-1">
                Insight da Perda do Cenário 3
              </h5>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Quando o cenário 3 acontece, você não está perdendo para sempre. 
                Você está pagando o custo de {(sc.pC3 * 100).toFixed(1)}% das operações — que custa ${fmt(Math.abs(sc.c3))} cada. 
                As outras {((1 - sc.pC3) * 100).toFixed(1)}% rendem ${fmt(Math.max(sc.c1, sc.c2))} cada. 
                O saldo médio é ${fmt(sc.eVal)} por operação. A perda já está embutida e descontada.
              </p>
            </div>
          </div>
        </TabsContent>
        
        <TabsContent value="otimizador">
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">O módulo Otimizador será implementado na próxima etapa.</CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="simulacao">
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">O módulo Simulação de Banca será implementado na próxima etapa.</CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
