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

  /**
   * ALGORITMO CORRETO - Proteção Progressiva
   * 
   * Regra-mãe: Todo LAY conversa com o LUCRO POTENCIAL TOTAL REMANESCENTE,
   * nunca com o lucro "da perna" nem com o delta visual.
   * 
   * Fórmulas:
   * - LPR = S × ((Π odds_confirmadas × Π odds_pendentes) − 1)
   * - Stake_LAY = LPR / (1 − comissão)
   * - Responsabilidade = Stake_LAY × (odd_lay − 1)
   * - Resultado_GREEN = LPR − Responsabilidade_TOTAL_ACUMULADA
   * - Resultado_RED = −S + Stake_LAY_ATUAL × (1 − comissão)
   * 
   * IMPORTANTE: 
   * - Resultado RED usa APENAS o stake LAY atual (não acumulado)
   * - Resultado GREEN considera TODAS as responsabilidades acumuladas
   * - Quando uma perna dá GREEN, o LAY anterior já foi liquidado (perdeu a responsabilidade)
   */
  const recalcularPernas = useCallback((
    pernas: PernaAposta[],
    stakeInicial: number,
    comissao: number,
    objetivo: ObjetivoAposta
  ): PernaAposta[] => {
    const comissaoDecimal = comissao / 100;
    const S = stakeInicial;
    
    // Verificar se já existe RED
    const temRed = pernas.some(p => p.status === 'red');
    
    // Primeira passada: calcular responsabilidades das pernas GREEN já confirmadas
    let responsabilidadeAcumulada = 0;
    
    // Calcular responsabilidades das pernas green anteriores
    for (const perna of pernas) {
      if (perna.status === 'green') {
        // Calcular o LPR que existia no momento dessa perna
        const indexPerna = pernas.indexOf(perna);
        
        // Odds confirmadas até essa perna (incluindo ela)
        const oddsConfirmadasAteMomento = pernas
          .slice(0, indexPerna + 1)
          .filter(p => p.status === 'green')
          .reduce((prod, p) => prod * p.oddBack, 1);
        
        // Odds pendentes após essa perna (considerando status original)
        const oddsPendentesAposMomento = pernas
          .slice(indexPerna + 1)
          .reduce((prod, p) => prod * p.oddBack, 1);
        
        const LPRNoMomento = S * ((oddsConfirmadasAteMomento * oddsPendentesAposMomento) - 1);
        const stakeLayNoMomento = LPRNoMomento / (1 - comissaoDecimal);
        const responsabilidadeNoMomento = stakeLayNoMomento * (perna.oddLay - 1);
        
        responsabilidadeAcumulada += responsabilidadeNoMomento;
      }
    }
    
    return pernas.map((perna, index) => {
      // Se já deu red em alguma perna anterior, zera tudo
      const pernaAnteriorRed = pernas.slice(0, index).some(p => p.status === 'red');
      if (pernaAnteriorRed || (temRed && perna.status !== 'red')) {
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

      // Calcular produto das odds confirmadas (GREEN) até aqui
      const oddsConfirmadas = pernas
        .slice(0, index)
        .filter(p => p.status === 'green')
        .reduce((prod, p) => prod * p.oddBack, 1);
      
      // Calcular produto das odds pendentes (incluindo a atual se pendente)
      const oddsPendentes = pernas
        .slice(index)
        .filter(p => p.status === 'pendente')
        .reduce((prod, p) => prod * p.oddBack, 1);
      
      // LUCRO POTENCIAL REAL (LPR) = S × ((Π odds_confirmadas × Π odds_pendentes) − 1)
      const LPR = S * ((oddsConfirmadas * oddsPendentes) - 1);
      
      const oddLay = perna.oddLay;
      
      let stakeLay = 0;
      let responsabilidade = 0;
      let resultadoSeGreen = 0;
      let resultadoSeRed = 0;

      if (perna.status === 'pendente') {
        if (objetivo === 'perder_casa') {
          // Stake_LAY = LPR / (1 − comissão)
          stakeLay = LPR / (1 - comissaoDecimal);
          
          // Responsabilidade = Stake_LAY × (odd_lay − 1)
          responsabilidade = stakeLay * (oddLay - 1);
          
          // Resultado_GREEN = LPR − Responsabilidade_TOTAL
          // Se a bookmaker ganhar (todas as pernas GREEN), recebemos LPR
          // mas perdemos TODAS as responsabilidades acumuladas (anteriores + atual)
          const responsabilidadeTotalSeGreen = responsabilidadeAcumulada + responsabilidade;
          resultadoSeGreen = LPR - responsabilidadeTotalSeGreen;
          
          // Resultado_RED = −S + Stake_LAY_ATUAL × (1 − comissão)
          // Se der RED agora, perdemos o stake inicial na bookmaker
          // mas ganhamos APENAS o stake LAY atual (os anteriores já foram liquidados)
          resultadoSeRed = -S + stakeLay * (1 - comissaoDecimal);
          
        } else if (objetivo === 'limitar_lucro') {
          // Limitar lucro a 10% do stake
          const lucroMaximoDesejado = S * 0.1;
          const LPRAjustado = Math.max(0, LPR - lucroMaximoDesejado);
          stakeLay = LPRAjustado / (1 - comissaoDecimal);
          responsabilidade = stakeLay * (oddLay - 1);
          const responsabilidadeTotalSeGreen = responsabilidadeAcumulada + responsabilidade;
          resultadoSeGreen = LPR - responsabilidadeTotalSeGreen;
          resultadoSeRed = -S + stakeLay * (1 - comissaoDecimal);
          
        } else {
          // Neutralizar greens: hedge total
          stakeLay = LPR / (1 - comissaoDecimal);
          responsabilidade = stakeLay * (oddLay - 1);
          const responsabilidadeTotalSeGreen = responsabilidadeAcumulada + responsabilidade;
          resultadoSeGreen = LPR - responsabilidadeTotalSeGreen;
          resultadoSeRed = -S + stakeLay * (1 - comissaoDecimal);
        }
      } else if (perna.status === 'green') {
        // Perna já confirmada GREEN - calcular o que foi travado
        const LPRNoMomento = S * ((oddsConfirmadas * perna.oddBack * 
          pernas.slice(index + 1).reduce((prod, p) => prod * p.oddBack, 1)) - 1);
        
        stakeLay = LPRNoMomento / (1 - comissaoDecimal);
        responsabilidade = stakeLay * (oddLay - 1);
        
        resultadoSeGreen = 0; // Já aconteceu
        resultadoSeRed = 0;
      }

      // Cálculo do juice (%) = resultado / stake inicial (base de risco real)
      const juiceSeGreen = S > 0 ? (resultadoSeGreen / S) * 100 : 0;
      const juiceSeRed = S > 0 ? (resultadoSeRed / S) * 100 : 0;

      return {
        ...perna,
        lucroAcumulado: LPR,
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
    const { pernas, stakeInicial, comissaoExchange } = state;
    const S = stakeInicial;
    const comissaoDecimal = comissaoExchange / 100;
    
    // Calcular odds confirmadas (green)
    const oddsConfirmadas = pernas
      .filter(p => p.status === 'green')
      .reduce((prod, p) => prod * p.oddBack, 1);
    
    // Calcular odds pendentes
    const oddsPendentes = pernas
      .filter(p => p.status === 'pendente')
      .reduce((prod, p) => prod * p.oddBack, 1);
    
    // LPR atual (Lucro Potencial Real)
    const LPR = S * ((oddsConfirmadas * oddsPendentes) - 1);
    
    // Próxima perna pendente
    const proximaPerna = pernas.find(p => p.status === 'pendente');
    
    // Calcular responsabilidade TOTAL acumulada (todas as pernas green + próxima pendente)
    const responsabilidadeTotal = pernas.reduce((sum, p) => sum + p.responsabilidade, 0);
    
    // Stake LAY apenas da próxima perna pendente (para resultado RED)
    const stakeLayAtual = proximaPerna?.stakeLay || 0;
    
    // Exposição total = Stake inicial + Responsabilidades totais
    const exposicaoTotal = S + responsabilidadeTotal;
    
    // Resultado se tudo der GREEN = LPR - Responsabilidades Totais
    const resultadoGreenFinal = LPR - responsabilidadeTotal;
    
    // Resultado se der RED agora = -S + Stake_LAY_ATUAL × (1 - comissão)
    // Apenas o stake LAY atual é ganho, não os acumulados
    const resultadoRedFinal = proximaPerna ? (-S + stakeLayAtual * (1 - comissaoDecimal)) : 0;
    
    // Juice baseado no stake inicial (risco real)
    const juiceMedioGreen = S > 0 ? (resultadoGreenFinal / S) * 100 : 0;
    const juiceMedioRed = S > 0 ? (resultadoRedFinal / S) * 100 : 0;

    return {
      exposicaoTotal,
      lucroVirtual: LPR,
      protecaoTotal: responsabilidadeTotal,
      resultadoEsperado: proximaPerna ? resultadoRedFinal : resultadoGreenFinal,
      juiceMedioGreen,
      juiceMedioRed,
    };
  }, [state]);

  const getAcaoRecomendada = useCallback(() => {
    const { pernas, stakeInicial, comissaoExchange } = state;
    const S = stakeInicial;
    const comissaoDecimal = comissaoExchange / 100;
    
    const proximaPerna = pernas.find(p => p.status === 'pendente');
    if (!proximaPerna) return null;
    
    const algumRed = pernas.some(p => p.status === 'red');
    if (algumRed) return null;

    // Calcular responsabilidades acumuladas das pernas GREEN anteriores
    const responsabilidadeAcumulada = pernas
      .filter(p => p.status === 'green')
      .reduce((sum, p) => sum + p.responsabilidade, 0);

    // Calcular LPR atual
    const oddsConfirmadas = pernas
      .filter(p => p.status === 'green')
      .reduce((prod, p) => prod * p.oddBack, 1);
    
    const oddsPendentes = pernas
      .filter(p => p.status === 'pendente')
      .reduce((prod, p) => prod * p.oddBack, 1);
    
    const LPR = S * ((oddsConfirmadas * oddsPendentes) - 1);
    
    // Stake LAY recomendado para esta perna
    const stakeLay = LPR / (1 - comissaoDecimal);
    const responsabilidade = stakeLay * (proximaPerna.oddLay - 1);
    
    // Responsabilidade TOTAL se executar este LAY
    const responsabilidadeTotal = responsabilidadeAcumulada + responsabilidade;
    
    // Resultado_GREEN = LPR - Responsabilidade_TOTAL
    const resultadoSeGreen = LPR - responsabilidadeTotal;
    
    // Resultado_RED = -S + Stake_LAY_ATUAL × (1 - comissão)
    // APENAS o stake LAY atual é ganho (anteriores já foram liquidados)
    const resultadoSeRed = -S + stakeLay * (1 - comissaoDecimal);
    
    // Juice baseado no stake inicial (risco real)
    const juiceGreen = S > 0 ? (resultadoSeGreen / S) * 100 : 0;
    const juiceRed = S > 0 ? (resultadoSeRed / S) * 100 : 0;

    return {
      stakeLay,
      oddLay: proximaPerna.oddLay,
      resultadoSeGanhar: resultadoSeGreen,
      resultadoSePerder: resultadoSeRed,
      pernaAtual: proximaPerna.id,
      juiceGreen,
      juiceRed,
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
