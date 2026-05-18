import React, { useState, useMemo } from 'react';
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
  Plus, Trash2, Info, ChevronRight, Zap, BarChart3
} from 'lucide-react';
import { 
  HedgeProbabilisticoEngine, 
  type LegInput,
  type HedgeResult 
} from '@/lib/hedge-probabilistico-engine';
import { CardInfoTooltip } from '@/components/ui/card-info-tooltip';

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtPct = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';

export const CalculadoraHedgeProbabilisticaContent: React.FC = () => {
  const [freebet, setFreebet] = useState(100);
  const [commission, setCommission] = useState(2.8);
  const [efficiency, setEfficiency] = useState(0.8);
  const [legs, setLegs] = useState<LegInput[]>([
    { name: 'Evento 1', backOdd: 2.0, layOdd: 2.0 },
    { name: 'Evento 2', backOdd: 2.0, layOdd: 2.0 }
  ]);

  const metrics: HedgeResult = useMemo(() => {
    return HedgeProbabilisticoEngine.calculateMetrics(
      legs, 
      freebet, 
      commission / 100, 
      efficiency
    );
  }, [legs, freebet, commission, efficiency]);

  const addLeg = () => {
    if (legs.length >= 5) return;
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

  const scoreColor = {
    excellent: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    good: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    risky: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    critical: 'bg-red-500/15 text-red-400 border-red-500/30'
  }[metrics.score];

  const scoreLabel = {
    excellent: 'Excelente',
    good: 'Boa',
    risky: 'Arriscada',
    critical: 'Crítica'
  }[metrics.score];

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row gap-4 items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Zap className="h-6 w-6 text-primary" />
              Calculadora de Hedge Probabilístico
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Motor quantitativo para extração de freebets com análise de risco e cascata.
            </p>
          </div>
          <Badge className={`px-4 py-1 text-sm ${scoreColor}`}>
            Score: {scoreLabel}
          </Badge>
        </div>

        {/* KPIs Section */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Target className="h-3 w-3" /> EV Esperado
              </div>
              <div className="text-xl font-bold text-emerald-400">R$ {fmt(metrics.totalEV)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Valor médio probabilístico</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> ROI Final
              </div>
              <div className="text-xl font-bold text-blue-400">{fmtPct(metrics.totalROI)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Eficiência real da operação</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Risco Máximo
              </div>
              <div className="text-xl font-bold text-red-400">R$ {fmt(metrics.maxResponsibility)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Exposição na exchange</div>
            </CardContent>
          </Card>
          <Card className="bg-muted/30">
            <CardContent className="pt-4 flex flex-col items-center text-center">
              <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                <Shield className="h-3 w-3" /> Capital Mínimo
              </div>
              <div className="text-xl font-bold text-primary">R$ {fmt(metrics.capitalRequired)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Necessidade de caixa</div>
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
                      Eficiência Operacional
                      <CardInfoTooltip title="Eficiência" description="Ajuste fino de quanto do lucro você quer extrair. 100% maximiza o EV mas pode aumentar a responsabilidade." />
                    </Label>
                    <span className="text-xs font-mono text-primary">{Math.round(efficiency * 100)}%</span>
                  </div>
                  <Slider 
                    value={[efficiency * 100]} 
                    min={70} 
                    max={100} 
                    step={1} 
                    onValueChange={(val) => setEfficiency(val[0] / 100)}
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>Seguro (70%)</span>
                    <span>Agressivo (100%)</span>
                  </div>
                </div>
              </CardContent>
            </Card>

             <Card>
               <CardHeader className="pb-3">
                 <CardTitle className="text-sm font-medium flex items-center gap-2">
                   <BarChart3 className="h-4 w-4" /> Resumo da Cascata
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-3">
                 <div className="flex justify-between items-center text-xs">
                   <span className="text-muted-foreground">Custo Acumulado Total</span>
                   <span className="font-mono text-red-400">R$ {fmt(metrics.cumulativeCascadeCost)}</span>
                 </div>
                 <div className="flex justify-between items-center text-xs">
                   <span className="text-muted-foreground">Lucro "Todas Ganham"</span>
                   <span className={`font-mono ${metrics.allWonProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                     R$ {fmt(metrics.allWonProfit)}
                   </span>
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
                      <TableHead className="w-[180px]">Evento</TableHead>
                      <TableHead>Odd Back</TableHead>
                      <TableHead>Odd Lay</TableHead>
                      <TableHead className="text-right">Lay Stake</TableHead>
                      <TableHead className="text-right">Respons.</TableHead>
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
                            <Input 
                              type="number"
                              value={leg.backOdd} 
                              onChange={(e) => updateLeg(index, 'backOdd', Number(e.target.value))}
                              className="h-8 text-xs font-mono w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number"
                              value={leg.layOdd} 
                              onChange={(e) => updateLeg(index, 'layOdd', Number(e.target.value))}
                              className="h-8 text-xs font-mono w-20"
                            />
                          </TableCell>
                          <TableCell className="text-right font-mono text-blue-400">
                            R$ {fmt(calcLeg.layStake)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-red-400">
                            R$ {fmt(calcLeg.responsibility)}
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
                  {metrics.scenarios
                    .sort((a, b) => b.probability - a.probability)
                    .map((scenario, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 border border-border/50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Cenário {idx + 1}</span>
                          <span className="text-xs font-medium truncate">{scenario.description}</span>
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
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ScrollArea>
  );
};
