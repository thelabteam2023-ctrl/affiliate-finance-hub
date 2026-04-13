import React from 'react';
import { Zap } from 'lucide-react';
import { CalculadoraExtracaoContent } from '@/components/ferramentas/CalculadoraExtracaoContent';

const CalculadoraExtracao: React.FC = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="shrink-0 border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h1 className="font-semibold text-foreground text-sm">Calculadora de Extração</h1>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="h-full">
          <CalculadoraExtracaoContent />
        </div>
      </main>
      <footer className="shrink-0 border-t border-border bg-muted/20 px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground text-center">
          Calculadora de Extração • Otimizador de conversão de bônus/freebet
        </p>
      </footer>
    </div>
  );
};

export default CalculadoraExtracao;
