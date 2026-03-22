import React from 'react';
import { TrendingUp } from 'lucide-react';
import { CalculadoraEVContent } from '@/components/ferramentas/CalculadoraEVContent';

const CalculadoraEV: React.FC = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="shrink-0 border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h1 className="font-semibold text-foreground text-sm">Calculadora EV & Ajuste de Stake</h1>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <div className="h-full">
          <CalculadoraEVContent />
        </div>
      </main>
      <footer className="shrink-0 border-t border-border bg-muted/20 px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground text-center">
          Calculadora de Expected Value • Ferramenta de análise quantitativa
        </p>
      </footer>
    </div>
  );
};

export default CalculadoraEV;
