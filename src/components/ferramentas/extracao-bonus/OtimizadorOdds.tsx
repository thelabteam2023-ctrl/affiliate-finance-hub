import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Search } from 'lucide-react';
import { SimulationParams } from '@/lib/ferramentas/extracao-bonus/types';

interface OtimizadorProps {
  optParams: SimulationParams;
  updateOptParams: (key: keyof SimulationParams, value: any) => void;
  handleOptimize: () => void;
  isOptimizing: boolean;
  optProgress: number;
  sortedOptResults: any[];
  setAuditTarget: (res: any) => void;
  fmt: (v: number) => string;
}

export const OtimizadorOdds: React.FC<OtimizadorProps> = ({
  optParams, updateOptParams, handleOptimize, isOptimizing, optProgress, sortedOptResults, setAuditTarget, fmt
}) => {
  return (
    <div className="space-y-6">
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
      
      {isOptimizing && <Progress value={optProgress} className="h-2" />}
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedOptResults.map((res, i) => (
          <Card key={i} className="cursor-pointer hover:border-primary/50 transition-colors bg-muted/5 border-muted" onClick={() => setAuditTarget(res)}>
            <CardContent className="pt-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-[10px] uppercase text-muted-foreground">Estratégia</p>
                  <p className="text-lg font-bold">{res.o1.toFixed(2)} × {res.o2.toFixed(2)}</p>
                </div>
                <Search className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
