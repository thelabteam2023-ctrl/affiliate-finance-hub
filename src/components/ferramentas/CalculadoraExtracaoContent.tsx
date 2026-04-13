import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CardInfoTooltip } from '@/components/ui/card-info-tooltip';
import {
  Zap, TrendingUp, TrendingDown, DollarSign, BarChart3, Target,
  Shield, ChevronDown, ChevronUp, Lightbulb, HelpCircle, Info
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

// ─── Tooltip helper ───

function InputTooltip({ title, description, flow }: { title: string; description: string; flow?: string }) {
  return <CardInfoTooltip title={title} description={description} flow={flow} />;
}

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

// ─── Classification explainer ───

function ClassificationExplainer({ results }: { results: StrategyResults }) {
  const [open, setOpen] = useState(false);
  const rules = [
    { label: 'Taxa de conversão ≥ 70% e perda máxima ≤ 15%', met: results.taxaConversao >= 70 && results.perdaMaximaPercent <= 15, tier: '🟢 Excelente' },
    { label: 'Taxa de conversão ≥ 50% e perda máxima ≤ 25%', met: results.taxaConversao >= 50 && results.perdaMaximaPercent <= 25, tier: '🟡 Média' },
    { label: 'Não atende critérios acima', met: results.taxaConversao < 50 || results.perdaMaximaPercent > 25, tier: '🔴 Ruim' },
  ];
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="text-xs text-primary hover:underline flex items-center gap-1">
        <HelpCircle className="h-3 w-3" />
        Por que essa classificação?
      </button>
      {open && (
        <div className="mt-2 p-3 rounded-lg bg-muted/50 border border-border space-y-2 text-xs">
          <p className="font-medium text-foreground">Critérios de classificação:</p>
          {rules.map((r, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={r.met && r.tier.includes(results.classification === 'excellent' ? 'Excelente' : results.classification === 'medium' ? 'Média' : 'Ruim') ? 'text-primary' : 'text-muted-foreground'}>
                {r.met && r.tier.includes(results.classification === 'excellent' ? 'Excelente' : results.classification === 'medium' ? 'Média' : 'Ruim') ? '→' : '•'}
              </span>
              <div>
                <span className="font-medium">{r.tier}:</span> {r.label}
              </div>
            </div>
          ))}
          <div className="pt-2 border-t border-border text-muted-foreground">
            <p>Seus valores: conversão = <span className="font-mono text-foreground">{results.taxaConversao}%</span>, perda máx = <span className="font-mono text-foreground">{results.perdaMaximaPercent}%</span></p>
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

  const explanation = (() => {
    const n = results.strategy.numEvents;
    const odds = results.strategy.backOdds.map(o => o.toFixed(2)).join(' × ');
    const lines: string[] = [];

    lines.push(`📋 Você quer converter R$ ${targetExtraction.toLocaleString('pt-BR')} em dinheiro real.`);
    lines.push(`🎯 A estratégia usa uma múltipla de ${n} eventos com odds ${odds} (total: ${results.strategy.oddTotal}).`);
    lines.push(`💰 Se tudo der certo, o lucro estimado é R$ ${results.lucroLiquidoEstimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}, uma taxa de conversão de ${results.taxaConversao}%.`);
    lines.push(`⚠️ No pior caso, a perda máxima é R$ ${results.perdaMaxima.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${results.perdaMaximaPercent}% do valor alvo).`);
    lines.push(`🏦 Você precisará de até R$ ${results.capitalMaximoNecessario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de capital para executar todos os hedges.`);

    if (monteCarlo) {
      const winRate = monteCarlo.profitDistribution.filter(b => !b.range.includes('-')).reduce((s, b) => s + b.percentage, 0);
      lines.push(`📊 Na simulação de ${monteCarlo.iterations.toLocaleString()} cenários, o lucro mediano foi R$ ${monteCarlo.medianProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`);
    }

    if (results.classification === 'excellent') {
      lines.push(`✅ Recomendação: Estratégia sólida com boa relação risco-retorno. Pode executar com confiança.`);
    } else if (results.classification === 'medium') {
      lines.push(`⚡ Recomendação: Estratégia aceitável. Considere ajustar spread ou retenção para melhorar.`);
    } else {
      lines.push(`🚫 Recomendação: Estratégia com risco elevado. Revise os parâmetros antes de executar.`);
    }

    return lines;
  })();

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
            {explanation.map((line, i) => (
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
  const insights: string[] = [];
  const lossRate = monteCarlo.profitDistribution
    .filter(b => b.range.includes('-'))
    .reduce((s, b) => s + b.percentage, 0);

  if (monteCarlo.medianProfit > 0) {
    insights.push(`📈 Na maioria dos cenários você termina no positivo (mediana: R$ ${monteCarlo.medianProfit.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`);
  } else {
    insights.push(`📉 Na maioria dos cenários o resultado é negativo. Considere ajustar os parâmetros.`);
  }

  if (lossRate > 0) {
    insights.push(`⚠️ Em ~${lossRate.toFixed(0)}% dos cenários há perda.`);
  }

  const spread = monteCarlo.bestCase - monteCarlo.worstCase;
  insights.push(`📏 A variação entre melhor e pior caso é R$ ${spread.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`);

  return (
    <div className="p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
        <Info className="h-3.5 w-3.5" />
        Insights da Simulação
      </div>
      {insights.map((line, i) => (
        <p key={i} className="text-xs text-muted-foreground">{line}</p>
      ))}
    </div>
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

// ─── Hedge Objective Helper ───

function getHedgeObjective(eventIndex: number, numEvents: number): string {
  if (eventIndex === 0) return 'Proteger a stake inicial caso o primeiro evento perca';
  if (eventIndex === numEvents - 1) return 'Garantir lucro final se a múltipla completa';
  return `Travar lucro parcial acumulado até o evento ${eventIndex + 1}`;
}

function getHedgeImpact(eventIndex: number, liability: number): string {
  if (eventIndex === 0) return `Sem hedge: perda total da stake`;
  return `Sem hedge: exposição de R$ ${liability.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} não protegida`;
}

// ─── Main Component ───

export const CalculadoraExtracaoContent: React.FC = () => {
  const [targetExtraction, setTargetExtraction] = useState('1000');
  const [bankroll, setBankroll] = useState('5000');
  const [numEventsMin, setNumEventsMin] = useState(2);
  const [numEventsMax, setNumEventsMax] = useState(4);
  const [oddMin, setOddMin] = useState('1.40');
  const [oddMax, setOddMax] = useState('3.50');
  const [avgSpread, setAvgSpread] = useState('3');
  const [targetRetention, setTargetRetention] = useState([85]);
  const [exchangeCommission, setExchangeCommission] = useState('2.8');

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
  const targetVal = parseFloat(targetExtraction) || 1000;

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
                <div className="flex items-center">
                  <Label className="text-xs">Valor a Extrair (R$)</Label>
                  <InputTooltip
                    title="Valor a Extrair"
                    description="O valor total do bônus ou freebet que você quer converter em dinheiro real."
                    flow="Este valor define a stake da múltipla. Quanto maior, mais capital você precisa."
                  />
                </div>
                <Input type="number" value={targetExtraction} onChange={e => setTargetExtraction(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center">
                  <Label className="text-xs">Bankroll Disponível (R$)</Label>
                  <InputTooltip
                    title="Bankroll Disponível"
                    description="O capital total que você tem disponível para executar os hedges na exchange."
                    flow="Estratégias que exigem mais capital que seu bankroll serão depriorizadas."
                  />
                </div>
                <Input type="number" value={bankroll} onChange={e => setBankroll(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Odd Mínima</Label>
                <Input type="number" step="0.01" value={oddMin} onChange={e => setOddMin(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Odd Máxima</Label>
                <Input type="number" step="0.01" value={oddMax} onChange={e => setOddMax(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>

            {/* Row 2: Strategy */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Eventos (mín)</Label>
                <select value={numEventsMin} onChange={e => setNumEventsMin(Number(e.target.value))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Eventos (máx)</Label>
                <select value={numEventsMax} onChange={e => setNumEventsMax(Number(e.target.value))} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {[2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center">
                  <Label className="text-xs">Spread Médio (%)</Label>
                  <InputTooltip
                    title="Spread Médio (custo oculto)"
                    description="A diferença percentual entre a odd back (casa) e a odd lay (exchange). É um custo oculto: quanto maior o spread, menor o lucro da extração."
                    flow="Spread de 3% significa que se a odd back é 2.00, a lay será ~2.06. Spreads acima de 5% reduzem significativamente a conversão."
                  />
                </div>
                <Input type="number" step="0.1" value={avgSpread} onChange={e => setAvgSpread(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center">
                  <Label className="text-xs">Comissão Exchange (%)</Label>
                  <InputTooltip
                    title="Comissão da Exchange"
                    description="A taxa que a exchange cobra sobre o lucro dos lays. Geralmente entre 2% e 5%."
                    flow="Reduz diretamente o lucro de cada hedge executado."
                  />
                </div>
                <Input type="number" step="0.1" value={exchangeCommission} onChange={e => setExchangeCommission(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>

            {/* Retention Slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <Label className="text-xs">Retenção Alvo</Label>
                  <InputTooltip
                    title="Retenção Alvo (perda máxima aceitável)"
                    description="Define qual porcentagem do valor você quer reter no mínimo. Retenção de 85% = perda máxima de 15% do valor. Quanto mais alta, mais conservadora a estratégia."
                    flow="Retenção alta → estratégias com menos risco, mas possivelmente menor conversão."
                  />
                </div>
                <div className="text-right">
                  <span className="text-sm font-bold text-primary">{targetRetention[0]}%</span>
                  <span className="text-[10px] text-muted-foreground ml-1">(perda máx: {100 - targetRetention[0]}%)</span>
                </div>
              </div>
              <Slider value={targetRetention} onValueChange={setTargetRetention} min={70} max={98} step={1} />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>70% (agressivo — até 30% perda)</span>
                <span>98% (conservador — até 2% perda)</span>
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
            {/* Strategy Explainer */}
            <StrategyExplainer results={results} monteCarlo={monteCarlo} targetExtraction={targetVal} />

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
                <ClassificationExplainer results={results} />
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

            {/* Financial Results — separated clearly */}
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Resumo Financeiro</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard icon={DollarSign} label="Valor Alvo" value={`R$ ${fmt(targetVal)}`} subtitle="valor do bônus/freebet" />
                <StatCard icon={TrendingUp} label="Lucro Líquido Estimado" value={`R$ ${fmt(results.lucroLiquidoEstimado)}`} subtitle={`Conversão: ${results.taxaConversao}%`} accent="green" />
                <StatCard icon={TrendingDown} label="Perda Máxima" value={`R$ ${fmt(results.perdaMaxima)}`} subtitle={`${results.perdaMaximaPercent}% do valor alvo`} accent="red" />
                <StatCard
                  icon={BarChart3}
                  label="Cenário Mais Provável"
                  value={monteCarlo ? `R$ ${fmt(monteCarlo.medianProfit)}` : '—'}
                  subtitle="mediana da simulação"
                  accent={monteCarlo && monteCarlo.medianProfit >= 0 ? 'green' : 'red'}
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Capital e Eficiência</p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <StatCard icon={Shield} label="Capital Máximo Necessário" value={`R$ ${fmt(results.capitalMaximoNecessario)}`} subtitle="pior cenário de hedge" />
                <StatCard icon={Shield} label="Capital Esperado" value={`R$ ${fmt(results.capitalEsperado)}`} subtitle="média ponderada" />
                <StatCard icon={BarChart3} label="Eficiência de Capital" value={`${results.eficienciaCapital}%`} subtitle="lucro / capital máximo" />
              </div>
            </div>

            {/* Hedge Detail Table — enhanced */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Hedge Detalhado (Sequencial Condicional)
                </CardTitle>
                <CardDescription className="text-xs">
                  Cada lay só é executado se o evento anterior ganhar. O Lay 1 é sempre executado.
                </CardDescription>
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
                      {results.strategy.hedgeEvents.map((event, i) => (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="py-2 px-2 font-medium">Evento {i + 1}</td>
                          <td className="py-2 px-2 text-right font-mono">{event.backOdd.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono">{event.layOdd.toFixed(2)}</td>
                          <td className="py-2 px-2 text-right font-mono">R$ {fmt(event.layStake)}</td>
                          <td className="py-2 px-2 text-right font-mono text-red-400">R$ {fmt(event.liability)}</td>
                          <td className="py-2 px-2 text-center">
                            {event.isConditional ? (
                              <span className="text-yellow-400 text-xs">Se ev. {i} ganhar</span>
                            ) : (
                              <span className="text-emerald-400 text-xs">Sempre</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground max-w-[150px]">
                            {getHedgeObjective(i, results.strategy.numEvents)}
                          </td>
                          <td className="py-2 px-2 text-xs text-red-400/80 max-w-[150px]">
                            {getHedgeImpact(i, event.liability)}
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
                        <div className="text-[8px] text-muted-foreground mt-0.5">
                          {i === 0 ? 'sempre' : `se ev.${i} ✓`}
                        </div>
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
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(p.probability * 100, 100)}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Monte Carlo Simulation */}
            <Card>
              <CardHeader className="pb-2">
                <button onClick={() => setShowMonteCarlo(!showMonteCarlo)} className="flex items-center justify-between w-full">
                  <CardTitle className="text-base flex items-center gap-2">
                    <BarChart3 className="h-4 w-4" />
                    Simulação Monte Carlo ({monteCarlo?.iterations.toLocaleString()} cenários)
                  </CardTitle>
                  {showMonteCarlo ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </CardHeader>
              {showMonteCarlo && monteCarlo && (
                <CardContent className="space-y-4">
                  {/* Insights */}
                  <SimulationInsights monteCarlo={monteCarlo} targetExtraction={targetVal} />

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

                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Distribuição de Resultados</p>
                    <div className="space-y-1">
                      {monteCarlo.profitDistribution.map((bucket, i) => (
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
                          <span className="text-sm">{alt.strategy.numEvents} eventos • Odd {alt.strategy.oddTotal}</span>
                          <span className="text-xs text-muted-foreground">[{alt.strategy.backOdds.map(o => o.toFixed(2)).join(', ')}]</span>
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
