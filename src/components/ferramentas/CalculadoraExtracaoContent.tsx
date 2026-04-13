import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Zap, TrendingUp, TrendingDown, DollarSign, BarChart3, Target,
  Shield, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp
} from 'lucide-react';
import {
  type ExtractionConfig,
  type StrategyResults,
  type MonteCarloResult,
  type ProbabilityEvent,
  findBestStrategy,
  calculateProbabilities,
  runMonteCarloSimulation,
} from '@/lib/extracao-engine';

// ─── Classification Badge ───

function ClassificationBadge({ classification }: { classification: 'excellent' | 'medium' | 'poor' }) {
  const map = {
    excellent: { label: '🟢 Excelente', className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    medium: { label: '🟡 Média', className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' },
    poor: { label: '🔴 Ruim', className: 'bg-red-500/15 text-red-400 border-red-500/30' },
  };
  const { label, className } = map[classification];
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
}

// ─── Stat Card ───

function StatCard({ icon: Icon, label, value, subtitle, accent }: {
  icon: React.ElementType;
  label: string;
  value: string;
  subtitle?: string;
  accent?: 'green' | 'red' | 'blue' | 'default';
}) {
  const accentMap = {
    green: 'text-emerald-400',
    red: 'text-red-400',
    blue: 'text-blue-400',
    default: 'text-foreground',
  };
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

// ─── Main Component ───

export const CalculadoraExtracaoContent: React.FC = () => {
  // Input state
  const [targetExtraction, setTargetExtraction] = useState('1000');
  const [bankroll, setBankroll] = useState('5000');
  const [numEventsMin, setNumEventsMin] = useState(2);
  const [numEventsMax, setNumEventsMax] = useState(4);
  const [oddMin, setOddMin] = useState('1.40');
  const [oddMax, setOddMax] = useState('3.50');
  const [avgSpread, setAvgSpread] = useState('3');
  const [targetRetention, setTargetRetention] = useState([85]);
  const [exchangeCommission, setExchangeCommission] = useState('2.8');
  
  // Results state
  const [results, setResults] = useState<StrategyResults | null>(null);
  const [alternatives, setAlternatives] = useState<StrategyResults[]>([]);
  const [probabilities, setProbabilities] = useState<ProbabilityEvent[]>([]);
  const [monteCarlo, setMonteCarlo] = useState<MonteCarloResult | null>(null);
  const [showMonteCarlo, setShowMonteCarlo] = useState(false);
  const [calculated, setCalculated] = useState(false);

  const handleCalculate = () => {
    const config: ExtractionConfig = {
      targetExtraction: parseFloat(targetExtraction) || 1000,
      bankrollAvailable: parseFloat(bankroll) || 5000,
      numEventsMin,
      numEventsMax,
      oddMin: parseFloat(oddMin) || 1.40,
      oddMax: parseFloat(oddMax) || 3.50,
      avgSpread: (parseFloat(avgSpread) || 3) / 100,
      targetRetention: targetRetention[0] / 100,
      exchangeCommission: (parseFloat(exchangeCommission) || 2.8) / 100,
    };

    const { best, alternatives: alts } = findBestStrategy(config);
    setResults(best);
    setAlternatives(alts);
    setProbabilities(calculateProbabilities(best.strategy));
    setMonteCarlo(runMonteCarloSimulation(best.strategy, config));
    setCalculated(true);
  };

  const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4 max-w-5xl mx-auto">
        
        {/* ─── INPUTS ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Parâmetros de Extração
            </CardTitle>
            <CardDescription className="text-xs">
              Configure o valor alvo, bankroll e parâmetros de mercado
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Row 1: Financial */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Valor a Extrair (R$)</Label>
                <Input
                  type="number"
                  value={targetExtraction}
                  onChange={e => setTargetExtraction(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bankroll Disponível (R$)</Label>
                <Input
                  type="number"
                  value={bankroll}
                  onChange={e => setBankroll(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Odd Mínima</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={oddMin}
                  onChange={e => setOddMin(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Odd Máxima</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={oddMax}
                  onChange={e => setOddMax(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Row 2: Strategy */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Eventos (mín)</Label>
                <select
                  value={numEventsMin}
                  onChange={e => setNumEventsMin(Number(e.target.value))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Eventos (máx)</Label>
                <select
                  value={numEventsMax}
                  onChange={e => setNumEventsMax(Number(e.target.value))}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Spread Médio (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={avgSpread}
                  onChange={e => setAvgSpread(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Comissão Exchange (%)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={exchangeCommission}
                  onChange={e => setExchangeCommission(e.target.value)}
                  className="h-9 text-sm"
                />
              </div>
            </div>

            {/* Retention Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Retenção Alvo</Label>
                <span className="text-sm font-bold text-primary">{targetRetention[0]}%</span>
              </div>
              <Slider
                value={targetRetention}
                onValueChange={setTargetRetention}
                min={70}
                max={98}
                step={1}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>70% (agressivo)</span>
                <span>98% (conservador)</span>
              </div>
            </div>

            <Button onClick={handleCalculate} className="w-full">
              <Zap className="h-4 w-4 mr-2" />
              Calcular Estratégia Ótima
            </Button>
          </CardContent>
        </Card>

        {/* ─── RESULTS ─── */}
        {calculated && results && (
          <>
            {/* Strategy Overview */}
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    Estratégia Recomendada
                  </CardTitle>
                  <ClassificationBadge classification={results.classification} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="text-center px-3 py-1.5 rounded-md bg-muted">
                    <p className="text-[10px] text-muted-foreground">Eventos</p>
                    <p className="text-lg font-bold">{results.strategy.numEvents}</p>
                  </div>
                  <div className="text-center px-3 py-1.5 rounded-md bg-muted">
                    <p className="text-[10px] text-muted-foreground">Odd Total</p>
                    <p className="text-lg font-bold">{results.strategy.oddTotal}</p>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <p className="text-[10px] text-muted-foreground mb-1">Odds Sugeridas</p>
                    <div className="flex gap-1.5">
                      {results.strategy.backOdds.map((odd, i) => (
                        <span key={i} className="px-2 py-0.5 rounded bg-primary/10 text-primary text-sm font-mono font-medium">
                          {odd.toFixed(2)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Financial Results Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={DollarSign}
                label="Valor Extraído"
                value={`R$ ${fmt(parseFloat(targetExtraction))}`}
              />
              <StatCard
                icon={TrendingUp}
                label="Lucro Líquido Estimado"
                value={`R$ ${fmt(results.lucroLiquidoEstimado)}`}
                subtitle={`Taxa de conversão: ${results.taxaConversao}%`}
                accent="green"
              />
              <StatCard
                icon={TrendingDown}
                label="Perda Máxima"
                value={`R$ ${fmt(results.perdaMaxima)}`}
                subtitle={`${results.perdaMaximaPercent}% do valor`}
                accent="red"
              />
              <StatCard
                icon={Target}
                label="Taxa de Conversão"
                value={`${results.taxaConversao}%`}
                accent="blue"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard
                icon={Shield}
                label="Capital Máximo Necessário"
                value={`R$ ${fmt(results.capitalMaximoNecessario)}`}
              />
              <StatCard
                icon={Shield}
                label="Capital Esperado"
                value={`R$ ${fmt(results.capitalEsperado)}`}
              />
              <StatCard
                icon={BarChart3}
                label="Eficiência de Capital"
                value={`${results.eficienciaCapital}%`}
                subtitle="lucro / capital máximo"
              />
            </div>

            {/* Hedge Detail Table */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Hedge Detalhado (Sequencial)
                </CardTitle>
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
                        <th className="text-center py-2 px-2 text-xs font-medium">Condicional</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.strategy.hedgeEvents.map((event, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2 px-2 font-medium">Evento {i + 1}</td>
                          <td className="py-2 px-2 text-right font-mono">{event.backOdd.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono">{event.layOdd.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono">R$ {fmt(event.layStake)}</td>
                          <td className="py-2 px-2 text-right font-mono text-red-400">R$ {fmt(event.liability)}</td>
                          <td className="py-2 px-2 text-center">
                            {event.isConditional ? (
                              <span className="text-yellow-400 text-xs">Se {i} ganhar</span>
                            ) : (
                              <span className="text-emerald-400 text-xs">Sempre</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Visual Timeline */}
                <div className="mt-4 flex items-center gap-1">
                  {results.strategy.hedgeEvents.map((event, i) => (
                    <React.Fragment key={i}>
                      <div className={`flex-1 rounded-md p-2 text-center text-[10px] ${
                        i === 0 ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-yellow-500/10 border border-yellow-500/20'
                      }`}>
                        <div className="font-medium">Lay {i + 1}</div>
                        <div className="text-muted-foreground">R$ {fmt(event.layStake)}</div>
                      </div>
                      {i < results.strategy.hedgeEvents.length - 1 && (
                        <div className="text-muted-foreground text-[10px]">→</div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Probabilities */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Probabilidades
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {probabilities.map((p, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{p.label}</span>
                      <span className="font-medium">{(p.probability * 100).toFixed(1)}%</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(p.probability * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Monte Carlo Simulation */}
            <Card>
              <CardHeader className="pb-2">
                <button
                  onClick={() => setShowMonteCarlo(!showMonteCarlo)}
                  className="flex items-center justify-between w-full"
                >
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Simulação Monte Carlo ({monteCarlo?.iterations.toLocaleString()} cenários)
                  </CardTitle>
                  {showMonteCarlo ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </CardHeader>
              {showMonteCarlo && monteCarlo && (
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="text-center p-2 rounded bg-muted">
                      <p className="text-[10px] text-muted-foreground">Lucro Médio</p>
                      <p className={`text-sm font-bold ${monteCarlo.avgProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        R$ {fmt(monteCarlo.avgProfit)}
                      </p>
                    </div>
                    <div className="text-center p-2 rounded bg-muted">
                      <p className="text-[10px] text-muted-foreground">Mediana</p>
                      <p className={`text-sm font-bold ${monteCarlo.medianProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        R$ {fmt(monteCarlo.medianProfit)}
                      </p>
                    </div>
                    <div className="text-center p-2 rounded bg-muted">
                      <p className="text-[10px] text-muted-foreground">Pior Caso</p>
                      <p className="text-sm font-bold text-red-400">R$ {fmt(monteCarlo.worstCase)}</p>
                    </div>
                    <div className="text-center p-2 rounded bg-muted">
                      <p className="text-[10px] text-muted-foreground">Melhor Caso</p>
                      <p className="text-sm font-bold text-emerald-400">R$ {fmt(monteCarlo.bestCase)}</p>
                    </div>
                  </div>

                  {/* Distribution Histogram */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Distribuição de Lucro</p>
                    <div className="space-y-1">
                      {monteCarlo.profitDistribution.map((bucket, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground w-28 text-right shrink-0 font-mono">
                            {bucket.range}
                          </span>
                          <div className="flex-1 h-4 rounded bg-muted overflow-hidden">
                            <div
                              className="h-full rounded bg-primary/60"
                              style={{ width: `${Math.min(bucket.percentage * 2, 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-medium w-12 text-right">{bucket.percentage}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Lay Usage */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Frequência de Uso de Cada Lay</p>
                    <div className="space-y-1">
                      {monteCarlo.layUsageFrequency.map((usage, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-16">Lay {i + 1}</span>
                          <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${usage.frequency}%` }}
                            />
                          </div>
                          <span className="text-xs font-medium w-14 text-right">{usage.frequency}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* Alternatives */}
            {alternatives.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Estratégias Alternativas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {alternatives.map((alt, i) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded-md bg-muted/50 border border-border/50">
                        <div className="flex items-center gap-3">
                          <ClassificationBadge classification={alt.classification} />
                          <span className="text-sm">
                            {alt.strategy.numEvents} eventos • Odd {alt.strategy.oddTotal}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            [{alt.strategy.backOdds.map(o => o.toFixed(2)).join(', ')}]
                          </span>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-emerald-400">+R$ {fmt(alt.lucroLiquidoEstimado)}</span>
                          <span className="text-red-400">-R$ {fmt(alt.perdaMaxima)}</span>
                          <span className="text-muted-foreground">{alt.taxaConversao}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
};
