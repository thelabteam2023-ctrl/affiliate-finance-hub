import React from 'react';
import { Calculator } from 'lucide-react';
import { CalculadoraProtecaoContent } from '@/components/ferramentas/CalculadoraProtecaoContent';

/**
 * Página standalone da Calculadora de Proteção Progressiva.
 * Acessível via URL direta: /ferramentas/protecao-progressiva
 * 
 * Este é o contexto EXTERNO - funciona como página independente,
 * pode ser aberta em nova aba ou nova janela do navegador,
 * não compartilha scroll/foco com o layout principal.
 */
const ProtecaoProgressiva: React.FC = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header simples */}
      <header className="shrink-0 border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-3 max-w-7xl mx-auto">
          <Calculator className="h-6 w-6 text-primary" />
          <h1 className="font-semibold text-foreground text-lg">Proteção Progressiva</h1>
        </div>
      </header>

      {/* Conteúdo principal */}
      <main className="flex-1 overflow-hidden">
        <div className="h-full max-w-7xl mx-auto">
          <CalculadoraProtecaoContent />
        </div>
      </main>

      {/* Footer discreto */}
      <footer className="shrink-0 border-t border-border bg-muted/20 px-4 py-2">
        <p className="text-xs text-muted-foreground text-center">
          Calculadora de Proteção Progressiva • Ferramenta de extração de bônus
        </p>
      </footer>
    </div>
  );
};

export default ProtecaoProgressiva;
