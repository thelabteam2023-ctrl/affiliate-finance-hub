/**
 * SurebetProfitDistribution - Controle de distribuição de lucro
 * 
 * Permite escolher entre:
 * - Automático: distribui lucro igualmente entre as pernas
 * - Direcionar: concentra o lucro em uma perna específica
 */
import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface OddEntry {
  selecao: string;
  bookmaker_id: string;
}

interface BookmakerOption {
  id: string;
  nome: string;
}

interface SurebetProfitDistributionProps {
  mode: 'auto' | 'directed';
  setMode: (mode: 'auto' | 'directed') => void;
  targetLegIndex: number | null;
  setTargetLegIndex: (index: number | null) => void;
  odds: OddEntry[];
  bookmakers: BookmakerOption[];
}

export function SurebetProfitDistribution({
  mode,
  setMode,
  targetLegIndex,
  setTargetLegIndex,
  odds,
  bookmakers,
}: SurebetProfitDistributionProps) {
  // Encontrar nome do bookmaker para cada perna
  const getBookmakerNome = (bookmarkerId: string) => {
    return bookmakers.find(b => b.id === bookmarkerId)?.nome || 'Casa';
  };

  return (
    <div className="space-y-2 pt-3 border-t border-border/30">
      <span className="text-xs font-medium text-muted-foreground">Distribuir lucro:</span>
      
      <RadioGroup 
        value={mode} 
        onValueChange={(val) => setMode(val as 'auto' | 'directed')}
        className="flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="auto" id="dist-auto" className="h-3.5 w-3.5" />
          <Label htmlFor="dist-auto" className="text-xs cursor-pointer">
            Automático
          </Label>
        </div>
        
        <div className="flex items-center gap-2">
          <RadioGroupItem value="directed" id="dist-directed" className="h-3.5 w-3.5" />
          <Label htmlFor="dist-directed" className="text-xs cursor-pointer">
            Direcionar para uma perna
          </Label>
          
          {mode === 'directed' && (
            <Select
              value={targetLegIndex !== null ? targetLegIndex.toString() : undefined}
              onValueChange={(val) => setTargetLegIndex(parseInt(val, 10))}
            >
              <SelectTrigger className="h-7 w-[140px] text-xs border-muted ml-2">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                {odds.map((entry, index) => (
                  <SelectItem key={index} value={index.toString()} className="text-xs">
                    {entry.selecao} - {getBookmakerNome(entry.bookmaker_id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </RadioGroup>
    </div>
  );
}
