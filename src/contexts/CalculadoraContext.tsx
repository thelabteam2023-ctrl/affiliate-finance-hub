import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * CALCULADORA DE SIMULAÇÃO FINANCEIRA (OBEDIENTE)
 * 
 * CONCEITO CENTRAL:
 * - A calculadora NÃO resolve equações
 * - Ela SIMULA consequências de qualquer combinação de inputs
 * - Stake LAY é INPUT do usuário (default = stake inicial)
 * 
 * CENÁRIOS SIMULADOS:
 * - Se GREEN: lucro back - responsabilidade LAY
 * - Se RED: ganho LAY líquido - responsabilidade - stake
 * 
 * NUNCA BLOQUEIA - apenas exibe avisos informativos
 */

export type StatusPerna = 'aguardando' | 'ativa' | 'green' | 'red' | 'travada';
export type TipoAposta = 'dupla' | 'tripla' | 'multipla';
export type MoedaCalc = 'BRL' | 'USD';

export interface PernaAposta {
  id: number;
  oddBack: number;
  oddLay: number;
  stakeLay: number;        // INPUT do usuário (default = stake inicial)
  status: StatusPerna;
  
  // Calculados automaticamente
  responsabilidade: number;    // stakeLay × (oddLay − 1)
  
  // Se RED (perde na bookmaker, ganha LAY na exchange)
  ganhoLayBruto: number;       // stakeLay
  ganhoLayLiquido: number;     // stakeLay × (1 − comissão)
  resultadoSeRed: number;      // ganhoLayLiquido - responsabilidade - stakeInicial
  
  // Se GREEN (ganha na bookmaker, perde LAY)
  lucroBack: number;           // stakeInicial × (oddBack − 1)
  resultadoSeGreen: number;    // lucroBack - responsabilidade
  
  // Métricas
  juicePerna: number;          // custo percentual da operação
  
  // Avisos (nunca bloqueios)
  avisos: string[];
}

export interface MetricasGlobais {
  stakeInicial: number;
  
  // Totais
  totalStakeLay: number;
  totalResponsabilidade: number;
  
  // Se todas GREEN
  resultadoTotalSeGreen: number;
  eficienciaSeGreen: number;
  
  // Se RED na perna ativa
  resultadoSeRedAgora: number;
  
  // Juice acumulado
  juiceTotal: number;
  
  // Avisos globais
  avisos: string[];
  
  // Status
  operacaoEncerrada: boolean;
  motivoEncerramento: 'red' | 'todas_green' | null;
  capitalFinal: number;
  eficienciaFinal: number;
}

interface CalculadoraState {
  isOpen: boolean;
  isMinimized: boolean;
  position: { x: number; y: number };
  tipoAposta: TipoAposta;
  stakeInicial: number;
  comissaoExchange: number;
  moeda: MoedaCalc;
  pernas: PernaAposta[];
  numPernas: number;
  pernaAtiva: number;
}

interface CalculadoraContextType extends CalculadoraState {
  openCalculadora: () => void;
  closeCalculadora: () => void;
  toggleMinimize: () => void;
  setPosition: (pos: { x: number; y: number }) => void;
  setTipoAposta: (tipo: TipoAposta) => void;
  setStakeInicial: (stake: number) => void;
  setComissaoExchange: (comissao: number) => void;
  setMoeda: (moeda: MoedaCalc) => void;
  setNumPernas: (num: number) => void;
  updatePernaOddBack: (id: number, odd: number) => void;
  updatePernaOddLay: (id: number, odd: number) => void;
  updatePernaStakeLay: (id: number, stake: number) => void;
  confirmarPerna: (id: number, resultado: 'green' | 'red') => void;
  resetCalculadora: () => void;
  getMetricasGlobais: () => MetricasGlobais;
  getSimulacaoAtiva: () => {
    pernaId: number;
    stakeLay: number;
    oddLay: number;
    oddBack: number;
    responsabilidade: number;
    seRed: { resultado: number; eficiencia: number };
    seGreen: { resultado: number; eficiencia: number; proxPerna: number | null };
    avisos: string[];
  } | null;
}

const defaultState: CalculadoraState = {
  isOpen: false,
  isMinimized: false,
  position: { x: window.innerWidth - 520, y: 100 },
  tipoAposta: 'dupla',
  stakeInicial: 100,
  comissaoExchange: 5,
  moeda: 'BRL',
  pernas: [],
  numPernas: 2,
  pernaAtiva: 1,
};

const CalculadoraContext = createContext<CalculadoraContextType | null>(null);

export const useCalculadora = () => {
  const context = useContext(CalculadoraContext);
  if (!context) {
    throw new Error('useCalculadora must be used within CalculadoraProvider');
  }
  return context;
};

const createPernas = (num: number, stakeInicial: number): PernaAposta[] => {
  return Array.from({ length: num }, (_, i) => ({
    id: i + 1,
    oddBack: 2.0,
    oddLay: 2.0,
    stakeLay: stakeInicial,  // Default = stake inicial
    status: i === 0 ? 'ativa' : 'aguardando',
    responsabilidade: 0,
    ganhoLayBruto: 0,
    ganhoLayLiquido: 0,
    resultadoSeRed: 0,
    lucroBack: 0,
    resultadoSeGreen: 0,
    juicePerna: 0,
    avisos: [],
  }));
};

export const CalculadoraProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<CalculadoraState>(() => ({
    ...defaultState,
    pernas: createPernas(2, defaultState.stakeInicial),
  }));

  /**
   * RECALCULAR PERNAS - Simulação pura
   * 
   * Para cada perna, calcula:
   * - Resultado se GREEN
   * - Resultado se RED
   * - Juice
   * - Avisos (nunca bloqueia)
   */
  const recalcularPernas = useCallback((
    pernas: PernaAposta[],
    stakeInicial: number,
    comissao: number
  ): PernaAposta[] => {
    const comissaoDecimal = comissao / 100;
    let operacaoEncerrada = false;
    let pernaAtiva = 1;
    
    // Calcular resultado acumulado das pernas já confirmadas
    let lucroAcumulado = 0;
    let custoAcumulado = 0;
    
    return pernas.map((perna, index) => {
      const { oddBack, oddLay, stakeLay } = perna;
      
      // Se operação já encerrou (RED anterior)
      if (operacaoEncerrada) {
        return {
          ...perna,
          status: 'travada' as StatusPerna,
          responsabilidade: 0,
          ganhoLayBruto: 0,
          ganhoLayLiquido: 0,
          resultadoSeRed: 0,
          lucroBack: 0,
          resultadoSeGreen: 0,
          juicePerna: 0,
          avisos: [],
        };
      }
      
      // Calcular valores
      const responsabilidade = stakeLay * (oddLay - 1);
      const ganhoLayBruto = stakeLay;
      const ganhoLayLiquido = stakeLay * (1 - comissaoDecimal);
      const lucroBack = stakeInicial * (oddBack - 1);
      
      // Se RED: ganho LAY líquido - responsabilidade perdida em pernas anteriores - stake original
      // Simplificação: se RED aqui, você ganha o LAY mas perde o stake original
      const resultadoSeRed = ganhoLayLiquido - responsabilidade;
      
      // Se GREEN: lucro da back - responsabilidade do LAY
      const resultadoSeGreen = lucroBack - responsabilidade;
      
      // Juice = custo operacional percentual
      // Quanto menor o juice, melhor
      const custoMedio = Math.max(0, -resultadoSeGreen, -resultadoSeRed);
      const juicePerna = stakeInicial > 0 ? (custoMedio / stakeInicial) * 100 : 0;
      
      // Avisos informativos (nunca bloqueios)
      const avisos: string[] = [];
      if (resultadoSeGreen < 0 && resultadoSeRed < 0) {
        avisos.push('Alto custo operacional: ambos cenários negativos');
      } else if (juicePerna > 20) {
        avisos.push('Esta combinação gera custo operacional elevado');
      }
      
      // Se perna já foi confirmada como RED
      if (perna.status === 'red') {
        operacaoEncerrada = true;
        lucroAcumulado += resultadoSeRed;
        
        return {
          ...perna,
          status: 'red' as StatusPerna,
          responsabilidade,
          ganhoLayBruto,
          ganhoLayLiquido,
          resultadoSeRed,
          lucroBack,
          resultadoSeGreen,
          juicePerna,
          avisos,
        };
      }
      
      // Se perna já foi confirmada como GREEN
      if (perna.status === 'green') {
        lucroAcumulado += resultadoSeGreen;
        custoAcumulado += Math.max(0, -resultadoSeGreen);
        pernaAtiva = index + 2;
        
        return {
          ...perna,
          status: 'green' as StatusPerna,
          responsabilidade,
          ganhoLayBruto,
          ganhoLayLiquido,
          resultadoSeRed,
          lucroBack,
          resultadoSeGreen,
          juicePerna,
          avisos,
        };
      }
      
      // Determinar status
      let status: StatusPerna = 'aguardando';
      if (index === pernaAtiva - 1) {
        status = 'ativa';
      }
      
      return {
        ...perna,
        status,
        responsabilidade,
        ganhoLayBruto,
        ganhoLayLiquido,
        resultadoSeRed,
        lucroBack,
        resultadoSeGreen,
        juicePerna,
        avisos,
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
      dupla: 2,
      tripla: 3,
      multipla: 4,
    };
    const num = numMap[tipo];
    setState(prev => {
      const newPernas = createPernas(num, prev.stakeInicial);
      return {
        ...prev,
        tipoAposta: tipo,
        numPernas: num,
        pernaAtiva: 1,
        pernas: recalcularPernas(newPernas, prev.stakeInicial, prev.comissaoExchange),
      };
    });
  }, [recalcularPernas]);

  const setStakeInicial = useCallback((stake: number) => {
    setState(prev => {
      // Atualizar stake LAY das pernas que ainda usam o default
      const newPernas = prev.pernas.map(p => ({
        ...p,
        stakeLay: p.stakeLay === prev.stakeInicial ? stake : p.stakeLay,
      }));
      return {
        ...prev,
        stakeInicial: stake,
        pernas: recalcularPernas(newPernas, stake, prev.comissaoExchange),
      };
    });
  }, [recalcularPernas]);

  const setComissaoExchange = useCallback((comissao: number) => {
    setState(prev => ({
      ...prev,
      comissaoExchange: comissao,
      pernas: recalcularPernas(prev.pernas, prev.stakeInicial, comissao),
    }));
  }, [recalcularPernas]);

  const setMoeda = useCallback((moeda: MoedaCalc) => {
    setState(prev => ({ ...prev, moeda }));
  }, []);

  const setNumPernas = useCallback((num: number) => {
    setState(prev => {
      const newPernas = createPernas(num, prev.stakeInicial);
      return {
        ...prev,
        numPernas: num,
        tipoAposta: num === 2 ? 'dupla' : num === 3 ? 'tripla' : 'multipla',
        pernaAtiva: 1,
        pernas: recalcularPernas(newPernas, prev.stakeInicial, prev.comissaoExchange),
      };
    });
  }, [recalcularPernas]);

  const updatePernaOddBack = useCallback((id: number, odd: number) => {
    setState(prev => {
      const perna = prev.pernas.find(p => p.id === id);
      if (perna && (perna.status === 'aguardando' || perna.status === 'ativa')) {
        const newPernas = prev.pernas.map(p => p.id === id ? { ...p, oddBack: odd } : p);
        return {
          ...prev,
          pernas: recalcularPernas(newPernas, prev.stakeInicial, prev.comissaoExchange),
        };
      }
      return prev;
    });
  }, [recalcularPernas]);

  const updatePernaOddLay = useCallback((id: number, odd: number) => {
    setState(prev => {
      const perna = prev.pernas.find(p => p.id === id);
      if (perna && (perna.status === 'aguardando' || perna.status === 'ativa')) {
        const newPernas = prev.pernas.map(p => p.id === id ? { ...p, oddLay: odd } : p);
        return {
          ...prev,
          pernas: recalcularPernas(newPernas, prev.stakeInicial, prev.comissaoExchange),
        };
      }
      return prev;
    });
  }, [recalcularPernas]);

  const updatePernaStakeLay = useCallback((id: number, stake: number) => {
    setState(prev => {
      const perna = prev.pernas.find(p => p.id === id);
      if (perna && (perna.status === 'aguardando' || perna.status === 'ativa')) {
        const newPernas = prev.pernas.map(p => p.id === id ? { ...p, stakeLay: stake } : p);
        return {
          ...prev,
          pernas: recalcularPernas(newPernas, prev.stakeInicial, prev.comissaoExchange),
        };
      }
      return prev;
    });
  }, [recalcularPernas]);

  const confirmarPerna = useCallback((id: number, resultado: 'green' | 'red') => {
    setState(prev => {
      const pernaIndex = prev.pernas.findIndex(p => p.id === id);
      if (pernaIndex === -1) return prev;
      
      const perna = prev.pernas[pernaIndex];
      if (perna.status !== 'ativa') return prev;
      
      const newPernas = prev.pernas.map((p, i) => {
        if (p.id === id) {
          return { ...p, status: resultado as StatusPerna };
        }
        if (resultado === 'green' && i === pernaIndex + 1) {
          return { ...p, status: 'ativa' as StatusPerna };
        }
        if (resultado === 'red' && i > pernaIndex) {
          return { ...p, status: 'travada' as StatusPerna };
        }
        return p;
      });
      
      return {
        ...prev,
        pernaAtiva: resultado === 'green' ? id + 1 : id,
        pernas: recalcularPernas(newPernas, prev.stakeInicial, prev.comissaoExchange),
      };
    });
  }, [recalcularPernas]);

  const resetCalculadora = useCallback(() => {
    setState(prev => ({
      ...prev,
      pernaAtiva: 1,
      pernas: recalcularPernas(createPernas(prev.numPernas, prev.stakeInicial), prev.stakeInicial, prev.comissaoExchange),
    }));
  }, [recalcularPernas]);

  const getMetricasGlobais = useCallback((): MetricasGlobais => {
    const { pernas, stakeInicial } = state;
    
    // Verificar status
    const pernaRed = pernas.find(p => p.status === 'red');
    const todasGreen = pernas.every(p => p.status === 'green');
    
    // Totais
    const totalStakeLay = pernas.reduce((sum, p) => sum + p.stakeLay, 0);
    const totalResponsabilidade = pernas.reduce((sum, p) => sum + p.responsabilidade, 0);
    
    // Se todas GREEN
    const resultadoTotalSeGreen = pernas.reduce((sum, p) => sum + p.resultadoSeGreen, 0);
    const eficienciaSeGreen = stakeInicial > 0 
      ? ((stakeInicial + resultadoTotalSeGreen) / stakeInicial) * 100 
      : 0;
    
    // Se RED agora (perna ativa)
    const pernaAtiva = pernas.find(p => p.status === 'ativa');
    const resultadoSeRedAgora = pernaAtiva ? pernaAtiva.resultadoSeRed : 0;
    
    // Juice total
    const juiceTotal = pernas.reduce((sum, p) => sum + p.juicePerna, 0);
    
    // Avisos globais
    const avisos: string[] = [];
    if (resultadoTotalSeGreen < 0) {
      avisos.push(`Se todas GREEN: prejuízo de ${Math.abs(resultadoTotalSeGreen).toFixed(2)}`);
    }
    if (juiceTotal > 30) {
      avisos.push('Juice acumulado elevado');
    }
    
    // Calcular capital final e eficiência
    let capitalFinal = stakeInicial;
    let eficienciaFinal = 100;
    
    if (pernaRed) {
      // Somar resultados até o RED
      const resultadoAteRed = pernas
        .filter(p => p.status === 'green' || p.status === 'red')
        .reduce((sum, p) => {
          if (p.status === 'green') return sum + p.resultadoSeGreen;
          if (p.status === 'red') return sum + p.resultadoSeRed;
          return sum;
        }, 0);
      capitalFinal = stakeInicial + resultadoAteRed;
      eficienciaFinal = stakeInicial > 0 ? (capitalFinal / stakeInicial) * 100 : 0;
    } else if (todasGreen) {
      capitalFinal = stakeInicial + resultadoTotalSeGreen;
      eficienciaFinal = eficienciaSeGreen;
    }
    
    return {
      stakeInicial,
      totalStakeLay,
      totalResponsabilidade,
      resultadoTotalSeGreen,
      eficienciaSeGreen,
      resultadoSeRedAgora,
      juiceTotal,
      avisos,
      operacaoEncerrada: !!pernaRed || todasGreen,
      motivoEncerramento: pernaRed ? 'red' : todasGreen ? 'todas_green' : null,
      capitalFinal,
      eficienciaFinal,
    };
  }, [state]);

  const getSimulacaoAtiva = useCallback(() => {
    const { pernas, stakeInicial } = state;
    
    const pernaAtiva = pernas.find(p => p.status === 'ativa');
    if (!pernaAtiva) return null;
    
    if (pernas.some(p => p.status === 'red')) return null;
    
    const proxPerna = pernas.find(p => p.id === pernaAtiva.id + 1);
    
    // Calcular resultados considerando pernas anteriores
    const resultadoAnteriores = pernas
      .filter(p => p.status === 'green' && p.id < pernaAtiva.id)
      .reduce((sum, p) => sum + p.resultadoSeGreen, 0);
    
    const resultadoSeGreenTotal = resultadoAnteriores + pernaAtiva.resultadoSeGreen;
    const resultadoSeRedTotal = resultadoAnteriores + pernaAtiva.resultadoSeRed;
    
    const eficienciaSeGreen = stakeInicial > 0 
      ? ((stakeInicial + resultadoSeGreenTotal) / stakeInicial) * 100 
      : 0;
    const eficienciaSeRed = stakeInicial > 0 
      ? ((stakeInicial + resultadoSeRedTotal) / stakeInicial) * 100 
      : 0;
    
    return {
      pernaId: pernaAtiva.id,
      stakeLay: pernaAtiva.stakeLay,
      oddLay: pernaAtiva.oddLay,
      oddBack: pernaAtiva.oddBack,
      responsabilidade: pernaAtiva.responsabilidade,
      seRed: {
        resultado: resultadoSeRedTotal,
        eficiencia: eficienciaSeRed,
      },
      seGreen: {
        resultado: resultadoSeGreenTotal,
        eficiencia: eficienciaSeGreen,
        proxPerna: proxPerna ? proxPerna.id : null,
      },
      avisos: pernaAtiva.avisos,
    };
  }, [state]);

  const contextValue: CalculadoraContextType = {
    ...state,
    openCalculadora,
    closeCalculadora,
    toggleMinimize,
    setPosition,
    setTipoAposta,
    setStakeInicial,
    setComissaoExchange,
    setMoeda,
    setNumPernas,
    updatePernaOddBack,
    updatePernaOddLay,
    updatePernaStakeLay,
    confirmarPerna,
    resetCalculadora,
    getMetricasGlobais,
    getSimulacaoAtiva,
  };

  return (
    <CalculadoraContext.Provider value={contextValue}>
      {children}
    </CalculadoraContext.Provider>
  );
};
