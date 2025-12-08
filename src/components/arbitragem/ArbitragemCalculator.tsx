import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  CheckCircle2, 
  Calculator,
  Target,
  Percent,
  DollarSign,
  ArrowRightLeft
} from "lucide-react";

interface CalcResult {
  impliedProb: number;
  trueProb: number;
  stake: number;
  returnValue: number;
  profit: number;
}

interface AnalysisResult {
  totalMargin: number;
  marginPercent: number;
  hasArbitrage: boolean;
  arbitrageProfit: number;
  arbitrageProfitPercent: number;
  ev: number;
  evPercent: number;
  recommendation: string;
  recommendationType: 'success' | 'warning' | 'danger' | 'neutral';
  outcomes: CalcResult[];
}

export function ArbitragemCalculator() {
  const [marketType, setMarketType] = useState<"1x2" | "binary">("binary");
  const [totalStake, setTotalStake] = useState<string>("100");
  const [useFreebet, setUseFreebet] = useState(false);
  const [freebetValue, setFreebetValue] = useState<string>("0");
  const [freebetType, setFreebetType] = useState<"snr" | "sr">("snr");
  
  // Odds for 1X2 market
  const [odd1, setOdd1] = useState<string>("");
  const [oddX, setOddX] = useState<string>("");
  const [odd2, setOdd2] = useState<string>("");
  
  // Odds for binary market
  const [oddYes, setOddYes] = useState<string>("");
  const [oddNo, setOddNo] = useState<string>("");

  const analysis = useMemo((): AnalysisResult | null => {
    const stake = parseFloat(totalStake) || 0;
    if (stake <= 0) return null;

    let odds: number[] = [];
    
    if (marketType === "1x2") {
      const o1 = parseFloat(odd1);
      const oX = parseFloat(oddX);
      const o2 = parseFloat(odd2);
      if (!o1 || !oX || !o2 || o1 <= 1 || oX <= 1 || o2 <= 1) return null;
      odds = [o1, oX, o2];
    } else {
      const oYes = parseFloat(oddYes);
      const oNo = parseFloat(oddNo);
      if (!oYes || !oNo || oYes <= 1 || oNo <= 1) return null;
      odds = [oYes, oNo];
    }

    // Calculate implied probabilities
    const impliedProbs = odds.map(odd => 1 / odd);
    const totalMargin = impliedProbs.reduce((sum, p) => sum + p, 0);
    const marginPercent = (totalMargin - 1) * 100;

    // True probabilities (fair odds)
    const trueProbs = impliedProbs.map(p => p / totalMargin);

    // Check for arbitrage (sum < 1 means guaranteed profit)
    const hasArbitrage = totalMargin < 1;
    
    // Calculate balanced stakes for each outcome
    const stakes = impliedProbs.map(p => (p / totalMargin) * stake);
    
    // Calculate returns and profits for each outcome
    const outcomes: CalcResult[] = odds.map((odd, i) => {
      const outcomeStake = stakes[i];
      const returnValue = outcomeStake * odd;
      const profit = returnValue - stake;
      return {
        impliedProb: impliedProbs[i] * 100,
        trueProb: trueProbs[i] * 100,
        stake: outcomeStake,
        returnValue,
        profit
      };
    });

    // Arbitrage profit calculation
    const arbitrageProfit = hasArbitrage ? stake * (1 - totalMargin) : 0;
    const arbitrageProfitPercent = hasArbitrage ? (1 - totalMargin) * 100 : 0;

    // EV calculation (for single bet scenario using best odds)
    const bestOddIndex = odds.indexOf(Math.max(...odds));
    const bestOdd = odds[bestOddIndex];
    const bestTrueProb = trueProbs[bestOddIndex];
    const ev = (bestTrueProb * (bestOdd - 1)) - ((1 - bestTrueProb) * 1);
    const evPercent = ev * 100;

    // Generate recommendation
    let recommendation = "";
    let recommendationType: 'success' | 'warning' | 'danger' | 'neutral' = 'neutral';

    if (hasArbitrage) {
      recommendation = `🎯 ARBITRAGEM DETECTADA! Lucro garantido de ${arbitrageProfitPercent.toFixed(2)}% (R$ ${arbitrageProfit.toFixed(2)}) distribuindo stakes proporcionalmente.`;
      recommendationType = 'success';
    } else if (marginPercent > 10) {
      recommendation = `⚠️ Margem alta da casa (${marginPercent.toFixed(2)}%). Este mercado oferece pouco valor. Evite apostar aqui.`;
      recommendationType = 'danger';
    } else if (marginPercent > 5) {
      recommendation = `⚡ Margem moderada (${marginPercent.toFixed(2)}%). Mercado comum, sem vantagem significativa.`;
      recommendationType = 'warning';
    } else if (marginPercent <= 5 && marginPercent > 0) {
      recommendation = `✅ Margem baixa (${marginPercent.toFixed(2)}%). Mercado competitivo - boas odds disponíveis.`;
      recommendationType = 'success';
    } else {
      recommendation = `📊 Mercado equilibrado. Margem: ${marginPercent.toFixed(2)}%.`;
      recommendationType = 'neutral';
    }

    return {
      totalMargin,
      marginPercent,
      hasArbitrage,
      arbitrageProfit,
      arbitrageProfitPercent,
      ev,
      evPercent,
      recommendation,
      recommendationType,
      outcomes
    };
  }, [marketType, totalStake, odd1, oddX, odd2, oddYes, oddNo]);

  const freebetAnalysis = useMemo(() => {
    if (!useFreebet) return null;
    
    const fbValue = parseFloat(freebetValue) || 0;
    if (fbValue <= 0) return null;

    let odds: number[] = [];
    if (marketType === "1x2") {
      const o1 = parseFloat(odd1);
      const oX = parseFloat(oddX);
      const o2 = parseFloat(odd2);
      if (!o1 || !oX || !o2) return null;
      odds = [o1, oX, o2];
    } else {
      const oYes = parseFloat(oddYes);
      const oNo = parseFloat(oddNo);
      if (!oYes || !oNo) return null;
      odds = [oYes, oNo];
    }

    // Find best odd for freebet extraction
    const bestOdd = Math.max(...odds);
    const bestIndex = odds.indexOf(bestOdd);
    
    // SNR: profit = (odd - 1) * stake
    // SR: profit = odd * stake - stake = (odd - 1) * stake (same formula, but stake returns)
    const expectedReturn = freebetType === "snr" 
      ? fbValue * (bestOdd - 1)
      : fbValue * bestOdd;
    
    const extractionRate = (expectedReturn / fbValue) * 100;
    
    // Calculate lay stake for hedging (simplified)
    // Lay stake = (Back stake * Back odd) / Lay odd
    // For freebet SNR: Lay stake = (Freebet * (Back odd - 1)) / (Lay odd - commission)
    const layCommission = 0.05; // 5% exchange commission
    const layOdd = bestOdd; // Assuming same odd for simplicity
    const layStake = freebetType === "snr"
      ? (fbValue * (bestOdd - 1)) / (layOdd - layCommission)
      : (fbValue * bestOdd) / (layOdd - layCommission);
    
    const liability = layStake * (layOdd - 1);
    const guaranteedProfit = expectedReturn - liability;

    return {
      freebetValue: fbValue,
      bestOdd,
      bestOutcome: marketType === "1x2" 
        ? ["Casa", "Empate", "Fora"][bestIndex]
        : ["Sim", "Não"][bestIndex],
      expectedReturn,
      extractionRate,
      layStake,
      liability,
      guaranteedProfit,
      guaranteedProfitPercent: (guaranteedProfit / fbValue) * 100
    };
  }, [useFreebet, freebetValue, freebetType, marketType, odd1, oddX, odd2, oddYes, oddNo]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  };

  const getRecommendationColor = (type: string) => {
    switch (type) {
      case 'success': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'warning': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'danger': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Calculator className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Calculadora de Arbitragem & Valor</h1>
          <p className="text-sm text-muted-foreground">
            Análise de margem, arbitragem, extração de bônus e valor esperado
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Dados do Mercado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Market Type Selector */}
            <Tabs value={marketType} onValueChange={(v) => setMarketType(v as "1x2" | "binary")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="1x2">1X2 (3 resultados)</TabsTrigger>
                <TabsTrigger value="binary">Binário (2 resultados)</TabsTrigger>
              </TabsList>

              <TabsContent value="1x2" className="space-y-4 mt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Odd Casa (1)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="1.01"
                      placeholder="2.10"
                      value={odd1}
                      onChange={(e) => setOdd1(e.target.value)}
                      className="text-center font-mono text-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Odd Empate (X)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="1.01"
                      placeholder="3.40"
                      value={oddX}
                      onChange={(e) => setOddX(e.target.value)}
                      className="text-center font-mono text-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Odd Fora (2)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="1.01"
                      placeholder="3.20"
                      value={odd2}
                      onChange={(e) => setOdd2(e.target.value)}
                      className="text-center font-mono text-lg"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="binary" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Odd Sim / Over / Back</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="1.01"
                      placeholder="1.85"
                      value={oddYes}
                      onChange={(e) => setOddYes(e.target.value)}
                      className="text-center font-mono text-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Odd Não / Under / Lay</Label>
                    <Input
                      type="number"
                      step="0.01"
                      min="1.01"
                      placeholder="2.05"
                      value={oddNo}
                      onChange={(e) => setOddNo(e.target.value)}
                      className="text-center font-mono text-lg"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Stake Input */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Stake Total (R$)
              </Label>
              <Input
                type="number"
                step="10"
                min="1"
                placeholder="100"
                value={totalStake}
                onChange={(e) => setTotalStake(e.target.value)}
                className="font-mono text-lg"
              />
            </div>

            {/* Freebet Section */}
            <div className="space-y-4 p-4 rounded-lg border border-dashed border-primary/30 bg-primary/5">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useFreebet}
                    onChange={(e) => setUseFreebet(e.target.checked)}
                    className="rounded border-primary"
                  />
                  Calcular extração de Freebet
                </Label>
                {useFreebet && (
                  <div className="flex gap-2">
                    <Badge 
                      variant={freebetType === "snr" ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setFreebetType("snr")}
                    >
                      SNR
                    </Badge>
                    <Badge 
                      variant={freebetType === "sr" ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => setFreebetType("sr")}
                    >
                      SR
                    </Badge>
                  </div>
                )}
              </div>
              {useFreebet && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Valor da Freebet (R$)</Label>
                  <Input
                    type="number"
                    step="10"
                    min="1"
                    placeholder="50"
                    value={freebetValue}
                    onChange={(e) => setFreebetValue(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    {freebetType === "snr" 
                      ? "SNR = Stake Não Retorna (só lucro se ganhar)"
                      : "SR = Stake Retorna (recebe stake + lucro se ganhar)"}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        <div className="space-y-6">
          {analysis ? (
            <>
              {/* Recommendation Card */}
              <Card className={`border ${getRecommendationColor(analysis.recommendationType)}`}>
                <CardContent className="p-4">
                  <p className="text-sm font-medium">{analysis.recommendation}</p>
                </CardContent>
              </Card>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <Percent className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground uppercase">Margem (Juice)</span>
                    </div>
                    <p className={`text-2xl font-bold font-mono ${
                      analysis.marginPercent > 10 ? 'text-red-400' :
                      analysis.marginPercent > 5 ? 'text-amber-400' :
                      'text-emerald-400'
                    }`}>
                      {analysis.marginPercent.toFixed(2)}%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground uppercase">Arbitragem</span>
                    </div>
                    {analysis.hasArbitrage ? (
                      <div className="flex items-center justify-center gap-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                        <span className="text-2xl font-bold font-mono text-emerald-400">
                          +{analysis.arbitrageProfitPercent.toFixed(2)}%
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-muted-foreground" />
                        <span className="text-lg font-medium text-muted-foreground">Não disponível</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground uppercase">EV (Valor Esperado)</span>
                    </div>
                    <p className={`text-2xl font-bold font-mono ${
                      analysis.evPercent > 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {analysis.evPercent > 0 ? '+' : ''}{analysis.evPercent.toFixed(2)}%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-2">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground uppercase">
                        {analysis.hasArbitrage ? 'Lucro Garantido' : 'Lucro Potencial'}
                      </span>
                    </div>
                    <p className={`text-2xl font-bold font-mono ${
                      analysis.hasArbitrage ? 'text-emerald-400' : 'text-foreground'
                    }`}>
                      {formatCurrency(analysis.hasArbitrage ? analysis.arbitrageProfit : analysis.outcomes[0].profit)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Stake Distribution */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Distribuição de Stakes (Cobertura Perfeita)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {analysis.outcomes.map((outcome, i) => {
                      const labels = marketType === "1x2" 
                        ? ["Casa (1)", "Empate (X)", "Fora (2)"]
                        : ["Sim / Over", "Não / Under"];
                      const odds = marketType === "1x2"
                        ? [parseFloat(odd1), parseFloat(oddX), parseFloat(odd2)]
                        : [parseFloat(oddYes), parseFloat(oddNo)];
                        
                      return (
                        <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div>
                            <p className="font-medium">{labels[i]}</p>
                            <p className="text-xs text-muted-foreground">
                              Odd: {odds[i]?.toFixed(2)} | Prob. Implícita: {outcome.impliedProb.toFixed(1)}%
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono font-bold">{formatCurrency(outcome.stake)}</p>
                            <p className="text-xs text-muted-foreground">
                              Retorno: {formatCurrency(outcome.returnValue)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Freebet Extraction Results */}
              {freebetAnalysis && (
                <Card className="border-primary/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Extração de Freebet ({freebetType.toUpperCase()})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Valor da Freebet</p>
                        <p className="font-mono font-bold">{formatCurrency(freebetAnalysis.freebetValue)}</p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Melhor Odd</p>
                        <p className="font-mono font-bold">
                          {freebetAnalysis.bestOdd.toFixed(2)} ({freebetAnalysis.bestOutcome})
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Retorno Esperado</p>
                        <p className="font-mono font-bold text-emerald-400">
                          {formatCurrency(freebetAnalysis.expectedReturn)}
                        </p>
                      </div>
                      <div className="p-3 rounded-lg bg-muted/50">
                        <p className="text-xs text-muted-foreground">Taxa de Extração</p>
                        <p className="font-mono font-bold text-primary">
                          {freebetAnalysis.extractionRate.toFixed(1)}%
                        </p>
                      </div>
                    </div>

                    <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                      <p className="text-sm font-medium text-emerald-400 mb-2">
                        Cobertura Lay Sugerida
                      </p>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-xs text-muted-foreground">Lay Stake</p>
                          <p className="font-mono">{formatCurrency(freebetAnalysis.layStake)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Liability</p>
                          <p className="font-mono">{formatCurrency(freebetAnalysis.liability)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Lucro Garantido</p>
                          <p className="font-mono font-bold text-emerald-400">
                            {formatCurrency(freebetAnalysis.guaranteedProfit)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center py-12">
                <Calculator className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground">
                  Insira as odds para ver a análise completa
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
