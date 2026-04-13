import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CardInfoTooltip } from '@/components/ui/card-info-tooltip';
import {
  Zap, TrendingDown, DollarSign, BarChart3, Target,
  Shield, ChevronDown, ChevronUp, Lightbulb, HelpCircle, Info, Percent, Plus, Copy,
} from 'lucide-react';
import {
  type ExtractionConfig,
  type EventInput,
  type StrategyResults,
  type MonteCarloResult,
  type ProbabilityEvent,
  type HedgeEvent,
  calculateDeterministicHedge,
  calculateProbabilities,
  runMonteCarloSimulation,
} from '@/lib/extracao-engine';

// ─── Helpers ───

function InputTooltip({ title, description, flow }: { title: string; description: string; flow?: string }) {
  return <CardInfoTooltip title={title} description={description} flow={flow} />;
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Classification Badge ───

function ClassificationBadge({ classification, resultadoPercent }: { classification: StrategyResults['classification']; resultadoPercent?: number }) {
  const isProfit = resultadoPercent !== undefined && resultadoPercent > 0;
  const map = {
    excellent: isProfit
      ? { label: `🟢 Lucrativa (+${resultadoPercent}%)`, className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' }
      : { label: '🟢 Excelente (<10%)', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    good: { label: '🔵 Boa (10–20%)', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
    medium: { label: '🟡 Média (20–30%)', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
    poor: { label: '🔴 Cara (>30%)', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  };
  const { label, className } = map[classification];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
}

// ─── Classification Explainer ───

function ClassificationExplainer({ results }: { results: StrategyResults }) {
  const [open, setOpen] = useState(false);
  const res = results.resultadoOperacaoPercent;
  const isProfit = results.resultadoOperacao > 0;
  const rules = [
    { tier: '🟢 Excelente', rule: isProfit ? 'Operação lucrativa (edge positivo)' : 'Custo de extração < 10%', met: results.classification === 'excellent' },
    { tier: '🔵 Boa', rule: 'Custo entre 10% e 20%', met: results.classification === 'good' },
    { tier: '🟡 Média', rule: 'Custo entre 20% e 30%', met: results.classification === 'medium' },
    { tier: '🔴 Cara', rule: 'Custo > 30%', met: results.classification === 'poor' },
  ];
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="text-xs text-primary hover:underline flex items-center gap-1">
        <HelpCircle className="h-3 w-3" /> Por que essa classificação?
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-border space-y-2 text-xs">
          <p className="font-medium text-foreground">Baseado no <span className="text-primary">Resultado da Operação</span>:</p>
          {rules.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={r.met ? 'text-primary' : 'text-muted-foreground'}>{r.met ? '→' : '•'}</span>
              <span><span className="font-medium">{r.tier}:</span> {r.rule}</span>
            </div>
          ))}
          <div className="pt-2 border-t border-border text-muted-foreground">
            Resultado: <span className="font-mono text-foreground">{res > 0 ? '+' : ''}{res}%</span> (R$ {res >= 0 ? '+' : ''}{fmt(results.resultadoOperacao)})
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Strategy Explainer ───

function StrategyExplainer({ results, monteCarlo, targetExtraction }: {
  results: StrategyResults;
  monteCarlo: MonteCarloResult | null;
  targetExtraction: number;
}) {
  const [open, setOpen] = useState(false);
  const n = results.events.length;
  const odds = results.events.map(e => e.backOdd.toFixed(2)).join(' × ');
  const lines: string[] = [];

  lines.push(`📋 Você quer converter R$ ${fmt(targetExtraction)} de bônus/freebet em dinheiro real.`);
  if (results.resultadoOperacao >= 0) {
    lines.push(`💡 Esta operação tem edge positivo — você lucra na conversão!`);
  } else {
    lines.push(`💡 Extrair bônus sempre tem um custo — o objetivo é minimizá-lo.`);
  }
  lines.push(`🎯 Estratégia com ${n} eventos: odds ${odds} (total: ${results.oddTotal}).`);
  if (results.resultadoOperacao > 0) {
    lines.push(`💰 Lucro estimado: R$ ${fmt(results.resultadoOperacao)} (+${results.resultadoOperacaoPercent}%). Você extrai R$ ${fmt(targetExtraction)} e ainda ganha R$ ${fmt(results.resultadoOperacao)}, recebendo ~R$ ${fmt(results.valorLiquidoEstimado)} líquido.`);
  } else if (results.resultadoOperacao === 0) {
    lines.push(`⚖️ Operação neutra: sem custo e sem lucro. Você extrai exatamente R$ ${fmt(targetExtraction)}.`);
  } else {
    lines.push(`💸 Custo estimado: R$ ${fmt(results.custoExtracao)} (${results.custoExtracaoPercent}%). Você paga R$ ${fmt(results.custoExtracao)} para extrair R$ ${fmt(targetExtraction)}, recebendo ~R$ ${fmt(results.valorLiquidoEstimado)} líquido.`);
  }
  lines.push(`⚠️ Exposição máxima de caixa: R$ ${fmt(results.exposicaoMaxima)} — movimentação temporária, não perda real.`);
  lines.push(`🏦 Capital necessário: até R$ ${fmt(results.capitalMaximoNecessario)}.`);

  if (monteCarlo) {
    lines.push(`📊 Na simulação de ${monteCarlo.iterations.toLocaleString()} cenários, o resultado mais comum foi R$ ${fmt(monteCarlo.medianResult)}.`);
  }

  if (results.resultadoOperacao > 0) lines.push(`🎯 Operação com edge positivo — aproveite!`);
  else if (results.custoExtracaoPercent < 10) lines.push(`✅ Estratégia barata: custo baixo, vale a pena executar.`);
  else if (results.custoExtracaoPercent <= 20) lines.push(`👍 Custo aceitável para a maioria dos bônus.`);
  else if (results.custoExtracaoPercent <= 30) lines.push(`⚡ Custo moderado. Tente odds com spread menor.`);
  else lines.push(`🚫 Estratégia cara. Revise as odds — spreads menores ajudam.`);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-4">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2 w-full text-left">
          <Lightbulb className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-primary">Explique essa estratégia</span>
          {open ? <ChevronUp className="h-4 w-4 ml-auto text-primary" /> : <ChevronDown className="h-4 w-4 ml-auto text-primary" />}
        </button>
        {open && (
          <div className="mt-3 space-y-2">
            {lines.map((line, i) => (
              <p key={i} className="text-xs text-foreground leading-relaxed">{line}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Simulation Insights ───

function SimulationInsights({ monteCarlo, targetExtraction }: { monteCarlo: MonteCarloResult; targetExtraction: number }) {
  const custoMediano = Math.abs(monteCarlo.medianResult);
  const valorLiquido = targetExtraction - custoMediano;
  const insights: string[] = [];

  insights.push(`💰 Você paga ~R$ ${fmt(custoMediano)} para extrair R$ ${fmt(targetExtraction)} → recebe ~R$ ${fmt(valorLiquido)} líquido.`);

  const lossRate = monteCarlo.resultDistribution
    .filter(b => b.range.includes('-'))
    .reduce((s, b) => s + b.percentage, 0);
  if (lossRate > 0) {
    insights.push(`📉 Em ${lossRate.toFixed(0)}% dos cenários há movimentação negativa de caixa (esperado — custo operacional).`);
  }

  const spread = Math.abs(monteCarlo.bestCase - monteCarlo.worstCase);
  insights.push(`📏 Variação entre melhor e pior resultado: R$ ${fmt(spread)}.`);

  return (
    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Info className="h-3.5 w-3.5" /> Resumo da Simulação
      </div>
      {insights.map((line, i) => (
        <p key={i} className="text-xs text-muted-foreground">{line}</p>
      ))}
    </div>
  );
}

// ─── Stat Card ───

function StatCard({ icon: Icon, label, value, subtitle, accent }: {
  icon: React.ElementType; label: string; value: string; subtitle?: string;
  accent?: 'green' | 'red' | 'blue' | 'default';
}) {
  const accentMap = { green: 'text-emerald-400', red: 'text-red-400', blue: 'text-blue-400', default: 'text-foreground' };
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-xs">{label}</span>
      </div>
      <p className={`text-lg font-bold ${accentMap[accent || 'default']}`}>{value}</p>
      {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

// ─── Hedge helpers ───

function getHedgeObjective(i: number, total: number): string {
  if (i === 0) return 'Proteger a stake inicial';
  if (i === total - 1) return 'Garantir lucro final';
  return `Travar lucro acumulado até evento ${i + 1}`;
}

function getHedgeImpact(i: number, liability: number): string {
  if (i === 0) return 'Sem hedge: perda total da stake';
  return `Sem hedge: exposição de R$ ${fmt(liability)} não protegida`;
}

// ─── Event Inputs Row ───

function EventInputRow({ index, event, onChange }: {
  index: number;
  event: EventInput;
  onChange: (updated: EventInput) => void;
}) {
  const spread = event.layOdd > 0 && event.backOdd > 0
    ? (((event.layOdd - event.backOdd) / event.backOdd) * 100).toFixed(1)
    : '—';

  return (
    <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-3 items-end">
      <div className="flex items-center justify-center w-8 h-9 rounded-md bg-primary/10 text-primary text-sm font-bold">
        {index + 1}
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Odd Back (casa)</Label>
        <Input
          type="number"
          step="0.01"
          placeholder="ex: 1.80"
          value={event.backOdd || ''}
          onChange={e => onChange({ ...event, backOdd: parseFloat(e.target.value) || 0 })}
          className="h-9 text-sm font-mono"
        />
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Odd Lay (exchange)</Label>
        <Input
          type="number"
          step="0.01"
          placeholder="ex: 1.85"
          value={event.layOdd || ''}
          onChange={e => onChange({ ...event, layOdd: parseFloat(e.target.value) || 0 })}
          className="h-9 text-sm font-mono"
        />
      </div>
      <div className="flex items-center h-9 px-2 text-[10px] text-muted-foreground">
        spread: {spread}%
      </div>
    </div>
  );
}

// ─── Main Component ───

const DEFAULT_EVENTS: Record<number, EventInput[]> = {
  2: [{ backOdd: 2.00, layOdd: 2.00 }, { backOdd: 2.00, layOdd: 2.00 }],
  3: [{ backOdd: 2.00, layOdd: 2.00 }, { backOdd: 2.00, layOdd: 2.00 }, { backOdd: 2.00, layOdd: 2.00 }],
  4: [{ backOdd: 2.00, layOdd: 2.00 }, { backOdd: 2.00, layOdd: 2.00 }, { backOdd: 2.00, layOdd: 2.00 }, { backOdd: 2.00, layOdd: 2.00 }],
  5: [{ backOdd: 2.00, layOdd: 2.00 }, { backOdd: 2.00, layOdd: 2.00 }, { backOdd: 2.00, layOdd: 2.00 }, { backOdd: 2.00, layOdd: 2.00 }, { backOdd: 2.00, layOdd: 2.00 }],
};

export const CalculadoraExtracaoContent: React.FC = () => {
  const [targetExtraction, setTargetExtraction] = useState('1000');
  const [bankroll, setBankroll] = useState('5000');
  const [exchangeCommission, setExchangeCommission] = useState('2.8');
  const [numEvents, setNumEvents] = useState('2');
  const [eventInputs, setEventInputs] = useState<Record<string, EventInput[]>>({
    '2': [...DEFAULT_EVENTS[2]],
    '3': [...DEFAULT_EVENTS[3]],
    '4': [...DEFAULT_EVENTS[4]],
    '5': [...DEFAULT_EVENTS[5]],
  });

  const [results, setResults] = useState<StrategyResults | null>(null);
  const [probabilities, setProbabilities] = useState<ProbabilityEvent[]>([]);
  const [successRate, setSuccessRate] = useState(0);
  const [monteCarlo, setMonteCarlo] = useState<MonteCarloResult | null>(null);
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);
  const [calculated, setCalculated] = useState(false);
  const [calcKey, setCalcKey] = useState(0);

  // Comparison slots
  const [savedStrategies, setSavedStrategies] = useState<{ label: string; results: StrategyResults }[]>([]);

  const currentEvents = eventInputs[numEvents] || [];

  const updateEvent = (idx: number, updated: EventInput) => {
    setEventInputs(prev => {
      const copy = { ...prev };
      copy[numEvents] = [...copy[numEvents]];
      copy[numEvents][idx] = updated;
      return copy;
    });
  };

  const handleCalculate = () => {
    const events = currentEvents.filter(e => e.backOdd > 0 && e.layOdd > 0);
    if (events.length < 2) return;

    const config: ExtractionConfig = {
      targetExtraction: isNaN(parseFloat(targetExtraction)) ? 1000 : parseFloat(targetExtraction),
      bankrollAvailable: isNaN(parseFloat(bankroll)) ? 5000 : parseFloat(bankroll),
      exchangeCommission: (isNaN(parseFloat(exchangeCommission)) ? 2.8 : parseFloat(exchangeCommission)) / 100,
      events,
    };

    const res = calculateDeterministicHedge(config);
    setResults(res);
    const probResult = calculateProbabilities(events);
    setProbabilities(probResult.probabilities);
    setSuccessRate(probResult.successRate);
    setMonteCarlo(runMonteCarloSimulation(config, res.events));
    setShowMonteCarlo(false);
    setCalculated(true);
    setCalcKey(k => k + 1);
  };

  const handleSaveForComparison = () => {
    if (!results) return;
    const pct = results.resultadoOperacao >= 0 ? `+${results.resultadoOperacaoPercent}` : `${results.custoExtracaoPercent}`;
    const label = `${numEvents} ev. • ${results.oddTotal}x • ${pct}%`;
    setSavedStrategies(prev => [...prev.slice(-3), { label, results }]);
    setSavedStrategies(prev => [...prev.slice(-3), { label, results }]);
  };

  const targetVal = parseFloat(targetExtraction) || 1000;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4 max-w-5xl mx-auto">

        {/* Header */}
        <div className="p-3 rounded-lg bg-muted/50 border border-border">
          <p className="text-xs text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Como funciona:</strong> Insira as odds reais que você está vendo no mercado (back na casa + lay na exchange).
            A calculadora simula o hedge sequencial e calcula o <strong className="text-foreground">custo real de conversão</strong> do seu bônus/freebet.
          </p>
        </div>

        {/* Inputs */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Parâmetros
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Financial row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <div className="flex items-center">
                  <Label className="text-xs">Valor a Extrair (R$)</Label>
                  <InputTooltip title="Valor a Extrair" description="O valor total do bônus ou freebet que você quer converter." />
                </div>
                <Input type="number" value={targetExtraction} onChange={e => setTargetExtraction(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center">
                  <Label className="text-xs">Comissão Exchange (%)</Label>
                  <InputTooltip title="Comissão" description="Taxa cobrada pela exchange sobre o lucro dos lays (2–5%)." />
                </div>
                <Input type="number" step="0.1" value={exchangeCommission} onChange={e => setExchangeCommission(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>

            {/* Event tabs */}
            <div>
              <div className="flex items-center gap-1 mb-2">
                <Label className="text-xs">Eventos da Múltipla</Label>
                <InputTooltip
                  title="Eventos da Múltipla"
                  description="Insira as odds reais de cada evento. Cada aba representa um tipo de múltipla (dupla, tripla, etc.)."
                  flow="Odds reais = cálculo preciso. Quanto menor o spread (diferença back vs lay), menor o custo."
                />
              </div>
              <Tabs value={numEvents} onValueChange={setNumEvents}>
                <TabsList className="mb-3">
                  <TabsTrigger value="2">Dupla (2)</TabsTrigger>
                  <TabsTrigger value="3">Tripla (3)</TabsTrigger>
                  <TabsTrigger value="4">Quádrupla (4)</TabsTrigger>
                  <TabsTrigger value="5">5 Eventos</TabsTrigger>
                </TabsList>

                {['2', '3', '4', '5'].map(n => (
                  <TabsContent key={n} value={n} className="space-y-2">
                    {(eventInputs[n] || []).map((ev, i) => (
                      <EventInputRow
                        key={i}
                        index={i}
                        event={ev}
                        onChange={updated => {
                          setEventInputs(prev => {
                            const copy = { ...prev };
                            copy[n] = [...copy[n]];
                            copy[n][i] = updated;
                            return copy;
                          });
                        }}
                      />
                    ))}
                    {/* Odd total preview */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
                      <span>Odd total da múltipla:</span>
                      <span className="font-mono font-bold text-foreground">
                        {(eventInputs[n] || []).reduce((acc, e) => acc * (e.backOdd || 1), 1).toFixed(2)}x
                      </span>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </div>

            <Button onClick={handleCalculate} className="w-full">
              <Zap className="h-4 w-4 mr-2" />
              Calcular Custo de Conversão
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {calculated && results && (
          <React.Fragment key={calcKey}>
            {/* Strategy explainer */}
            <StrategyExplainer results={results} monteCarlo={monteCarlo} targetExtraction={targetVal} />

            {/* Strategy overview */}
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Resultado da Estratégia
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <ClassificationBadge classification={results.classification} resultadoPercent={results.resultadoOperacaoPercent} />
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleSaveForComparison}>
                      <Copy className="h-3 w-3" /> Salvar p/ comparar
                    </Button>
                  </div>
                </div>
                <ClassificationExplainer results={results} />
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-center px-3 py-1.5 rounded-md bg-muted">
                    <p className="text-[10px] text-muted-foreground">Eventos</p>
                    <p className="text-lg font-bold">{results.events.length}</p>
                  </div>
                  <div className="text-center px-3 py-1.5 rounded-md bg-muted">
                    <p className="text-[10px] text-muted-foreground">Odd Total</p>
                    <p className="text-lg font-bold">{results.oddTotal}</p>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-[10px] text-muted-foreground mb-1">Odds Back (reais)</p>
                    <div className="flex gap-1.5">
                      {results.events.map((ev, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-primary/10 text-primary text-sm font-mono font-medium">
                          {ev.backOdd.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Resumo Executivo */}
            <Card className="border-primary/40 bg-gradient-to-r from-primary/5 to-transparent">
              <CardContent className="pt-5 pb-4 space-y-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resumo Executivo</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="text-center p-3 rounded-lg bg-card border border-border">
                    <p className="text-[10px] text-muted-foreground mb-1">Para extrair</p>
                    <p className="text-2xl font-bold text-foreground">R$ {fmt(targetVal)}</p>
                    <p className="text-xs text-muted-foreground mt-1">valor do bônus/freebet</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-card border border-border">
                    <p className="text-[10px] text-muted-foreground mb-1">Capital necessário</p>
                    <p className="text-2xl font-bold text-foreground">R$ {fmt(results.capitalMaximoNecessario)}</p>
                    <p className="text-xs text-muted-foreground mt-1">exposição máxima temporária</p>
                  </div>
                </div>

                {/* Distribuição de resultados por cenário */}
                {(() => {
                  const scenarioRows = probabilities.map((p) => {
                    const isSuccess = p.type === 'success';
                    let netResult = 0;
                    if (isSuccess && results.events[p.eventIndex]) {
                      netResult = results.events[p.eventIndex].resultIfBackLoses;
                    } else if (!isSuccess) {
                      netResult = results.netCashFailure;
                    }
                    // Positive delta = profit over target, negative = cost
                    const delta = netResult - targetVal;
                    const deltaPercent = targetVal > 0 ? (delta / targetVal) * 100 : 0;
                    return { ...p, isSuccess, netResult, delta, deltaPercent };
                  });

                  const evDelta = scenarioRows.reduce((sum, s) => sum + s.probability * s.delta, 0);
                  const evDeltaPercent = targetVal > 0 ? (evDelta / targetVal) * 100 : 0;

                  const getResultColor = (delta: number) => {
                    if (delta > 0) return 'text-emerald-400';
                    if (delta === 0) return 'text-foreground';
                    if (Math.abs(delta) / targetVal <= 0.05) return 'text-emerald-400';
                    if (Math.abs(delta) / targetVal <= 0.15) return 'text-yellow-400';
                    return 'text-red-400';
                  };

                  const formatDelta = (v: number) => {
                    if (v > 0) return `+R$ ${fmt(v)}`;
                    if (v < 0) return `-R$ ${fmt(Math.abs(v))}`;
                    return `R$ 0,00`;
                  };

                  const formatDeltaPct = (v: number) => {
                    if (v > 0) return `+${v.toFixed(1)}%`;
                    return `${v.toFixed(1)}%`;
                  };

                  return (
                    <div className="space-y-2">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Resultado por cenário</p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-left py-1.5 px-2 font-medium">Cenário</th>
                              <th className="text-right py-1.5 px-2 font-medium">Prob.</th>
                              <th className="text-right py-1.5 px-2 font-medium">Resultado (R$)</th>
                              <th className="text-right py-1.5 px-2 font-medium">Resultado (%)</th>
                              <th className="text-right py-1.5 px-2 font-medium">Retenção</th>
                            </tr>
                          </thead>
                          <tbody>
                            {scenarioRows.map((s, i) => (
                              <tr key={i} className={`border-b border-border/30 ${s.isSuccess ? '' : 'bg-red-500/5'}`}>
                                <td className="py-1.5 px-2 font-medium">
                                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${s.isSuccess ? 'bg-emerald-500' : 'bg-red-500'}`} />
                                  {s.label}
                                </td>
                                <td className="py-1.5 px-2 text-right text-muted-foreground">{(s.probability * 100).toFixed(1)}%</td>
                                <td className={`py-1.5 px-2 text-right font-mono font-semibold ${getResultColor(s.delta)}`}>
                                  {formatDelta(s.delta)}
                                </td>
                                <td className={`py-1.5 px-2 text-right font-mono font-semibold ${getResultColor(s.delta)}`}>
                                  {formatDeltaPct(s.deltaPercent)}
                                </td>
                                <td className="py-1.5 px-2 text-right text-muted-foreground">
                                  {(100 + s.deltaPercent).toFixed(1)}%
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-primary/30 bg-primary/5">
                              <td className="py-2 px-2 font-semibold text-primary" colSpan={2}>
                                📊 {evDelta >= 0 ? 'Resultado Médio Esperado (EV)' : 'Custo Médio Esperado (EV)'}
                              </td>
                              <td className={`py-2 px-2 text-right font-mono font-bold ${evDelta >= 0 ? 'text-emerald-400' : 'text-primary'}`}>
                                {formatDelta(evDelta)}
                              </td>
                              <td className={`py-2 px-2 text-right font-mono font-bold ${evDelta >= 0 ? 'text-emerald-400' : 'text-primary'}`}>
                                {formatDeltaPct(evDeltaPercent)}
                              </td>
                              <td className="py-2 px-2 text-right text-muted-foreground font-medium">
                                {(100 + evDeltaPercent).toFixed(1)}%
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Metrics */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Resultado da Operação</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard
                  icon={Percent}
                  label="Resultado da Extração"
                  value={results.resultadoOperacao > 0 ? `+${results.resultadoOperacaoPercent}%` : results.resultadoOperacao === 0 ? '0%' : `${results.custoExtracaoPercent}%`}
                  subtitle={results.resultadoOperacao > 0 ? `+R$ ${fmt(results.resultadoOperacao)} — edge positivo` : results.resultadoOperacao === 0 ? 'operação neutra' : `R$ ${fmt(results.custoExtracao)} — taxa para converter`}
                  accent={results.resultadoOperacao >= 0 ? 'green' : 'red'}
                />
                <StatCard icon={DollarSign} label="Valor Líquido Estimado" value={`R$ ${fmt(results.valorLiquidoEstimado)}`} subtitle={results.resultadoOperacao >= 0 ? 'valor extraído + lucro' : 'valor extraído − custo'} accent="green" />
                <StatCard icon={Shield} label="Capital Esperado" value={`R$ ${fmt(results.capitalEsperado)}`} subtitle="uso médio ponderado" />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                Exposição e Fluxo de Caixa
                <CardInfoTooltip title="Exposição ≠ Perda" description="Movimentações temporárias de caixa, não perdas reais. O capital retorna ao final da operação." />
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard icon={TrendingDown} label="Exposição Máxima de Caixa" value={`R$ ${fmt(results.exposicaoMaxima)}`} subtitle="fluxo temporário, não perda real" />
                <StatCard icon={BarChart3} label="Resultado Mais Comum (Simulação)" value={monteCarlo ? `R$ ${fmt(Math.abs(monteCarlo.medianResult))}` : '—'} subtitle="custo típico observado" />
                <StatCard icon={Shield} label="Capital Máximo Necessário" value={`R$ ${fmt(results.capitalMaximoNecessario)}`} subtitle="pior cenário de hedge" />
              </div>
            </div>

            {/* Hedge Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" /> Hedge Detalhado (Sequencial Condicional)
                </CardTitle>
                <CardDescription className="text-xs">Cada lay só é executado se o evento anterior ganhar. O Lay 1 é sempre executado.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="text-left py-2 px-2 text-xs font-medium">Evento</th>
                        <th className="text-right py-2 px-2 text-xs font-medium">Odd Back</th>
                        <th className="text-right py-2 px-2 text-xs font-medium">Odd Lay</th>
                        <th className="text-right py-2 px-2 text-xs font-medium">Lay Stake</th>
                        <th className="text-right py-2 px-2 text-xs font-medium">Liability</th>
                        <th className="text-center py-2 px-2 text-xs font-medium">Condição</th>
                        <th className="text-left py-2 px-2 text-xs font-medium">Objetivo</th>
                        <th className="text-left py-2 px-2 text-xs font-medium">Se não executar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.events.map((event, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2 px-2 font-medium">Evento {i + 1}</td>
                          <td className="py-2 px-2 text-right font-mono">{event.backOdd.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono">{event.layOdd.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono">R$ {fmt(event.layStake)}</td>
                          <td className="py-2 px-2 text-right font-mono text-red-400">R$ {fmt(event.liability)}</td>
                          <td className="py-2 px-2 text-center">
                            {event.isConditional
                              ? <span className="text-yellow-400 text-xs">Se ev. {i} ganhar</span>
                              : <span className="text-emerald-400 text-xs">Sempre</span>
                            }
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground max-w-[150px]">{getHedgeObjective(i, results.events.length)}</td>
                          <td className="py-2 px-2 text-xs text-red-400/80 max-w-[150px]">{getHedgeImpact(i, event.liability)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Timeline */}
                <div className="mt-4 flex items-center gap-1">
                  {results.events.map((event, i) => (
                    <React.Fragment key={i}>
                      <div className={`flex-1 rounded-md p-2 text-center text-[10px] ${i === 0 ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-yellow-500/10 border border-yellow-500/20'}`}>
                        <div className="font-medium">Lay {i + 1}</div>
                        <div className="text-muted-foreground">R$ {fmt(event.layStake)}</div>
                        <div className="text-[8px] text-muted-foreground mt-0.5">{i === 0 ? 'sempre' : `se ev.${i} ✓`}</div>
                      </div>
                      {i < results.events.length - 1 && <div className="text-muted-foreground text-[10px]">→</div>}
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Probabilidades Operacionais */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" /> Probabilidades Operacionais
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Na extração, <span className="text-green-600 font-medium">finalizar = sucesso</span> (back perde, bônus convertido) e <span className="text-red-500 font-medium">todos ganharem = falha</span> (hedge máximo executado).
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Taxa de sucesso */}
                <div className="flex items-center justify-between p-2 rounded-md bg-green-500/10 border border-green-500/20">
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">Taxa de Sucesso</span>
                  <span className="text-sm font-bold text-green-700 dark:text-green-400">{(successRate * 100).toFixed(1)}%</span>
                </div>

                {/* Tabela de cenários */}
                {(() => {
                  // Build scenario data with loss/retention
                  const scenarios = probabilities.map((p) => {
                    const isSuccess = p.type === 'success';
                    let netResult = 0;
                    if (results && targetVal > 0) {
                      if (isSuccess && results.events[p.eventIndex]) {
                        netResult = results.events[p.eventIndex].resultIfBackLoses;
                      } else if (!isSuccess) {
                        netResult = results.netCashFailure;
                      }
                    }
                    const lossValue = targetVal - netResult;
                    const lossPercent = targetVal > 0 ? (lossValue / targetVal) * 100 : 0;
                    const retentionPercent = 100 - lossPercent;
                    return { ...p, isSuccess, netResult, lossValue, lossPercent, retentionPercent };
                  });

                  // EV = sum(P_k * lossValue_k)
                  const evLoss = scenarios.reduce((sum, s) => sum + s.probability * s.lossValue, 0);
                  const evLossPercent = targetVal > 0 ? (evLoss / targetVal) * 100 : 0;

                  return (
                    <>
                      {scenarios.map((s, i) => {
                        const barColor = s.isSuccess ? 'bg-green-500' : 'bg-red-500';
                        const textColor = s.isSuccess ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400';

                        return (
                          <div key={i} className="space-y-1.5">
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span className={`inline-block w-2 h-2 rounded-full ${s.isSuccess ? 'bg-green-500' : 'bg-red-500'}`} />
                                <span className={textColor}>{s.label}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-muted-foreground text-[10px]">
                                  {`${s.laysExecuted} lay${s.laysExecuted > 1 ? 's' : ''}`}
                                </span>
                                <span className={`font-medium ${textColor}`}>{(s.probability * 100).toFixed(1)}%</span>
                              </div>
                            </div>
                            <div className="ml-4 flex items-center gap-3 text-[11px]">
                              <span className="text-red-500 dark:text-red-400 font-semibold">
                                💸 Perda: {s.lossPercent.toFixed(1)}% (R$ {fmt(Math.abs(s.lossValue))})
                              </span>
                              <span className="text-muted-foreground">
                                📈 Retenção: {s.retentionPercent.toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                              <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${Math.min(s.probability * 100, 100)}%` }} />
                            </div>
                          </div>
                        );
                      })}

                      {/* Custo Esperado (EV ponderado) */}
                      <div className="mt-4 p-3 rounded-md bg-primary/10 border border-primary/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs font-semibold text-primary">📊 Custo Médio Esperado (EV)</p>
                            <p className="text-[10px] text-muted-foreground">Ponderado pela probabilidade de cada cenário</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-primary">R$ {fmt(Math.abs(evLoss))} ({evLossPercent.toFixed(1)}%)</p>
                            <p className="text-[10px] text-muted-foreground">retenção esperada: {(100 - evLossPercent).toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Monte Carlo */}
            <Card>
              <CardHeader className="pb-2">
                <button onClick={() => setShowMonteCarlo(!showMonteCarlo)} className="flex items-center justify-between w-full">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" /> Simulação Monte Carlo ({monteCarlo?.iterations.toLocaleString()} cenários)
                  </CardTitle>
                  {showMonteCarlo ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </CardHeader>
              {showMonteCarlo && monteCarlo && (
                <CardContent className="space-y-4">
                  <SimulationInsights monteCarlo={monteCarlo} targetExtraction={targetVal} />

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center p-2 rounded bg-muted">
                      <p className="text-[10px] text-muted-foreground">Resultado Mais Comum</p>
                      <p className="text-sm font-bold text-primary">R$ {fmt(Math.abs(monteCarlo.medianResult))}</p>
                      <p className="text-[9px] text-muted-foreground">custo típico</p>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/50">
                      <p className="text-[10px] text-muted-foreground">Custo Médio</p>
                      <p className="text-sm font-medium text-muted-foreground">R$ {fmt(Math.abs(monteCarlo.avgResult))}</p>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/50">
                      <p className="text-[10px] text-muted-foreground">Pior Cenário</p>
                      <p className="text-sm font-medium text-muted-foreground">R$ {fmt(Math.abs(monteCarlo.worstCase))}</p>
                      <p className="text-[9px] text-muted-foreground">exposição máxima</p>
                    </div>
                    <div className="text-center p-2 rounded bg-muted/50">
                      <p className="text-[10px] text-muted-foreground">Melhor Cenário</p>
                      <p className="text-sm font-medium text-muted-foreground">R$ {fmt(Math.abs(monteCarlo.bestCase))}</p>
                      <p className="text-[9px] text-muted-foreground">{monteCarlo.bestCase >= 0 ? 'retorno' : 'custo'}</p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Distribuição de Resultados</p>
                    <div className="space-y-1">
                      {monteCarlo.resultDistribution.map((bucket, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-28 text-right shrink-0 font-mono">{bucket.range}</span>
                          <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                            <div className={`h-full rounded ${bucket.range.includes('-') ? 'bg-red-500/50' : 'bg-emerald-500/50'}`} style={{ width: `${Math.min(bucket.percentage * 2, 100)}%` }} />
                          </div>
                          <span className="text-[10px] font-medium w-12 text-right">{bucket.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Frequência de Uso de Cada Lay</p>
                    <div className="space-y-1">
                      {monteCarlo.layUsageFrequency.map((usage, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-16">Lay {i + 1}</span>
                          <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${usage.frequency}%` }} />
                          </div>
                          <span className="text-xs font-medium w-14 text-right">{usage.frequency}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Comparison */}
            {savedStrategies.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Comparação de Estratégias</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="text-left py-2 px-2">Estratégia</th>
                          <th className="text-right py-2 px-2">Custo (%)</th>
                          <th className="text-right py-2 px-2">Custo (R$)</th>
                          <th className="text-right py-2 px-2">Capital Máx</th>
                          <th className="text-right py-2 px-2">Exposição</th>
                          <th className="text-center py-2 px-2">Classe</th>
                        </tr>
                      </thead>
                      <tbody>
                        {savedStrategies.map((s, i) => (
                          <tr key={i} className="border-b border-border/50">
                            <td className="py-2 px-2 font-medium">{s.label}</td>
                            <td className={`py-2 px-2 text-right font-mono ${s.results.resultadoOperacao >= 0 ? 'text-emerald-400' : ''}`}>
                              {s.results.resultadoOperacao >= 0 ? `+${s.results.resultadoOperacaoPercent}%` : `${s.results.custoExtracaoPercent}%`}
                            </td>
                            <td className={`py-2 px-2 text-right font-mono ${s.results.resultadoOperacao >= 0 ? 'text-emerald-400' : ''}`}>
                              {s.results.resultadoOperacao >= 0 ? `+R$ ${fmt(s.results.resultadoOperacao)}` : `R$ ${fmt(s.results.custoExtracao)}`}
                            </td>
                            <td className="py-2 px-2 text-right font-mono">R$ {fmt(s.results.capitalMaximoNecessario)}</td>
                            <td className="py-2 px-2 text-right font-mono">R$ {fmt(s.results.exposicaoMaxima)}</td>
                            <td className="py-2 px-2 text-center"><ClassificationBadge classification={s.results.classification} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}
          </React.Fragment>
        )}
      </div>
    </ScrollArea>
  );
};
