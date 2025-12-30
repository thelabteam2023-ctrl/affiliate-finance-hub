import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type StatusPerna = 'pendente' | 'green' | 'red';
export type TipoAposta = 'simples' | 'dupla' | 'tripla' | 'personalizado';
export type ObjetivoAposta = 'perder_casa' | 'limitar_lucro' | 'neutralizar_greens';
export type MoedaCalc = 'BRL' | 'USD';

export interface PernaAposta {
  id: number;
  oddBack: number;        // Odd do back (na casa)
  oddLay: number;         // Odd do lay (que o usuário conseguiu na exchange)
  status: StatusPerna;
  lucroAcumulado: number;
  stakeLay: number;       // Valor a apostar no lay
  responsabilidade: number;
  resultadoSeGreen: number;
  resultadoSeRed: number;
  juiceSeGreen: number;   // Juice % em caso de green
  juiceSeRed: number;     // Juice % em caso de red
}

export interface JuiceData {
  exposicaoTotal: number;
  lucroVirtual: number;
  protecaoTotal: number;
  resultadoEsperado: number;
  juiceMedioGreen: number;
  juiceMedioRed: number;
}

interface CalculadoraState {
  isOpen: boolean;
  isMinimized: boolean;
  position: { x: number; y: number };
  tipoAposta: TipoAposta;
  objetivo: ObjetivoAposta;
  stakeInicial: number;
  comissaoExchange: number;
  moeda: MoedaCalc;
  pernas: PernaAposta[];
  numPernas: number;
}

interface CalculadoraContextType extends CalculadoraState {
  openCalculadora: () => void;
  closeCalculadora: () => void;
  toggleMinimize: () => void;
  setPosition: (pos: { x: number; y: number }) => void;
  setTipoAposta: (tipo: TipoAposta) => void;
  setObjetivo: (objetivo: ObjetivoAposta) => void;
  setStakeInicial: (stake: number) => void;
  setComissaoExchange: (comissao: number) => void;
  setMoeda: (moeda: MoedaCalc) => void;
  setNumPernas: (num: number) => void;
  updatePernaOddBack: (id: number, odd: number) => void;
  updatePernaOddLay: (id: number, odd: number) => void;
  setPernaStatus: (id: number, status: StatusPerna) => void;
  resetCalculadora: () => void;
  getJuiceData: () => JuiceData;
  getAcaoRecomendada: () => { stakeLay: number; oddLay: number; resultadoSeGanhar: number; resultadoSePerder: number; pernaAtual: number; juiceGreen: number; juiceRed: number } | null;
}

const defaultState: CalculadoraState = {
  isOpen: false,
  isMinimized: false,
  position: { x: window.innerWidth - 520, y: 100 },
  tipoAposta: 'dupla',
  objetivo: 'perder_casa',
  stakeInicial: 100,
  comissaoExchange: 5,
  moeda: 'BRL',
  pernas: [],
  numPernas: 2,
};

const CalculadoraContext = createContext<CalculadoraContextType | null>(null);

export const useCalculadora = () => {
  const context = useContext(CalculadoraContext);
  if (!context) {
    throw new Error('useCalculadora must be used within CalculadoraProvider');
  }
  return context;
};

const createPernas = (num: number): PernaAposta[] => {
  return Array.from({ length: num }, (_, i) => ({
    id: i + 1,
    oddBack: 1.5,
    oddLay: 1.5,
    status: 'pendente' as StatusPerna,
    lucroAcumulado: 0,
    stakeLay: 0,
    responsabilidade: 0,
    resultadoSeGreen: 0,
    resultadoSeRed: 0,
    juiceSeGreen: 0,
    juiceSeRed: 0,
  }));
};

export const CalculadoraProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<CalculadoraState>({
    ...defaultState,
    pernas: createPernas(2),
  });

  const recalcularPernas = useCallback((
    pernas: PernaAposta[],
    stakeInicial: number,
    comissao: number,
    objetivo: ObjetivoAposta
  ): PernaAposta[] => {
    let stakeAcumulado = stakeInicial;
    let lucroAcumulado = 0;
    const comissaoDecimal = comissao / 100;
    
    return pernas.map((perna, index) => {
      // Se já deu red, não calcula mais nada
      const pernaAnteriorRed = pernas.slice(0, index).some(p => p.status === 'red');
      if (pernaAnteriorRed) {
        return {
          ...perna,
          lucroAcumulado: 0,
          stakeLay: 0,
          responsabilidade: 0,
          resultadoSeGreen: 0,
          resultadoSeRed: 0,
          juiceSeGreen: 0,
          juiceSeRed: 0,
        };
      }

      const oddBack = perna.oddBack;
      const oddLay = perna.oddLay;
      
      // Retorno potencial se ganhar na casa
      const retornoPotencial = stakeAcumulado * oddBack;
      const lucroBackBruto = retornoPotencial - stakeAcumulado;
      
      // Cálculo do stake lay baseado no objetivo
      let stakeLay = 0;
      let responsabilidade = 0;
      let resultadoSeGreen = 0;
      let resultadoSeRed = 0;

      if (objetivo === 'perder_casa') {
        // Para perder na casa: lay cobre todo o lucro potencial
        // stakeLay * (oddLay - 1) = lucroBackBruto
        stakeLay = lucroBackBruto / (oddLay - 1);
        responsabilidade = stakeLay * (oddLay - 1);
        
        // Se GREEN na casa: ganha back, perde lay
        resultadoSeGreen = lucroBackBruto - responsabilidade;
        
        // Se RED na casa: perde stake, ganha lay (menos comissão)
        resultadoSeRed = stakeLay * (1 - comissaoDecimal) - stakeAcumulado;
        
      } else if (objetivo === 'limitar_lucro') {
        // Limitar lucro a 10% do stake
        const lucroMaximoDesejado = stakeAcumulado * 0.1;
        stakeLay = Math.max(0, (lucroBackBruto - lucroMaximoDesejado) / (oddLay - 1));
        responsabilidade = stakeLay * (oddLay - 1);
        resultadoSeGreen = lucroBackBruto - responsabilidade;
        resultadoSeRed = stakeLay * (1 - comissaoDecimal) - stakeAcumulado;
        
      } else {
        // Neutralizar greens: lay total para zerar
        stakeLay = retornoPotencial / oddLay;
        responsabilidade = stakeLay * (oddLay - 1);
        resultadoSeGreen = lucroBackBruto - responsabilidade;
        resultadoSeRed = stakeLay * (1 - comissaoDecimal) - stakeAcumulado;
      }

      // Cálculo do juice (%) = resultado / exposição total
      const exposicaoTotal = stakeAcumulado + responsabilidade;
      const juiceSeGreen = exposicaoTotal > 0 ? (resultadoSeGreen / exposicaoTotal) * 100 : 0;
      const juiceSeRed = exposicaoTotal > 0 ? (resultadoSeRed / exposicaoTotal) * 100 : 0;

      // Se esta perna já deu green, acumula
      if (perna.status === 'green') {
        lucroAcumulado += resultadoSeGreen;
        stakeAcumulado = retornoPotencial;
      }

      return {
        ...perna,
        lucroAcumulado,
        stakeLay: Math.max(0, stakeLay),
        responsabilidade: Math.max(0, responsabilidade),
        resultadoSeGreen,
        resultadoSeRed,
        juiceSeGreen,
        juiceSeRed,
      };
    });
  }, []);

  const openCalculadora = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: true, isMinimized: false }));
  }, []);

  const closeCalculadora = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false }));
  }, []);

  const toggleMinimize = useCallback(() => {
    setState(prev => ({ ...prev, isMinimized: !prev.isMinimized }));
  }, []);

  const setPosition = useCallback((pos: { x: number; y: number }) => {
    setState(prev => ({ ...prev, position: pos }));
  }, []);

  const setTipoAposta = useCallback((tipo: TipoAposta) => {
    const numMap: Record<TipoAposta, number> = {
      simples: 1,
      dupla: 2,
      tripla: 3,
      personalizado: 4,
    };
    const num = numMap[tipo];
    setState(prev => {
      const newPernas = createPernas(num);
      return {
        ...prev,
        tipoAposta: tipo,
        numPernas: num,
        pernas: recalcularPernas(newPernas, prev.stakeInicial, prev.comissaoExchange, prev.objetivo),
      };
    });
  }, [recalcularPernas]);

  const setObjetivo = useCallback((objetivo: ObjetivoAposta) => {
    setState(prev => ({
      ...prev,
      objetivo,
      pernas: recalcularPernas(prev.pernas, prev.stakeInicial, prev.comissaoExchange, objetivo),
    }));
  }, [recalcularPernas]);

  const setStakeInicial = useCallback((stake: number) => {
    setState(prev => ({
      ...prev,
      stakeInicial: stake,
      pernas: recalcularPernas(prev.pernas, stake, prev.comissaoExchange, prev.objetivo),
    }));
  }, [recalcularPernas]);

  const setComissaoExchange = useCallback((comissao: number) => {
    setState(prev => ({
      ...prev,
      comissaoExchange: comissao,
      pernas: recalcularPernas(prev.pernas, prev.stakeInicial, comissao, prev.objetivo),
    }));
  }, [recalcularPernas]);

  const setMoeda = useCallback((moeda: MoedaCalc) => {
    setState(prev => ({ ...prev, moeda }));
  }, []);

  const setNumPernas = useCallback((num: number) => {
    setState(prev => {
      const newPernas = createPernas(num);
      return {
        ...prev,
        numPernas: num,
        tipoAposta: num <= 3 ? (['simples', 'dupla', 'tripla'] as TipoAposta[])[num - 1] : 'personalizado',
        pernas: recalcularPernas(newPernas, prev.stakeInicial, prev.comissaoExchange, prev.objetivo),
      };
    });
  }, [recalcularPernas]);

  const updatePernaOddBack = useCallback((id: number, odd: number) => {
    setState(prev => {
      const newPernas = prev.pernas.map(p => p.id === id ? { ...p, oddBack: odd } : p);
      return {
        ...prev,
        pernas: recalcularPernas(newPernas, prev.stakeInicial, prev.comissaoExchange, prev.objetivo),
      };
    });
  }, [recalcularPernas]);

  const updatePernaOddLay = useCallback((id: number, odd: number) => {
    setState(prev => {
      const newPernas = prev.pernas.map(p => p.id === id ? { ...p, oddLay: odd } : p);
      return {
        ...prev,
        pernas: recalcularPernas(newPernas, prev.stakeInicial, prev.comissaoExchange, prev.objetivo),
      };
    });
  }, [recalcularPernas]);

  const setPernaStatus = useCallback((id: number, status: StatusPerna) => {
    setState(prev => {
      const newPernas = prev.pernas.map(p => p.id === id ? { ...p, status } : p);
      return {
        ...prev,
        pernas: recalcularPernas(newPernas, prev.stakeInicial, prev.comissaoExchange, prev.objetivo),
      };
    });
  }, [recalcularPernas]);

  const resetCalculadora = useCallback(() => {
    setState(prev => ({
      ...prev,
      pernas: recalcularPernas(createPernas(prev.numPernas), prev.stakeInicial, prev.comissaoExchange, prev.objetivo),
    }));
  }, [recalcularPernas]);

  const getJuiceData = useCallback((): JuiceData => {
    const { pernas, stakeInicial } = state;
    
    const protecaoTotal = pernas.reduce((sum, p) => sum + p.stakeLay, 0);
    const lucroVirtual = pernas.reduce((sum, p) => {
      if (p.status === 'green') return sum + p.resultadoSeGreen;
      return sum;
    }, 0);
    
    const pernasPendentes = pernas.filter(p => p.status === 'pendente');
    const proximaPerna = pernasPendentes[0];
    
    let resultadoEsperado = lucroVirtual;
    if (proximaPerna) {
      resultadoEsperado = proximaPerna.resultadoSeRed;
    }

    // Média dos juices
    const pernasAtivas = pernas.filter(p => p.status !== 'red' && !pernas.slice(0, pernas.indexOf(p)).some(pr => pr.status === 'red'));
    const juiceMedioGreen = pernasAtivas.length > 0 
      ? pernasAtivas.reduce((sum, p) => sum + p.juiceSeGreen, 0) / pernasAtivas.length 
      : 0;
    const juiceMedioRed = pernasAtivas.length > 0 
      ? pernasAtivas.reduce((sum, p) => sum + p.juiceSeRed, 0) / pernasAtivas.length 
      : 0;

    return {
      exposicaoTotal: stakeInicial,
      lucroVirtual,
      protecaoTotal,
      resultadoEsperado,
      juiceMedioGreen,
      juiceMedioRed,
    };
  }, [state]);

  const getAcaoRecomendada = useCallback(() => {
    const { pernas } = state;
    
    const proximaPerna = pernas.find(p => p.status === 'pendente');
    if (!proximaPerna) return null;
    
    const algumRed = pernas.some(p => p.status === 'red');
    if (algumRed) return null;

    return {
      stakeLay: proximaPerna.stakeLay,
      oddLay: proximaPerna.oddLay,
      resultadoSeGanhar: proximaPerna.resultadoSeGreen,
      resultadoSePerder: proximaPerna.resultadoSeRed,
      pernaAtual: proximaPerna.id,
      juiceGreen: proximaPerna.juiceSeGreen,
      juiceRed: proximaPerna.juiceSeRed,
    };
  }, [state]);

  return (
    <CalculadoraContext.Provider
      value={{
        ...state,
        openCalculadora,
        closeCalculadora,
        toggleMinimize,
        setPosition,
        setTipoAposta,
        setObjetivo,
        setStakeInicial,
        setComissaoExchange,
        setMoeda,
        setNumPernas,
        updatePernaOddBack,
        updatePernaOddLay,
        setPernaStatus,
        resetCalculadora,
        getJuiceData,
        getAcaoRecomendada,
      }}
    >
      {children}
    </CalculadoraContext.Provider>
  );
};
