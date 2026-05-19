import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TrendingUp, Shield, Zap, Target } from 'lucide-react';
import { HedgeProbabilisticoEngine } from '@/lib/hedge-probabilistico-engine';

const ODDS_RULESETS = [
  { id: "standard", label: "1.50 → 10.00", minOdd: 1.5, maxOdd: 10 },
  { id: "restricted_medium", label: "1.80 → 8.00", minOdd: 1.8, maxOdd: 8 },
  { id: "restricted_high", label: "2.00 → 5.00", minOdd: 2, maxOdd: 5 },
  { id: "unlimited", label: "1.50 → Ilimitado", minOdd: 1.5, maxOdd: 99 },
  { id: "custom", label: "Personalizado", minOdd: 1.5, maxOdd: 10 }
];

export const BibliotecaOuroDinamica: React.FC<{ freebet: number; target: number; commission: number }> = ({ freebet, target, commission }) => {
  const [activeRuleset, setActiveRuleset] = useState(ODDS_RULESETS[0]);
  const [customRules, setCustomRules] = useState({ minOdd: 1.5, maxOdd: 10, maxLegs: 5 });

  const currentRules = activeRuleset.id === 'custom' ? customRules : activeRuleset;

  const strategies = useMemo(() => {
    // Basic dynamic generation logic
    const results = [];
    for (let legs = 1; legs <= (activeRuleset.id === 'custom' ? customRules.maxLegs : 5); legs++) {
      const dummyLegs = Array(legs).fill(null).map((_, i) => ({
        name: `Leg ${i+1}`,
        backOdd: currentRules.minOdd + (i * 0.2),
        layOdd: currentRules.minOdd + (i * 0.2) + 0.1
      }));
      const m = HedgeProbabilisticoEngine.calculateMetrics(dummyLegs, freebet, commission, target);
      results.push({ legs, metrics: m });
    }
    return results;
  }, [currentRules, freebet, target, commission]);

  return (
    <div className="space-y-4">
      <Tabs value={activeRuleset.id} onValueChange={(v) => setActiveRuleset(ODDS_RULESETS.find(r => r.id === v) || ODDS_RULESETS[0])}>
        <TabsList className="grid grid-cols-5 h-9 bg-muted/20">
          {ODDS_RULESETS.map(r => (
            <TabsTrigger key={r.id} value={r.id} className="text-[10px]">{r.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activeRuleset.id === 'custom' && (
        <div className="grid grid-cols-3 gap-2 p-2 bg-muted/10 rounded-md border border-border/50">
          <div className="space-y-1">
            <Label className="text-[10px]">Min Odd</Label>
            <Input type="number" step="0.1" className="h-7 text-xs" value={customRules.minOdd} onChange={(e) => setCustomRules({...customRules, minOdd: Number(e.target.value)})} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Max Odd</Label>
            <Input type="number" step="0.1" className="h-7 text-xs" value={customRules.maxOdd} onChange={(e) => setCustomRules({...customRules, maxOdd: Number(e.target.value)})} />
          </div>
          <div className="space-y-1">
            <Label className="text-[10px]">Máx Pernas</Label>
            <Input type="number" className="h-7 text-xs" value={customRules.maxLegs} onChange={(e) => setCustomRules({...customRules, maxLegs: Number(e.target.value)})} />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {strategies.map((s, i) => (
          <Card key={i} className="bg-muted/5 border-border/40 overflow-hidden hover:border-primary/30 transition-colors">
            <CardContent className="p-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-bold">{s.legs} {s.legs === 1 ? 'PERNA' : 'PERNAS'}</Badge>
                  <span className="text-xs font-mono text-emerald-400">ROI: {s.metrics.totalROI.toFixed(1)}%</span>
                </div>
                <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1"><Zap className="h-3 w-3" /> Aplicar</Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
