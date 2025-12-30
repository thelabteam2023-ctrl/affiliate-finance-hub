import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * CALCULADORA DE ROLAGEM DE CAPITAL (LAY PROGRESSIVO)
 * 
 * CONCEITO CENTRAL:
 * - O objetivo é RETIRAR capital da bookmaker usando cobertura LAY
 * - Cada perna aumenta o passivo (se GREEN) ou zera o sistema (se RED)
 * - O sistema trabalha com passivo acumulado, não cálculos isolados
 * 
 * FÓRMULAS MATEMÁTICAS:
 * - Stake_LAY = Passivo / (2 − Odd_LAY − comissão)
 * - Condição de viabilidade: 2 − Odd_LAY − comissão > 0
 * - Responsabilidade = Stake_LAY × (Odd_LAY − 1)
 * - Ganho_LAY_Líquido = Stake_LAY × (1 − comissão)
 * 
 * CENÁRIOS:
 * - RED (perde na bookmaker): Exchange ganha, sistema zera, capital retorna
 * - GREEN (ganha na bookmaker): Passivo aumenta em Responsabilidade, próxima perna libera
 */

export type StatusPerna = 'aguardando' | 'ativa' | 'green' | 'red' | 'travada';
export type TipoAposta = 'dupla' | 'tripla' | 'multipla';
export type MoedaCalc = 'BRL' | 'USD';

export interface PernaAposta {
  id: number;
  oddBack: number;
  oddLay: number;
  status: StatusPerna;
  
  // Calculados
  passivoAntes: number;        // Passivo acumulado ANTES desta perna
  stakeLay: number;            // Stake necessário no LAY
  responsabilidade: number;    // Stake_LAY × (Odd_LAY − 1)
  custoLay: number;            // Custo se GREEN (= responsabilidade)
  
  // Se RED (melhor cenário)
  ganhoLayBruto: number;       // Stake_LAY ganho
  ganhoLayLiquido: number;     // Stake_LAY × (1 − comissão)
  valorRecuperavel: number;    // Quanto retorna ao sistema
  
  // Se GREEN
  passivoDepois: number;       // Novo passivo = anterior + custo
  
  // Flags
  viavel: boolean;             // 2 − Odd_LAY − comissão > 0
  mensagemErro: string | null;
}

export interface MetricasGlobais {
  // Investimento inicial
  stakeInicial: number;
  
  // Passivo atual
  passivoAtual: number;
  
  // Total investido em coberturas (soma de todos stakes LAY)
  totalInvestidoLay: number;
  
  // Se cair RED agora
  valorRecuperavelAtual: number;
  
  // Se completar todas as pernas com GREEN
  custoOperacionalTotal: number;       // Juízo total
  capitalFinalSeGreen: number;         // Quanto sobra se tudo GREEN
  
  // Eficiência
  eficienciaAtual: number;             // % do capital preservado
  
  // Status geral
  operacaoEncerrada: boolean;
  motivoEncerramento: 'red' | 'todas_green' | null;
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
  pernaAtiva: number; // ID da perna atualmente ativa (1-indexed)
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
  confirmarPerna: (id: number, resultado: 'green' | 'red') => void;
  resetCalculadora: () => void;
  getMetricasGlobais: () => MetricasGlobais;
  getProximaAcao: () => {
    pernaId: number;
    stakeLay: number;
    oddLay: number;
    responsabilidade: number;
    seRed: { valorRecuperavel: number; eficiencia: number };
    seGreen: { novoPassivo: number; proxPerna: number | null };
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

const createPernas = (num: number): PernaAposta[] => {
  return Array.from({ length: num }, (_, i) => ({
    id: i + 1,
    oddBack: 2.0,
    oddLay: 2.0,
    status: i === 0 ? 'ativa' : 'aguardando',
    passivoAntes: 0,
    stakeLay: 0,
    responsabilidade: 0,
    custoLay: 0,
    ganhoLayBruto: 0,
    ganhoLayLiquido: 0,
    valorRecuperavel: 0,
    passivoDepois: 0,
    viavel: true,
    mensagemErro: null,
  }));
};

export const CalculadoraProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<CalculadoraState>({
    ...defaultState,
    pernas: createPernas(2),
  });

  /**
   * RECALCULAR TODAS AS PERNAS
   * 
   * Modelo de Passivo Acumulado:
   * - Passivo inicial = stake na bookmaker
   * - A cada perna GREEN, passivo aumenta pelo custo do LAY
   * - Se RED, o sistema zera (exchange paga o passivo)
   */
  const recalcularPernas = useCallback((
    pernas: PernaAposta[],
    stakeInicial: number,
    comissao: number
  ): PernaAposta[] => {
    const comissaoDecimal = comissao / 100;
    let passivoAcumulado = stakeInicial; // Passivo inicial = stake
    let operacaoEncerrada = false;
    let pernaAtiva = 1;
    
    return pernas.map((perna, index) => {
      const oddLay = perna.oddLay;
      
      // Verificar se operação já encerrou (RED anterior)
      if (operacaoEncerrada) {
        return {
          ...perna,
          status: 'travada' as StatusPerna,
          passivoAntes: 0,
          stakeLay: 0,
          responsabilidade: 0,
          custoLay: 0,
          ganhoLayBruto: 0,
          ganhoLayLiquido: 0,
          valorRecuperavel: 0,
          passivoDepois: 0,
          viavel: true,
          mensagemErro: null,
        };
      }
      
      // Se perna já foi confirmada como RED
      if (perna.status === 'red') {
        operacaoEncerrada = true;
        
        // Calcular valores no momento do RED
        const denominador = 2 - oddLay - comissaoDecimal;
        const viavel = denominador > 0;
        
        if (!viavel) {
          return {
            ...perna,
            status: 'red' as StatusPerna,
            passivoAntes: passivoAcumulado,
            stakeLay: 0,
            responsabilidade: 0,
            custoLay: 0,
            ganhoLayBruto: 0,
            ganhoLayLiquido: 0,
            valorRecuperavel: stakeInicial, // Retorna o stake inicial
            passivoDepois: 0,
            viavel: false,
            mensagemErro: 'Cobertura matematicamente inviável',
          };
        }
        
        const stakeLay = passivoAcumulado / denominador;
        const responsabilidade = stakeLay * (oddLay - 1);
        const ganhoLayBruto = stakeLay;
        const ganhoLayLiquido = stakeLay * (1 - comissaoDecimal);
        
        // O que retorna = ganho líquido - responsabilidade + stake inicial
        // Simplificando: se viável, retorna exatamente o stake inicial
        const valorRecuperavel = stakeInicial;
        
        return {
          ...perna,
          status: 'red' as StatusPerna,
          passivoAntes: passivoAcumulado,
          stakeLay,
          responsabilidade,
          custoLay: 0, // Não há custo no RED
          ganhoLayBruto,
          ganhoLayLiquido,
          valorRecuperavel,
          passivoDepois: 0, // Sistema zerado
          viavel: true,
          mensagemErro: null,
        };
      }
      
      // Se perna já foi confirmada como GREEN
      if (perna.status === 'green') {
        const denominador = 2 - oddLay - comissaoDecimal;
        const viavel = denominador > 0;
        
        if (!viavel) {
          // GREEN inviável - não deveria acontecer, mas tratamos
          passivoAcumulado = passivoAcumulado * 2; // Dobra o passivo como penalidade
          pernaAtiva = index + 2;
          
          return {
            ...perna,
            status: 'green' as StatusPerna,
            passivoAntes: passivoAcumulado / 2,
            stakeLay: 0,
            responsabilidade: passivoAcumulado / 2,
            custoLay: passivoAcumulado / 2,
            ganhoLayBruto: 0,
            ganhoLayLiquido: 0,
            valorRecuperavel: 0,
            passivoDepois: passivoAcumulado,
            viavel: false,
            mensagemErro: 'LAY era inviável',
          };
        }
        
        const passivoAntes = passivoAcumulado;
        const stakeLay = passivoAntes / denominador;
        const responsabilidade = stakeLay * (oddLay - 1);
        const custoLay = responsabilidade; // Custo = responsabilidade perdida
        
        // Novo passivo = anterior + custo
        passivoAcumulado = passivoAntes + custoLay;
        pernaAtiva = index + 2;
        
        return {
          ...perna,
          status: 'green' as StatusPerna,
          passivoAntes,
          stakeLay,
          responsabilidade,
          custoLay,
          ganhoLayBruto: stakeLay,
          ganhoLayLiquido: stakeLay * (1 - comissaoDecimal),
          valorRecuperavel: 0, // Não aplicável para GREEN
          passivoDepois: passivoAcumulado,
          viavel: true,
          mensagemErro: null,
        };
      }
      
      // Perna ativa ou aguardando - calcular projeção
      const denominador = 2 - oddLay - comissaoDecimal;
      const viavel = denominador > 0;
      
      if (!viavel) {
        return {
          ...perna,
          status: index === pernaAtiva - 1 ? 'ativa' : 'aguardando' as StatusPerna,
          passivoAntes: passivoAcumulado,
          stakeLay: 0,
          responsabilidade: 0,
          custoLay: 0,
          ganhoLayBruto: 0,
          ganhoLayLiquido: 0,
          valorRecuperavel: 0,
          passivoDepois: 0,
          viavel: false,
          mensagemErro: `Odd LAY muito alta. Máximo: ${(2 - comissaoDecimal).toFixed(2)}`,
        };
      }
      
      const passivoAntes = passivoAcumulado;
      const stakeLay = passivoAntes / denominador;
      const responsabilidade = stakeLay * (oddLay - 1);
      const custoLay = responsabilidade;
      const ganhoLayBruto = stakeLay;
      const ganhoLayLiquido = stakeLay * (1 - comissaoDecimal);
      
      // Valor recuperável se RED = stake inicial (todo o capital é preservado)
      const valorRecuperavel = stakeInicial;
      
      // Passivo depois (se GREEN)
      const passivoDepois = passivoAntes + custoLay;
      
      // Determinar status
      let status: StatusPerna = 'aguardando';
      if (index < pernaAtiva - 1) {
        // Pernas anteriores à ativa que não foram processadas ficam aguardando
        status = 'aguardando';
      } else if (index === pernaAtiva - 1) {
        status = 'ativa';
      } else {
        status = 'aguardando';
      }
      
      // Para pernas futuras, calcular projeção assumindo GREENs anteriores
      if (index > 0 && pernas[index - 1].status === 'aguardando') {
        // Calcular passivo projetado
        let passivoProjetado = stakeInicial;
        for (let i = 0; i < index; i++) {
          const p = pernas[i];
          const den = 2 - p.oddLay - comissaoDecimal;
          if (den > 0) {
            const sl = passivoProjetado / den;
            const resp = sl * (p.oddLay - 1);
            passivoProjetado += resp;
          }
        }
        
        const denAtual = 2 - oddLay - comissaoDecimal;
        if (denAtual > 0) {
          const slProjetado = passivoProjetado / denAtual;
          const respProjetado = slProjetado * (oddLay - 1);
          
          return {
            ...perna,
            status,
            passivoAntes: passivoProjetado,
            stakeLay: slProjetado,
            responsabilidade: respProjetado,
            custoLay: respProjetado,
            ganhoLayBruto: slProjetado,
            ganhoLayLiquido: slProjetado * (1 - comissaoDecimal),
            valorRecuperavel: stakeInicial,
            passivoDepois: passivoProjetado + respProjetado,
            viavel: true,
            mensagemErro: null,
          };
        }
      }
      
      return {
        ...perna,
        status,
        passivoAntes,
        stakeLay,
        responsabilidade,
        custoLay,
        ganhoLayBruto,
        ganhoLayLiquido,
        valorRecuperavel,
        passivoDepois,
        viavel: true,
        mensagemErro: null,
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
      const newPernas = createPernas(num);
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
    setState(prev => ({
      ...prev,
      stakeInicial: stake,
      pernas: recalcularPernas(prev.pernas, stake, prev.comissaoExchange),
    }));
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
      const newPernas = createPernas(num);
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
      // Só permite editar se estiver aguardando ou ativa
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
      // Só permite editar se estiver aguardando ou ativa
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

  const confirmarPerna = useCallback((id: number, resultado: 'green' | 'red') => {
    setState(prev => {
      const pernaIndex = prev.pernas.findIndex(p => p.id === id);
      if (pernaIndex === -1) return prev;
      
      const perna = prev.pernas[pernaIndex];
      
      // Só pode confirmar a perna ativa
      if (perna.status !== 'ativa') return prev;
      
      const newPernas = prev.pernas.map((p, i) => {
        if (p.id === id) {
          return { ...p, status: resultado as StatusPerna };
        }
        // Se foi GREEN e há próxima perna, ativá-la
        if (resultado === 'green' && i === pernaIndex + 1) {
          return { ...p, status: 'ativa' as StatusPerna };
        }
        // Se foi RED, travar todas as próximas
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
      pernas: recalcularPernas(createPernas(prev.numPernas), prev.stakeInicial, prev.comissaoExchange),
    }));
  }, [recalcularPernas]);

  const getMetricasGlobais = useCallback((): MetricasGlobais => {
    const { pernas, stakeInicial, comissaoExchange } = state;
    const comissaoDecimal = comissaoExchange / 100;
    
    // Verificar se operação encerrou
    const pernaRed = pernas.find(p => p.status === 'red');
    const todasGreen = pernas.every(p => p.status === 'green');
    
    // Passivo atual
    const ultimaPernaProcessada = [...pernas].reverse().find(
      p => p.status === 'green' || p.status === 'red'
    );
    const pernaAtiva = pernas.find(p => p.status === 'ativa');
    
    let passivoAtual = stakeInicial;
    if (pernaRed) {
      passivoAtual = 0; // Sistema zerado
    } else if (ultimaPernaProcessada?.status === 'green') {
      passivoAtual = ultimaPernaProcessada.passivoDepois;
    } else if (pernaAtiva) {
      passivoAtual = pernaAtiva.passivoAntes;
    }
    
    // Total investido em LAYs (soma de stakes LAY das pernas processadas)
    const totalInvestidoLay = pernas
      .filter(p => p.status === 'green' || p.status === 'red')
      .reduce((sum, p) => sum + p.stakeLay, 0);
    
    // Valor recuperável atual (se der RED agora)
    const valorRecuperavelAtual = pernaRed ? stakeInicial : stakeInicial;
    
    // Custo operacional total (soma de custos das pernas GREEN)
    const custoOperacionalTotal = pernas
      .filter(p => p.status === 'green')
      .reduce((sum, p) => sum + p.custoLay, 0);
    
    // Capital final se tudo GREEN
    let capitalFinalSeGreen = stakeInicial;
    if (todasGreen) {
      capitalFinalSeGreen = stakeInicial - custoOperacionalTotal;
    } else {
      // Projetar custo total se todas as pendentes forem GREEN
      let passivoProjetado = passivoAtual;
      for (const p of pernas) {
        if (p.status === 'aguardando' || p.status === 'ativa') {
          const den = 2 - p.oddLay - comissaoDecimal;
          if (den > 0) {
            const sl = passivoProjetado / den;
            const resp = sl * (p.oddLay - 1);
            passivoProjetado += resp;
          }
        }
      }
      capitalFinalSeGreen = stakeInicial - (passivoProjetado - stakeInicial);
    }
    
    // Eficiência
    let eficienciaAtual = 100;
    if (pernaRed) {
      eficienciaAtual = 100; // RED = 100% eficiência
    } else if (todasGreen) {
      eficienciaAtual = (capitalFinalSeGreen / stakeInicial) * 100;
    } else {
      eficienciaAtual = (capitalFinalSeGreen / stakeInicial) * 100;
    }
    
    return {
      stakeInicial,
      passivoAtual,
      totalInvestidoLay,
      valorRecuperavelAtual,
      custoOperacionalTotal,
      capitalFinalSeGreen,
      eficienciaAtual,
      operacaoEncerrada: !!pernaRed || todasGreen,
      motivoEncerramento: pernaRed ? 'red' : todasGreen ? 'todas_green' : null,
    };
  }, [state]);

  const getProximaAcao = useCallback(() => {
    const { pernas, stakeInicial } = state;
    
    // Encontrar a perna ativa
    const pernaAtiva = pernas.find(p => p.status === 'ativa');
    if (!pernaAtiva) return null;
    
    // Verificar se já tem RED (operação encerrada)
    if (pernas.some(p => p.status === 'red')) return null;
    
    // Verificar viabilidade
    if (!pernaAtiva.viavel) return null;
    
    const proxPerna = pernas.find(p => p.id === pernaAtiva.id + 1);
    
    return {
      pernaId: pernaAtiva.id,
      stakeLay: pernaAtiva.stakeLay,
      oddLay: pernaAtiva.oddLay,
      responsabilidade: pernaAtiva.responsabilidade,
      seRed: {
        valorRecuperavel: stakeInicial,
        eficiencia: 100,
      },
      seGreen: {
        novoPassivo: pernaAtiva.passivoDepois,
        proxPerna: proxPerna ? proxPerna.id : null,
      },
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
    confirmarPerna,
    resetCalculadora,
    getMetricasGlobais,
    getProximaAcao,
  };

  return (
    <CalculadoraContext.Provider value={contextValue}>
      {children}
    </CalculadoraContext.Provider>
  );
};
