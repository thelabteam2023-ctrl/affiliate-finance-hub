import React from 'react';
import { CalculadoraHedgeProbabilisticaContent } from '@/components/ferramentas/CalculadoraHedgeProbabilisticaContent';

const CalculadoraHedgeProbabilistica: React.FC = () => {
  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background">
      <CalculadoraHedgeProbabilisticaContent />
    </div>
  );
};

export default CalculadoraHedgeProbabilistica;
