import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ListPlus } from 'lucide-react';
import { ExtractionConfig } from '@/lib/ferramentas/extracao-bonus/types';
import { calculateScenarios } from '@/lib/ferramentas/extracao-bonus/engine';

interface CalculadoraProps {
  config: ExtractionConfig;
  o1: number;
  setO1: (v: number) => void;
  o2: number;
  setO2: (v: number) => void;
  addOpToSequence: () => void;
  sc: any;
  fmt: (v: number) => string;
}

export const CalculadoraExtração: React.FC<CalculadoraProps> = ({ 
  config, o1, setO1, o2, setO2, addOpToSequence, sc, fmt 
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle className="text-xs font-bold uppercase text-muted-foreground">Entrada de Odds</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Odd Perna 1</Label>
            <Input type="number" step="0.01" value={o1} onChange={e => setO1(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Odd Perna 2</Label>
            <Input type="number" step="0.01" value={o2} onChange={e => setO2(Number(e.target.value))} />
          </div>
          <Button onClick={addOpToSequence} className="w-full gap-2"><ListPlus className="w-4 h-4" /> Adicionar ao Planejador</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-xs font-bold uppercase text-muted-foreground">Resultados</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-2">
          <div className="p-3 bg-muted/20 rounded border text-center">
            <p className="text-[10px] uppercase">Lucro Médio</p>
            <p className="text-lg font-bold text-emerald-400">${fmt(sc.eVal)}</p>
          </div>
          <div className="p-3 bg-muted/20 rounded border text-center">
            <p className="text-[10px] uppercase">Risco (C3)</p>
            <p className="text-lg font-bold text-red-400">${fmt(Math.abs(sc.c3))}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
