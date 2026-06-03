import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, Trash2 } from 'lucide-react';
import { PlannedOp, ExtractionConfig } from '@/lib/ferramentas/extracao-bonus/types';
import { calculateScenarios } from '@/lib/ferramentas/extracao-bonus/engine';

interface PlanejadorProps {
  sequence: PlannedOp[];
  seqBanca: number;
  setSeqBanca: (v: number) => void;
  seqMeta: number;
  setSeqMeta: (v: number) => void;
  simulateSequence: () => void;
  seqResult: any;
  removeOp: (id: string) => void;
  config: ExtractionConfig;
  fmt: (v: number) => string;
}

export const PlanejadorIA: React.FC<PlanejadorProps> = ({
  sequence, seqBanca, setSeqBanca, seqMeta, setSeqMeta, simulateSequence, seqResult, removeOp, config, fmt
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-4">
        <Card>
          <CardHeader><CardTitle className="text-sm font-bold uppercase text-muted-foreground">Configuração da Meta</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Banca Inicial</Label>
              <Input type="number" value={seqBanca} onChange={e => setSeqBanca(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Meta de Lucro</Label>
              <Input type="number" value={seqMeta} onChange={e => setSeqMeta(Number(e.target.value))} />
            </div>
            <Button className="w-full gap-2" disabled={sequence.length === 0} onClick={simulateSequence}>
              <Play className="w-4 h-4" /> Simular Sequência
            </Button>
          </CardContent>
        </Card>
        {seqResult && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 text-center">
              <p className="text-[10px] uppercase font-bold text-muted-foreground">Probabilidade de Sucesso</p>
              <p className="text-3xl font-black text-emerald-400">{(seqResult.probSuccess * 100).toFixed(1)}%</p>
            </CardContent>
          </Card>
        )}
      </div>
      <div className="lg:col-span-2 space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-bold uppercase text-muted-foreground">Minha Estratégia</CardTitle>
            <Badge variant="outline">{sequence.length} ops</Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {sequence.length === 0 && (
              <div className="text-center py-8 text-muted-foreground italic text-sm">
                Nenhuma operação adicionada. Use a Calculadora para montar seu plano.
              </div>
            )}
            {sequence.map((op, index) => {
              const opSc = calculateScenarios(config, op.odd1, op.odd2);
              return (
                <div key={op.id} className="flex items-center gap-3 p-3 bg-muted/20 border rounded-lg">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">{index + 1}</div>
                  <div className="flex-1 grid grid-cols-4 gap-4">
                    <div><p className="text-[9px] uppercase text-muted-foreground">Odd P1</p><p className="text-sm font-mono font-bold">{op.odd1.toFixed(2)}</p></div>
                    <div><p className="text-[9px] uppercase text-muted-foreground">Odd P2</p><p className="text-sm font-mono font-bold">{op.odd2.toFixed(2)}</p></div>
                    <div><p className="text-[9px] uppercase text-muted-foreground">EV</p><p className="text-sm font-bold text-emerald-400">${fmt(opSc.eVal)}</p></div>
                    <div><p className="text-[9px] uppercase text-muted-foreground">Risco</p><p className="text-sm font-bold text-red-400">${fmt(Math.abs(opSc.c3))}</p></div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeOp(op.id)} className="text-red-400"><Trash2 className="w-4 h-4" /></Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
