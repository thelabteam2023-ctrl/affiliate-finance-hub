import React from 'react';
import { Clock } from 'lucide-react';
import { CalculadoraPontoFuturoContent } from '@/components/ferramentas/CalculadoraPontoFuturoContent';

const CalculadoraPontoFuturo: React.FC = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="shrink-0 border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary" />
          <h1 className="font-semibold text-foreground text-sm">Ponto de Edge Futuro</h1>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto">
          <CalculadoraPontoFuturoContent />
        </div>
      </main>
      <footer className="shrink-0 border-t border-border bg-muted/20 px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground text-center">
          Ponto de Edge Futuro • Motor matemático de projeção temporal para hedge futuro.
        </p>
      </footer>
    </div>
  );
};

export default CalculadoraPontoFuturo;