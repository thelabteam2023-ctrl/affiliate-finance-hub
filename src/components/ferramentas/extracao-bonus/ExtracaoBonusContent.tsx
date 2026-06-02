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
import { calculateScenarios, runMonteCarlo } from '@/lib/ferramentas/extracao-bonus/engine';
import { ExtractionConfig, ExtractionMode, CapitalType, SimulationParams, BancaParams } from '@/lib/ferramentas/extracao-bonus/types';
import { TrendingUp, Target, Zap, Calculator, Clock, Shield, AlertTriangle, CheckCircle2, Trophy, Medal, Search, Info, Bug, ShieldAlert } from 'lucide-react';

const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const calculateMinOps = (config: ExtractionConfig, meta: number, oddMax: number) => {
  // Estima lucro por op usando odd máxima e modelo equilibrado
  const o1 = Math.sqrt(oddMax);
  const sc = calculateScenarios(config, o1, o1);
  const profit = Math.max(sc.eVal, 1); // Garante ao menos $1 para evitar div/0
  return Math.ceil(meta / profit);
};


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
    nSims: 400,
    initialBanca: 1000 // Adicionado capital inicial padrão para o otimizador
  });

  const [auditTarget, setAuditTarget] = useState<any>(null);
  const [globalAlerts, setGlobalAlerts] = useState<string[]>([]);

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optProgress, setOptProgress] = useState(0);
  const [optResults, setOptResults] = useState<any[]>([]);
  const [optRankTab, setOptRankTab] = useState<'pMeta' | 'medSeq' | 'eVal' | 'p50' | 'medOps'>('pMeta');
  const [optIsDirty, setOptIsDirty] = useState(false);

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
  
  const minOpsRequired = useMemo(() => {
    return calculateMinOps(config, optParams.meta, optParams.oddMaxDupla);
  }, [config, optParams.meta, optParams.oddMaxDupla]);

  const updateConfig = (key: keyof ExtractionConfig, value: any) => {
    setConfig(prev => {
      const newConfig = { ...prev, [key]: value };
      // Se mudar o valor apostado, recalcula o prazo mínimo necessário para a meta
      if (key === 'bonusAmount') {
        const minOps = calculateMinOps(newConfig, optParams.meta, optParams.oddMaxDupla);
        if (optParams.nOps < minOps) {
          setOptParams(p => ({ ...p, nOps: minOps }));
        }
      }
      return newConfig;
    });
    setOptIsDirty(true);
  };

  const updateOptParams = (key: keyof SimulationParams, value: any) => {
    setOptParams(prev => {
      const newParams = { ...prev, [key]: value };
      
      // Validação automática de prazo mínimo se a meta ou stake mudar
      if (key === 'meta') {
        const minOps = calculateMinOps(config, newParams.meta, newParams.oddMaxDupla);
        if (newParams.nOps < minOps) {
          newParams.nOps = minOps;
        }
      }
      return newParams;
    });
    setOptIsDirty(true);
  };

  const updateBancaParams = (key: keyof BancaParams, value: any) => {
    setBancaParams(prev => ({ ...prev, [key]: value }));
  };

  // Motor do Otimizador
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
        const mc = runMonteCarlo(config, odd1, odd2, optParams.meta, optParams.nOps, optParams.nSims, optParams.initialBanca);
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
    
    // Regra 2: Todas estratégias retornam P(Meta) = 0%
    const alerts = [];
    if (results.length > 0 && results.every(r => r.pMeta === 0)) {
      alerts.push("Possível erro sistêmico. Verificar cálculo de probabilidade de meta (todas em 0%).");
    }
    
    // Regra 3: Todas estratégias retornam Mediana Final = 0
    if (results.length > 0 && results.every(r => r.p50 === 0)) {
      alerts.push("Possível erro na captura dos resultados finais ou no cálculo dos percentis (todas medianas em 0).");
    }
    
    // Regra 4: Sequência de Falhas = 0 em todos os cenários
    if (results.length > 0 && results.every(r => r.medSeq === 0)) {
      alerts.push("Possível falha no motor de rastreamento de drawdown e falhas consecutivas (todas sequências em 0).");
    }
    
    setGlobalAlerts(alerts);
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

  // Persistência em localStorage
  useEffect(() => {
    const saved = localStorage.getItem('extracao-bonus-config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConfig(parsed.config || config);
        setOptParams(parsed.optParams || optParams);
        setBancaParams(parsed.bancaParams || bancaParams);
        setO1(parsed.o1 || 2.0);
        setO2(parsed.o2 || 2.0);
      } catch (e) {
        console.error("Erro ao carregar configurações", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('extracao-bonus-config', JSON.stringify({
      config,
      optParams,
      bancaParams,
      o1,
      o2
    }));
  }, [config, optParams, bancaParams, o1, o2]);

  // Garante que o nOps nunca seja menor que o mínimo necessário para a meta
  useEffect(() => {
    if (optParams.nOps < minOpsRequired) {
      setOptParams(prev => ({ ...prev, nOps: minOpsRequired }));
    }
  }, [minOpsRequired, optParams.nOps]);

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
                <Label className="text-xs flex items-center gap-1">
                  Modelo
                  <CardInfoTooltip 
                    title="Modelos de Cálculo" 
                    description={config.model === 'Equilibrado' 
                      ? "Modelo Equilibrado: Ajusta as stakes para que o resultado final seja IDENTICO em qualquer cenário. Elimina a variância operacional." 
                      : "Modelo Cascata: Foca em proteger o capital inicial. O resultado final varia dependendo de qual perna encerra a operação."} 
                  />
                </Label>
                <Select value={config.model} onValueChange={(v: ExtractionMode) => updateConfig('model', v)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Equilibrado">Equilibrado (Arbitragem)</SelectItem>
                    <SelectItem value="Cascata">Cascata (Recuperação)</SelectItem>
                    <SelectItem value="Cenário 3 Zero">Cenário 3 Zero (Proteção)</SelectItem>
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
                <p className="text-xs text-muted-foreground font-medium uppercase flex items-center justify-center gap-1">
                  Valor Esperado por Operação (EV)
                  <CardInfoTooltip 
                    title="O que é EV?" 
                    description="O Valor Esperado (Expected Value) é a média matemática de lucro por operação se você repetisse a aposta milhares de vezes. Ele já desconta comissões e spreads."
                  />
                </p>
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

          {/* Probabilidade Visual e Explicação do Modelo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              <div className="flex gap-4 text-[9px] text-muted-foreground uppercase font-bold justify-center pt-1">
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full" /> P1 Exchange</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-400 rounded-full" /> P2 Exchange</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-500 rounded-full" /> Dupla Bookie</div>
              </div>
            </div>

            <div className="bg-muted/30 p-3 rounded-lg border border-dashed border-border flex flex-col justify-center">
              <h5 className="text-[10px] font-bold uppercase text-primary mb-1">Entenda o {config.model}</h5>
              <p className="text-[10px] text-muted-foreground leading-tight">
                {config.model === 'Equilibrado' && "Este modelo garante que o lucro final seja rigorosamente o mesmo em todos os cenários. É uma arbitragem matemática pura, eliminando o fator 'sorte' da operação."}
                {config.model === 'Cascata' && "Este modelo prioriza a proteção do capital. Ele fixa a primeira aposta e recalcula a segunda para cobrir custos, resultando em retornos variáveis conforme o desfecho."}
                {config.model === 'Cenário 3 Zero' && "Neste ajuste, o cenário de 'ganhar na casa' é calibrado para resultar em exatos zero (empate). Isso libera mais potencial de lucro para quando o dinheiro vai para a Exchange (C1 e C2)."}
              </p>
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
        
        <TabsContent value="otimizador" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                Configuração do Otimizador
                <CardInfoTooltip title="Motor de Otimização" description="O otimizador testa múltiplas combinações de odds para encontrar a melhor estratégia para sua meta." />
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Meta ($)</Label>
                <Input type="number" value={optParams.meta} onChange={e => updateOptParams('meta', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  Stake por Op.
                  <CardInfoTooltip 
                    title="Valor por Aposta" 
                    description="O otimizador utiliza o 'Valor Apostado' definido na aba Parâmetros Globais para calcular o EV de cada passo. Altere lá para simular passos maiores ou menores." 
                  />
                </Label>
                <div className="h-10 px-3 flex items-center bg-muted/50 rounded-md border text-sm font-bold font-mono text-muted-foreground cursor-not-allowed">
                  ${fmt(config.bonusAmount)}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  Prazo ({optParams.nOps} ops)
                  <CardInfoTooltip 
                    title="Janela de Tempo" 
                    description="Define quantas operações (apostas) o sistema tem de 'prazo' para atingir a meta. Se a meta não for batida dentro deste número de jogadas, a estratégia é marcada como falha no cálculo de P(Meta)." 
                  />
                </Label>
                <Slider 
                  value={[optParams.nOps]} 
                  min={minOpsRequired} 
                  max={Math.max(1000, minOpsRequired + 50)} 
                  step={1} 
                  onValueChange={v => updateOptParams('nOps', v[0])} 
                />
                {minOpsRequired > 1 && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Mínimo de <span className="font-bold">{minOpsRequired}</span> ops para atingir a meta de ${fmt(optParams.meta)}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Odd Min/Per ({optParams.oddMin.toFixed(2)})</Label>
                <Slider value={[optParams.oddMin]} min={1.3} max={3} step={0.05} onValueChange={v => updateOptParams('oddMin', v[0])} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Odd Max Dupla ({optParams.oddMaxDupla.toFixed(1)})</Label>
                <Slider value={[optParams.oddMaxDupla]} min={2} max={20} step={0.5} onValueChange={v => updateOptParams('oddMaxDupla', v[0])} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  Banca Inicial ($)
                  <CardInfoTooltip 
                    title="Capital de Proteção" 
                    description="O capital que você tem disponível para cobrir responsabilidades na Exchange. Se o saldo cair abaixo do necessário para a próxima aposta, ocorre a Quebra (interrupção da extração por falta de liquidez)." 
                  />
                </Label>
                <Input type="number" value={optParams.initialBanca} onChange={e => updateOptParams('initialBanca', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="flex items-end lg:col-span-5">
                <button 
                  onClick={handleOptimize} 
                  disabled={isOptimizing}
                  className={`w-full h-10 rounded-md font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all ${optIsDirty ? 'bg-amber-500 hover:bg-amber-600 text-black animate-pulse' : 'bg-primary text-primary-foreground opacity-100'} disabled:opacity-50`}
                >
                  {isOptimizing ? 'Otimizando...' : optIsDirty ? 'Recalcular Ranking' : 'Iniciar Otimização'}
                </button>
              </div>
            </CardContent>
          </Card>

          {isOptimizing && (
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                <span>Progresso da Simulação Monte Carlo</span>
                <span>{optProgress}%</span>
              </div>
              <Progress value={optProgress} className="h-2" />
            </div>
          )}

          {optResults.length > 0 && (
            <div className="space-y-4">
              {globalAlerts.length > 0 && (
                <div className="space-y-2">
                  {globalAlerts.map((alert, i) => (
                    <Alert key={i} variant="destructive" className="bg-red-500/10 border-red-500/20 text-red-400 py-2">
                      <ShieldAlert className="h-4 w-4" />
                      <AlertTitle className="text-xs font-bold uppercase">Sentinela: Inconsistência Detectada</AlertTitle>
                      <AlertDescription className="text-xs">
                        {alert}
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}

              <div className="bg-blue-500/5 border-l-4 border-l-blue-500 p-4 rounded-r-lg mb-6">
                <h5 className="text-xs font-bold text-blue-400 uppercase mb-1 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Entenda o Prazo e a Extração
                </h5>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  O otimizador utiliza o passo (stake) de <strong>${fmt(config.bonusAmount)}</strong> para calcular o EV. 
                  O indicador <strong>P(Meta)</strong> representa a chance de o lucro ser efetivamente <strong>transferido para a Exchange</strong> dentro de <strong>{optParams.nOps} operações</strong>.
                  Se o dinheiro "cair na casa" (Cenário 3), o saldo da Exchange diminui e você precisará de mais operações para extrair o valor novamente.
                </p>
              </div>

              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Ranking de Estratégias</h3>
                <div className="flex bg-muted p-1 rounded-lg">
                  {[
                    { id: 'pMeta', label: 'P(Meta)', tooltip: 'Probabilidade de que o lucro desejado seja efetivamente transferido para a sua conta na Exchange após o ciclo de operações.' },
                    { id: 'medSeq', label: 'Menor Risco', tooltip: 'Ordena por estratégias que evitam que o dinheiro "caia" na casa (Cenário 3) repetidamente.' },
                    { id: 'eVal', label: 'Maior EV', tooltip: 'Valor Esperado: quanto você ganha, em média, por cada operação realizada.' },
                    { id: 'p50', label: 'Maior Mediana', tooltip: 'O saldo final mais provável (percentil 50) após completar todo o ciclo de operações.' },
                    { id: 'medOps', label: 'Mais Rápida', tooltip: 'Estratégias que atingem a meta com o menor número médio de operações.' }
                  ].map(tab => (
                    <CardInfoTooltip 
                      key={tab.id}
                      title={tab.label}
                      description={tab.tooltip}
                    >
                      <button
                        onClick={() => setOptRankTab(tab.id as any)}
                        className={`px-3 py-1.5 rounded-md text-[10px] font-bold uppercase transition-all ${optRankTab === tab.id ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {tab.label}
                      </button>
                    </CardInfoTooltip>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedOptResults.slice(0, 15).map((res, i) => (
                  <Card key={i} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => {
                    setO1(res.o1);
                    setO2(res.o2);
                    setActiveTab('parametros');
                  }}>
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                          <div>
                            <p className="text-sm font-bold">{res.o1.toFixed(2)} × {res.o2.toFixed(2)}</p>
                            <p className="text-[10px] text-muted-foreground uppercase">{res.oMult.toFixed(2)}x Odd Total</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {res.diagnostics?.alerts?.length > 0 && (
                            <CardInfoTooltip title="Alertas de Auditoria" description={res.diagnostics.alerts.join(' ')}>
                              <AlertTriangle className="w-3 h-3 text-amber-500 animate-pulse" />
                            </CardInfoTooltip>
                          )}
                          {res.pMeta > 0.9 && <Badge variant="default" className="bg-emerald-500 text-[8px] uppercase">Elite</Badge>}
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-7 text-[9px] uppercase font-bold flex-1 gap-1 border-primary/20 hover:border-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAuditTarget(res);
                          }}
                        >
                          <Bug className="w-3 h-3" />
                          Auditar
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-7 text-[9px] uppercase font-bold flex-1 gap-1"
                        >
                          <Search className="w-3 h-3" />
                          Selecionar
                        </Button>
                      </div>

                      
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                            P(Meta)
                            <CardInfoTooltip title="Probabilidade da Meta" description="Chance estatística de atingir o lucro desejado dentro do prazo de operações definido." />
                          </p>
                          <p className="text-xs font-bold text-emerald-400">{(res.pMeta * 100).toFixed(1)}%</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                            EV/Passo
                            <CardInfoTooltip title="Lucro por Aposta" description={`Com uma aposta de $${fmt(config.bonusAmount)}, cada operação rende em média este valor.`} />
                          </p>
                          <p className="text-xs font-bold">${fmt(res.eVal)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                            DP (Risco)
                            <CardInfoTooltip title="Desvio Padrão (Volatilidade)" description="Indica o quanto o saldo oscila por operação. Valores altos significam 'montanha-russa' (maior risco de quebra temporária)." />
                          </p>
                          <p className="text-xs font-bold text-slate-300">${fmt(res.std)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                            Seq. Falhas
                            <CardInfoTooltip title="Risco de Rollover" description="Média da maior sequência de operações onde o bônus ficou preso na casa (Cenário 3). Quanto menor, mais eficiente é a extração." />
                          </p>
                          <p className="text-xs font-bold text-amber-400">{res.medSeq} ops</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                            Mediana Final
                            <CardInfoTooltip title="Expectativa Realista" description="O saldo final que ocorreu na maioria das simulações. É um indicador mais seguro que a média simples." />
                          </p>
                          <p className="text-xs font-bold">${fmt(res.p50)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                            P(Quebra)
                            <CardInfoTooltip title="Risco de Liquidez" description="Chance de o saldo da Exchange acabar. Nota: O dinheiro não 'some', ele é transferido para a Casa de Apostas, mas você perde a capacidade de continuar o hedge/proteção." />
                          </p>
                          <p className="text-xs font-bold text-red-400">{(res.pQuebra * 100).toFixed(1)}%</p>
                        </div>
                      </div>
                      
                      <div className="text-[10px] text-muted-foreground bg-muted/30 p-2 rounded leading-relaxed">
                        Exch ganha {((1 - (1 / res.o1 * 1 / res.o2)) * 100).toFixed(0)}% das ops. 
                        {res.eVal > 0 
                          ? `Necessário: ~${Math.ceil(optParams.meta / res.eVal)} ops para meta vs ${optParams.nOps} ops de prazo.`
                          : "Estratégia com EV negativo: impossível atingir meta de longo prazo."
                        }
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="simulacao" className="space-y-6">
           <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                Configuração da Simulação de Banca
                <CardInfoTooltip title="Simulação Realista" description="Simula trajetórias de banca considerando a capacidade operacional e o risco de exposição sem cobertura." />
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Resumo dos Parâmetros Ativos */}
              <div className="mb-6 p-3 bg-primary/5 rounded-lg border border-primary/20 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase text-primary flex items-center gap-2">
                    <Target className="w-3 h-3" />
                    Cenário Operacional Ativo
                  </span>
                  <span className="text-[9px] text-muted-foreground italic">Valores herdados da aba Parâmetros</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Odd P1</p>
                    <p className="text-xs font-bold font-mono">{o1.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Odd P2</p>
                    <p className="text-xs font-bold font-mono">{o2.toFixed(2)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Spread</p>
                    <p className="text-xs font-bold font-mono">{config.spread.toFixed(1)}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">EV Médio</p>
                    <p className={`text-xs font-bold font-mono ${sc.eVal >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${fmt(sc.eVal)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs">Banca Inicial ($)</Label>
                  <Input type="number" value={bancaParams.initialBanca} onChange={e => updateBancaParams('initialBanca', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Lucro Desejado ($)</Label>
                  <Input type="number" value={bancaParams.lucroDesejado} onChange={e => updateBancaParams('lucroDesejado', parseFloat(e.target.value) || 0)} />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs flex items-center gap-1">
                    Janela de Tempo ({bancaParams.maxOps})
                    <CardInfoTooltip title="Prazo Limite" description="Número máximo de operações permitidas para tentar dobrar a banca ou atingir o lucro desejado antes de encerrar a simulação." />
                  </Label>
                  <Slider value={[bancaParams.maxOps]} min={10} max={1000} step={10} onValueChange={v => updateBancaParams('maxOps', v[0])} />
                </div>
                <div className="flex items-end">
                  <button 
                    onClick={handleSimulateBanca} 
                    disabled={isSimulating}
                    className="w-full h-10 bg-primary text-primary-foreground rounded-md font-bold text-xs uppercase flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isSimulating ? 'Simulando...' : 'Rodar Simulação'}
                  </button>
                </div>
              </div>
            </CardContent>
          </Card>

          {isSimulating && (
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                <span>Processando trajetórias de banca</span>
                <span>{simProgress}%</span>
              </div>
              <Progress value={simProgress} className="h-2" />
            </div>
          )}

          {simResult && (
            <div className="space-y-6">
              <Alert className="bg-blue-500/10 border-blue-500/30 text-blue-200">
                <Shield className="w-4 h-4" />
                <AlertTitle className="text-sm font-bold">Importante: O conceito de Quebra</AlertTitle>
                <AlertDescription className="text-xs">
                  Diferente de apostas comuns, aqui a <strong>Quebra</strong> significa que seu saldo na <strong>Exchange</strong> acabou e foi parar na <strong>Casa de Apostas</strong>. 
                  O risco real não é o sumiço do dinheiro, mas sim ele ficar "preso" na Casa sem você ter saldo para continuar fazendo o hedge (proteção) necessário para cumprir o rollover e sacar.
                </AlertDescription>
              </Alert>

              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                <h4 className="text-xs font-bold text-blue-400 uppercase mb-2 flex items-center gap-2">
                  <Info className="w-3 h-3" />
                  O que esses números significam?
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Rodamos <strong>{bancaParams.nSims} simulações</strong> (futuros possíveis). 
                  Em cada uma, você faria até <strong>{bancaParams.maxOps} operações</strong>. 
                  A <strong>Quebra</strong> ocorre quando sua banca de ${fmt(bancaParams.initialBanca)} esgota na Exchange. Isso não significa perda total, mas que o capital migrou para a Casa de Apostas e você não tem mais como cobrir as apostas. 
                  O <strong>Sucesso</strong> é quando você atinge o lucro de ${fmt(bancaParams.lucroDesejado)} efetivamente extraído para a Exchange.

                </p>
              </div>

              <div className="flex items-center justify-center gap-4 py-4 bg-muted/20 rounded-lg border border-border">
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Banca Inicial</p>
                  <p className="text-lg font-bold">${fmt(bancaParams.initialBanca)}</p>
                </div>
                <div className="text-muted-foreground">+</div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Lucro Desejado</p>
                  <p className="text-lg font-bold">${fmt(bancaParams.lucroDesejado)}</p>
                </div>
                <div className="text-muted-foreground">=</div>
                <div className="text-center">
                  <p className="text-[10px] text-primary uppercase font-bold">Meta Final</p>
                  <p className="text-xl font-bold text-primary">${fmt(bancaParams.initialBanca + bancaParams.lucroDesejado)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="border-l-4 border-l-emerald-500">
                  <CardContent className="pt-4 space-y-1">
                    <h4 className="text-[10px] font-bold uppercase text-muted-foreground">P(Atingir Meta)</h4>
                    <p className="text-3xl font-bold text-emerald-400">{(simResult.pMeta * 100).toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">Trajetórias bem-sucedidas em {bancaParams.maxOps} ops.</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-amber-500">
                  <CardContent className="pt-4 space-y-1">
                    <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Zona de Risco</h4>
                    <p className="text-3xl font-bold text-amber-400">{(simResult.pZonaRisco * 100).toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">Trajetórias que entraram no Nível 2.</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-red-500">
                  <CardContent className="pt-4 space-y-1">
                    <h4 className="text-[10px] font-bold uppercase text-muted-foreground">Quebra Total</h4>
                    <p className="text-3xl font-bold text-red-400">{(simResult.pQuebra * 100).toFixed(1)}%</p>
                    <p className="text-[10px] text-muted-foreground">Trajetórias que foram ao Nível 3.</p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase text-muted-foreground">Análise de Percentis (Saldo Final)</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-muted-foreground">
                          {['P10', 'P25', 'P50', 'P75', 'P90', 'P95', 'P99'].map(p => <th key={p} className="py-2 text-center">{p}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          {Object.values(simResult.percentis).map((val: any, i) => {
                            let color = 'text-red-400';
                            const meta = bancaParams.initialBanca + bancaParams.lucroDesejado;
                            if (val >= meta) color = 'text-emerald-400';
                            else if (val >= bancaParams.initialBanca + sc.limCompleta) color = 'text-blue-400';
                            else if (val >= sc.limP1) color = 'text-amber-400';
                            
                            return <td key={i} className={`py-3 text-center font-bold font-mono ${color}`}>${fmt(val)}</td>;
                          })}
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-center gap-4 mt-4 text-[9px] uppercase font-bold text-muted-foreground">
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full" /> Meta ✓</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full" /> Op. Completa</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-500 rounded-full" /> Zona Risco</div>
                    <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full" /> Inoperante</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
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
              {/* Seção 0: Resumo para Leigos */}
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
                      <span className="font-bold text-red-400">Quebra:</span> Sua banca da Exchange acabou. O dinheiro migrou para a Casa de Apostas, mas você perdeu a capacidade de continuar protegendo suas apostas (Risco de Liquidez).
                    </li>
                    <li>
                      <span className="font-bold text-slate-400">DP (Desvio Padrão):</span> É o quão "nervosa" é a estratégia. Um DP de ${fmt(auditTarget.std)} significa que seu saldo pode oscilar muito para cima ou para baixo em uma única aposta.
                    </li>
                    <li>
                      <span className="font-bold text-amber-400">Mais Prazo = Mais P(Meta)?</span> Sim, porque você tem mais chances de recuperar perdas, mas cuidado: quanto mais tempo você opera, mais chances tem de enfrentar uma sequência de azares que quebre sua banca.
                    </li>
                  </ul>
                  <p className="pt-2 italic text-[11px] text-slate-400 border-t border-blue-500/20">
                    Conclusão: {auditTarget.pMeta > 0.5 ? "Esta estratégia é estatisticamente sólida para sua meta." : "Esta meta é muito agressiva para sua banca atual. Você tem grandes chances de quebrar antes de chegar lá."}
                  </p>
                </div>
              </div>

              {/* Seção 1: Entrada do Sistema */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {[
                    { label: 'Meta', val: `$${fmt(auditTarget.diagnostics.input.meta)}` },
                    { label: 'Banca Inicial', val: `$${fmt(auditTarget.diagnostics.input.initialBanca)}` },
                    { label: 'Stake Base', val: `$${fmt(config.bonusAmount)}` },
                    { label: 'EV/Op', val: `$${fmt(auditTarget.diagnostics.input.evPerOp)}` },
                    { label: 'Prazo', val: `${auditTarget.diagnostics.input.nOps} ops` },
                    { label: 'Simulações', val: auditTarget.diagnostics.input.nSims },
                    { label: 'Odd 1', val: auditTarget.o1.toFixed(2) },
                    { label: 'Odd 2', val: auditTarget.o2.toFixed(2) },
                  ].map((item, i) => (
                    <div key={i} className="p-2 bg-slate-900 rounded border border-slate-800">
                      <p className="text-[9px] text-slate-500 uppercase">{item.label}</p>
                      <p className="text-xs font-bold font-mono">{item.val}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Seção 2: Resultados da Simulação */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="w-3 h-3" />
                  Resultados Brutos (Monte Carlo)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                   {[
                    { label: 'Sucessos (Meta)', val: auditTarget.diagnostics.counts.success, color: 'text-emerald-400' },
                    { label: 'Quebras', val: auditTarget.diagnostics.counts.broke, color: 'text-red-400' },
                    { label: 'Incompletos (Prazo)', val: auditTarget.diagnostics.counts.stayInBetween, color: 'text-amber-400', tooltip: 'Simulações onde o prazo de operações acabou antes de você atingir a meta ou quebrar a banca. O saldo final ficou entre o valor inicial e o alvo.' },
                    { label: 'Total Executado', val: auditTarget.diagnostics.counts.total, color: 'text-slate-100' },
                  ].map((item: any, i) => (
                    <CardInfoTooltip key={i} title={item.label} description={item.tooltip || ''}>
                      <div className="p-2 bg-slate-900 rounded border border-slate-800 cursor-help">
                        <p className="text-[9px] text-slate-500 uppercase">{item.label}</p>
                        <p className={`text-sm font-bold font-mono ${item.color}`}>{item.val}</p>
                      </div>
                    </CardInfoTooltip>
                  ))}
                </div>
              </div>



              {/* Seção 3: Distribuição de Probabilidade */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                  <Calculator className="w-3 h-3" />
                  Estatísticas de Dispersão (Percentis)
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  {[
                    { label: 'Mínimo', val: auditTarget.diagnostics.stats.min, tooltip: 'O pior resultado possível entre todas as simulações. Representa o "fundo do poço" que o saldo atingiu.' },
                    { label: 'P5', val: auditTarget.diagnostics.stats.p5, tooltip: 'Indica que em apenas 5% das vezes o resultado foi pior que este. É um cenário de azar extremo.' },
                    { label: 'P25', val: auditTarget.diagnostics.stats.p25, tooltip: 'Cenário conservador: 25% das vezes o resultado foi abaixo disso, e 75% foi acima.' },
                    { label: 'Mediana (P50)', val: auditTarget.diagnostics.stats.p50, tooltip: 'O ponto central: metade das simulações terminou acima deste valor e metade abaixo. É a expectativa mais realista.' },
                    { label: 'P75', val: auditTarget.diagnostics.stats.p75, tooltip: 'Cenário otimista: em 75% das vezes o resultado foi abaixo disso. Você superou a maioria dos casos.' },
                    { label: 'P95', val: auditTarget.diagnostics.stats.p95, tooltip: 'Cenário de grande sucesso: apenas 5% das simulações conseguiram ser melhores que este valor.' },
                    { label: 'Máximo', val: auditTarget.diagnostics.stats.max, tooltip: 'O melhor resultado obtido em todas as simulações. O teto máximo de lucro alcançado.' },
                    { label: 'Média Final', val: auditTarget.diagnostics.stats.avg, tooltip: 'A soma de todos os saldos dividida pelo número de testes. Diferente da mediana, ela é afetada por valores muito altos ou baixos.' },
                  ].map((item, i) => (
                    <CardInfoTooltip key={i} title={item.label} description={item.tooltip}>
                      <div className={`p-2 bg-slate-900 rounded border border-slate-800 cursor-help ${item.label === 'Mediana (P50)' ? 'border-primary/50 bg-primary/5' : ''}`}>
                        <p className="text-[9px] text-slate-500 uppercase">{item.label}</p>
                        <p className={`text-xs font-bold font-mono ${item.val >= (auditTarget.diagnostics.input.initialBanca) ? 'text-emerald-400' : 'text-red-400'}`}>
                          ${fmt(item.val)}
                        </p>
                      </div>
                    </CardInfoTooltip>
                  ))}

                </div>
              </div>

              {/* Seção 4: Auditoria de Fórmulas e Lógica */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase text-muted-foreground flex items-center gap-2">
                  <Shield className="w-3 h-3" />
                  Memória de Cálculo e Lógica
                </h4>
                <div className="text-[10px] space-y-2 font-mono text-slate-400 bg-slate-900 p-3 rounded border border-slate-800">
                  <p><span className="text-primary">P(Meta)</span> = Sucessos / Total Simulações = {auditTarget.diagnostics.counts.success} / {auditTarget.diagnostics.counts.total} = {(auditTarget.pMeta * 100).toFixed(2)}%</p>
                  <p><span className="text-primary">Mediana</span> = Valor no centro da amostra ordenada de saldos finais.</p>
                  <p><span className="text-primary">Seq. Falhas</span> = Mediana das maiores sequências de Cenário 3 em cada simulação.</p>
                  <p className="pt-2 border-t border-slate-800 text-slate-500 italic">
                    Nota: Se P(Meta) é 0% mas o EV é positivo, verifique se o 'Prazo' é suficiente para atingir a meta com a 'Stake' atual ou se a 'Banca Inicial' está causando quebras prematuras.
                  </p>
                </div>
              </div>

              {auditTarget.diagnostics.alerts.length > 0 && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-1">
                  <p className="text-xs font-bold text-red-400 flex items-center gap-1 uppercase">
                    <AlertTriangle className="w-3 h-3" />
                    Alertas de Inconsistência
                  </p>
                  {auditTarget.diagnostics.alerts.map((alert: string, i: number) => (
                    <p key={i} className="text-[10px] text-red-300/80">{alert}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
