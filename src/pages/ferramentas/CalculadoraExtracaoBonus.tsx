import React from 'react';
import { Zap } from 'lucide-react';
import { ExtracaoBonusContent } from '@/components/ferramentas/extracao-bonus/ExtracaoBonusContent';

const CalculadoraExtracaoBonus: React.FC = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="shrink-0 border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" />
          <h1 className="font-semibold text-foreground text-sm">Extração de Bônus</h1>
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="h-full">
          <ExtracaoBonusContent />
        </div>
      </main>
      <footer className="shrink-0 border-t border-border bg-muted/20 px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground text-center">
          Labbet • Ferramenta de Extração de Bônus v1.0
        </p>
      </footer>
    </div>
  );
};

export default CalculadoraExtracaoBonus;
