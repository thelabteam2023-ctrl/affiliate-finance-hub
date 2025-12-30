import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export type StatusPerna = 'pendente' | 'green' | 'red';
export type TipoAposta = 'simples' | 'dupla' | 'tripla' | 'personalizado';
export type ObjetivoAposta = 'perder_casa' | 'limitar_lucro' | 'neutralizar_greens';
export type MoedaCalc = 'BRL' | 'USD';

export interface PernaAposta {
  id: number;
  odd: number;
  status: StatusPerna;
  lucroAcumulado: number;
  protecaoLay: number;
  oddMinimaLay: number;
  responsabilidade: number;
  resultadoSeGreen: number;
  resultadoSeRed: number;
}

export interface JuiceData {
  exposicaoTotal: number;
  lucroVirtual: number;
  protecaoTotal: number;
  resultadoEsperado: number;
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
  updatePernaOdd: (id: number, odd: number) => void;
  setPernaStatus: (id: number, status: StatusPerna) => void;
  resetCalculadora: () => void;
  getJuiceData: () => JuiceData;
  getAcaoRecomendada: () => { valorLay: number; oddMinima: number; resultadoSeGanhar: number; resultadoSePerder: number; pernaAtual: number } | null;
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
    odd: 1.5,
    status: 'pendente' as StatusPerna,
    lucroAcumulado: 0,
    protecaoLay: 0,
    oddMinimaLay: 0,
    responsabilidade: 0,
    resultadoSeGreen: 0,
    resultadoSeRed: 0,
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
    
    return pernas.map((perna, index) => {
      // Se já deu red, não calcula mais nada
      const pernaAnteriorRed = pernas.slice(0, index).some(p => p.status === 'red');
      if (pernaAnteriorRed) {
        return {
          ...perna,
          lucroAcumulado: 0,
          protecaoLay: 0,
          oddMinimaLay: 0,
          responsabilidade: 0,
          resultadoSeGreen: 0,
          resultadoSeRed: 0,
        };
      }

      const odd = perna.odd;
      const comissaoDecimal = comissao / 100;
      
      // Para objetivo de perder na casa, queremos que o lucro final seja negativo (perdemos stake)
      // A cada green, precisamos fazer lay para neutralizar o ganho
      
      // Retorno potencial se ganhar esta perna
      const retornoPotencial = stakeAcumulado * odd;
      const lucroSeBruto = retornoPotencial - stakeAcumulado;
      
      // Odd mínima para lay (com margem de segurança)
      const oddMinimaLay = Math.max(odd * 0.95, 1.01);
      
      // Valor do lay para neutralizar o lucro
      // Se objetivo é perder na casa: queremos que lay cubra todo o lucro
      let valorLay = 0;
      let responsabilidade = 0;
      let resultadoSeGreen = 0;
      let resultadoSeRed = 0;

      if (objetivo === 'perder_casa') {
        // Lay para perder exatamente o stake se ganhar todas as pernas
        // valorLay * (oddLay - 1) = lucro potencial na casa
        valorLay = lucroSeBruto / (oddMinimaLay - 1);
        responsabilidade = valorLay * (oddMinimaLay - 1);
        
        // Se der green na casa:
        // Ganhamos: lucroSeBruto
        // Perdemos no lay: responsabilidade
        resultadoSeGreen = lucroSeBruto - responsabilidade;
        
        // Se der red na casa:
        // Perdemos: stake
        // Ganhamos no lay: valorLay * (1 - comissao)
        resultadoSeRed = valorLay * (1 - comissaoDecimal) - stakeAcumulado;
      } else if (objetivo === 'limitar_lucro') {
        // Lay parcial para limitar o lucro a um valor controlado
        const lucroMaximoDesejado = stakeAcumulado * 0.1; // 10% do stake
        valorLay = (lucroSeBruto - lucroMaximoDesejado) / (oddMinimaLay - 1);
        valorLay = Math.max(0, valorLay);
        responsabilidade = valorLay * (oddMinimaLay - 1);
        resultadoSeGreen = lucroSeBruto - responsabilidade;
        resultadoSeRed = valorLay * (1 - comissaoDecimal) - stakeAcumulado;
      } else {
        // Neutralizar greens: lay total
        valorLay = retornoPotencial / oddMinimaLay;
        responsabilidade = valorLay * (oddMinimaLay - 1);
        resultadoSeGreen = lucroSeBruto - responsabilidade;
        resultadoSeRed = valorLay * (1 - comissaoDecimal) - stakeAcumulado;
      }

      // Se esta perna já deu green, acumula
      if (perna.status === 'green') {
        lucroAcumulado += resultadoSeGreen;
        stakeAcumulado = retornoPotencial; // stake para próxima perna
      }

      return {
        ...perna,
        lucroAcumulado,
        protecaoLay: Math.max(0, valorLay),
        oddMinimaLay,
        responsabilidade: Math.max(0, responsabilidade),
        resultadoSeGreen,
        resultadoSeRed,
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

  const updatePernaOdd = useCallback((id: number, odd: number) => {
    setState(prev => {
      const newPernas = prev.pernas.map(p => p.id === id ? { ...p, odd } : p);
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
    
    const protecaoTotal = pernas.reduce((sum, p) => sum + p.protecaoLay, 0);
    const lucroVirtual = pernas.reduce((sum, p) => {
      if (p.status === 'green') return sum + p.resultadoSeGreen;
      return sum;
    }, 0);
    
    const pernasPendentes = pernas.filter(p => p.status === 'pendente');
    const proximaPerna = pernasPendentes[0];
    
    let resultadoEsperado = lucroVirtual;
    if (proximaPerna) {
      // Se der red agora
      resultadoEsperado = proximaPerna.resultadoSeRed;
    }

    return {
      exposicaoTotal: stakeInicial,
      lucroVirtual,
      protecaoTotal,
      resultadoEsperado,
    };
  }, [state]);

  const getAcaoRecomendada = useCallback(() => {
    const { pernas } = state;
    
    // Encontra a próxima perna pendente
    const proximaPerna = pernas.find(p => p.status === 'pendente');
    
    if (!proximaPerna) return null;
    
    // Verifica se alguma perna anterior deu red
    const algumRed = pernas.some(p => p.status === 'red');
    if (algumRed) return null;

    return {
      valorLay: proximaPerna.protecaoLay,
      oddMinima: proximaPerna.oddMinimaLay,
      resultadoSeGanhar: proximaPerna.resultadoSeGreen,
      resultadoSePerder: proximaPerna.resultadoSeRed,
      pernaAtual: proximaPerna.id,
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
        updatePernaOdd,
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
