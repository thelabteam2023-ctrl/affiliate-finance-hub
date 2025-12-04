import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, TrendingUp, TrendingDown, AlertCircle, CheckCircle } from "lucide-react";

interface MatchedBettingCalculatorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MatchedBettingCalculator({ open, onOpenChange }: MatchedBettingCalculatorProps) {
  const [calculatorType, setCalculatorType] = useState("qualifying");
  
  // Qualifying Bet inputs
  const [qbBackStake, setQbBackStake] = useState(100);
  const [qbBackOdd, setQbBackOdd] = useState(2.0);
  const [qbLayOdd, setQbLayOdd] = useState(2.1);
  const [qbComissao, setQbComissao] = useState(5);

  // Free Bet inputs
  const [fbBackStake, setFbBackStake] = useState(50);
  const [fbBackOdd, setFbBackOdd] = useState(4.0);
  const [fbLayOdd, setFbLayOdd] = useState(4.2);
  const [fbComissao, setFbComissao] = useState(5);
  const [fbStakeReturned, setFbStakeReturned] = useState(false);

  // Results
  const [qbResults, setQbResults] = useState({
    layStake: 0,
    liability: 0,
    profitBackWins: 0,
    profitLayWins: 0,
    qualifyingLoss: 0,
  });

  const [fbResults, setFbResults] = useState({
    layStake: 0,
    liability: 0,
    profitBackWins: 0,
    profitLayWins: 0,
    totalProfit: 0,
    extractionRate: 0,
  });

  useEffect(() => {
    calculateQualifyingBet();
  }, [qbBackStake, qbBackOdd, qbLayOdd, qbComissao]);

  useEffect(() => {
    calculateFreeBet();
  }, [fbBackStake, fbBackOdd, fbLayOdd, fbComissao, fbStakeReturned]);

  const calculateQualifyingBet = () => {
    const comissao = qbComissao / 100;
    const layStake = (qbBackStake * qbBackOdd) / (qbLayOdd - comissao);
    const liability = layStake * (qbLayOdd - 1);
    
    const profitBackWins = qbBackStake * (qbBackOdd - 1) - layStake * (qbLayOdd - 1);
    const profitLayWins = layStake * (1 - comissao) - qbBackStake;
    const qualifyingLoss = Math.min(profitBackWins, profitLayWins);

    setQbResults({
      layStake: Math.round(layStake * 100) / 100,
      liability: Math.round(liability * 100) / 100,
      profitBackWins: Math.round(profitBackWins * 100) / 100,
      profitLayWins: Math.round(profitLayWins * 100) / 100,
      qualifyingLoss: Math.round(qualifyingLoss * 100) / 100,
    });
  };

  const calculateFreeBet = () => {
    const comissao = fbComissao / 100;
    let layStake: number;
    let profitBackWins: number;
    let profitLayWins: number;

    if (fbStakeReturned) {
      // Stake Returned (SNR)
      layStake = (fbBackStake * fbBackOdd) / (fbLayOdd - comissao);
      profitBackWins = fbBackStake * (fbBackOdd - 1) - layStake * (fbLayOdd - 1);
      profitLayWins = layStake * (1 - comissao);
    } else {
      // Stake NOT Returned
      layStake = (fbBackStake * (fbBackOdd - 1)) / (fbLayOdd - comissao);
      profitBackWins = fbBackStake * (fbBackOdd - 1) - layStake * (fbLayOdd - 1);
      profitLayWins = layStake * (1 - comissao);
    }

    const liability = layStake * (fbLayOdd - 1);
    const totalProfit = Math.min(profitBackWins, profitLayWins);
    const extractionRate = (totalProfit / fbBackStake) * 100;

    setFbResults({
      layStake: Math.round(layStake * 100) / 100,
      liability: Math.round(liability * 100) / 100,
      profitBackWins: Math.round(profitBackWins * 100) / 100,
      profitLayWins: Math.round(profitLayWins * 100) / 100,
      totalProfit: Math.round(totalProfit * 100) / 100,
      extractionRate: Math.round(extractionRate * 10) / 10,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const getRatingColor = (qualifyingLoss: number, stake: number) => {
    const lossPercent = Math.abs(qualifyingLoss) / stake * 100;
    if (lossPercent <= 2) return "text-emerald-500";
    if (lossPercent <= 5) return "text-yellow-500";
    return "text-red-500";
  };

  const getExtractionColor = (rate: number) => {
    if (rate >= 80) return "text-emerald-500";
    if (rate >= 70) return "text-yellow-500";
    return "text-red-500";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Calculadora Matched Betting
          </DialogTitle>
        </DialogHeader>

        <Tabs value={calculatorType} onValueChange={setCalculatorType}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="qualifying">Qualifying Bet</TabsTrigger>
            <TabsTrigger value="freebet">Free Bet</TabsTrigger>
          </TabsList>

          <TabsContent value="qualifying" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Calcule o lay stake ideal para apostas qualificadoras, minimizando a perda.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <Label>Stake Back (R$)</Label>
                  <Input
                    type="number"
                    value={qbBackStake}
                    onChange={(e) => setQbBackStake(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Odd Back</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={qbBackOdd}
                    onChange={(e) => setQbBackOdd(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Odd Lay</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={qbLayOdd}
                    onChange={(e) => setQbLayOdd(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Comissão Exchange (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={qbComissao}
                    onChange={(e) => setQbComissao(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Resultados</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Lay Stake:</span>
                    <span className="font-medium">{formatCurrency(qbResults.layStake)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Liability:</span>
                    <span className="font-medium">{formatCurrency(qbResults.liability)}</span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Se BACK ganha:</span>
                      <span className={qbResults.profitBackWins >= 0 ? "text-emerald-500" : "text-red-500"}>
                        {formatCurrency(qbResults.profitBackWins)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Se LAY ganha:</span>
                      <span className={qbResults.profitLayWins >= 0 ? "text-emerald-500" : "text-red-500"}>
                        {formatCurrency(qbResults.profitLayWins)}
                      </span>
                    </div>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Perda Qualificadora:</span>
                      <span className={`font-bold ${getRatingColor(qbResults.qualifyingLoss, qbBackStake)}`}>
                        {formatCurrency(qbResults.qualifyingLoss)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {Math.abs(qbResults.qualifyingLoss) / qbBackStake * 100 <= 5 ? (
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-yellow-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {(Math.abs(qbResults.qualifyingLoss) / qbBackStake * 100).toFixed(1)}% do stake
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="freebet" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Calcule o lucro extraído de uma Free Bet.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-4">
                <div>
                  <Label>Valor da Free Bet (R$)</Label>
                  <Input
                    type="number"
                    value={fbBackStake}
                    onChange={(e) => setFbBackStake(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Odd Back</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={fbBackOdd}
                    onChange={(e) => setFbBackOdd(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Odd Lay</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={fbLayOdd}
                    onChange={(e) => setFbLayOdd(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Comissão Exchange (%)</Label>
                  <Input
                    type="number"
                    step="0.1"
                    value={fbComissao}
                    onChange={(e) => setFbComissao(parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div>
                  <Label>Tipo de Free Bet</Label>
                  <Select
                    value={fbStakeReturned ? "returned" : "not_returned"}
                    onValueChange={(v) => setFbStakeReturned(v === "returned")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="not_returned">Stake NOT Returned (SNR)</SelectItem>
                      <SelectItem value="returned">Stake Returned (SR)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Resultados</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Lay Stake:</span>
                    <span className="font-medium">{formatCurrency(fbResults.layStake)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Liability:</span>
                    <span className="font-medium">{formatCurrency(fbResults.liability)}</span>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Se BACK ganha:</span>
                      <span className="text-emerald-500">
                        {formatCurrency(fbResults.profitBackWins)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Se LAY ganha:</span>
                      <span className="text-emerald-500">
                        {formatCurrency(fbResults.profitLayWins)}
                      </span>
                    </div>
                  </div>
                  <div className="border-t pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Lucro Garantido:</span>
                      <span className="font-bold text-emerald-500">
                        {formatCurrency(fbResults.totalProfit)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <span className="text-sm text-muted-foreground">Taxa de Extração:</span>
                      <span className={`font-bold ${getExtractionColor(fbResults.extractionRate)}`}>
                        {fbResults.extractionRate}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {fbResults.extractionRate >= 70 ? (
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <TrendingDown className="h-4 w-4 text-yellow-500" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {fbResults.extractionRate >= 80 ? "Excelente" : fbResults.extractionRate >= 70 ? "Bom" : "Considere odds melhores"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
