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
  capitalRetiravel: number; // CR - Capital que pode ser retirado da bookmaker
  stakeLay: number;       // Valor a apostar no lay
  juice: number;          // Custo da retirada (responsabilidade)
  resultadoSeGreen: number; // Resultado líquido se GREEN
  resultadoSeRed: number;   // Resultado líquido se RED
  eficienciaSeGreen: number; // % do capital preservado se GREEN
  eficienciaSeRed: number;   // % do capital preservado se RED
}

export interface JuiceData {
  capitalRetiravel: number;    // CR - Capital total retirável da bookmaker
  custoRetirada: number;       // Juice total - custo da operação
  resultadoLiquido: number;    // CR - Juice
  eficiencia: number;          // % do capital preservado
  resultadoSeGreen: number;    // Resultado se tudo GREEN
  resultadoSeRed: number;      // Resultado se RED agora
  eficienciaSeGreen: number;   // Eficiência se GREEN
  eficienciaSeRed: number;     // Eficiência se RED
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
  getAcaoRecomendada: () => { 
    stakeLay: number; 
    oddLay: number; 
    capitalRetiravel: number;
    custoRetirada: number;
    resultadoLiquido: number;
    eficiencia: number;
    resultadoSeGreen: number; 
    resultadoSeRed: number; 
    eficienciaSeGreen: number;
    eficienciaSeRed: number;
    pernaAtual: number; 
  } | null;
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
    capitalRetiravel: 0,
    stakeLay: 0,
    juice: 0,
    resultadoSeGreen: 0,
    resultadoSeRed: 0,
    eficienciaSeGreen: 0,
    eficienciaSeRed: 0,
  }));
};

export const CalculadoraProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<CalculadoraState>({
    ...defaultState,
    pernas: createPernas(2),
  });

  /**
   * MODELO DE RETIRADA DE CAPITAL (não é modelo de apostas!)
   * 
   * REGRA-MÃE: O objetivo é RETIRAR CAPITAL da bookmaker, pagando um custo (juice) na exchange.
   * 
   * DEFINIÇÕES:
   * - S: Stake inicial
   * - CR: Capital Retirável = S × (odd1 × odd2 − 1)
   * - Stake_LAY = CR / (1 − comissão)
   * - Juice = Stake_LAY × (odd_lay − 1) [CUSTO, não prejuízo]
   * - Resultado Líquido = CR − Juice
   * - Eficiência = (CR − Juice) / CR × 100
   * 
   * INTERPRETAÇÃO DOS CENÁRIOS:
   * - Se GREEN: capital sai via vitória, juice é pago → Resultado = CR - Juice
   * - Se RED: capital sai via exchange (LAY), juice NÃO é consumido → Resultado = CR (100% eficiência)
   * 
   * RED é o MELHOR cenário de extração (0% juice consumido)
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
    
    // Calcular juice acumulado das pernas GREEN confirmadas
    let juiceAcumulado = 0;
    
    for (const perna of pernas) {
      if (perna.status === 'green') {
        const indexPerna = pernas.indexOf(perna);
        
        // Calcular o CR que existia no momento dessa perna
        const oddsConfirmadasAteMomento = pernas
          .slice(0, indexPerna + 1)
          .filter(p => p.status === 'green')
          .reduce((prod, p) => prod * p.oddBack, 1);
        
        const oddsPendentesAposMomento = pernas
          .slice(indexPerna + 1)
          .reduce((prod, p) => prod * p.oddBack, 1);
        
        const CRNoMomento = S * ((oddsConfirmadasAteMomento * oddsPendentesAposMomento) - 1);
        const stakeLayNoMomento = CRNoMomento / (1 - comissaoDecimal);
        const juiceNoMomento = stakeLayNoMomento * (perna.oddLay - 1);
        
        juiceAcumulado += juiceNoMomento;
      }
    }
    
    return pernas.map((perna, index) => {
      // Se já deu red em alguma perna anterior, zera tudo
      const pernaAnteriorRed = pernas.slice(0, index).some(p => p.status === 'red');
      if (pernaAnteriorRed || (temRed && perna.status !== 'red')) {
        return {
          ...perna,
          capitalRetiravel: 0,
          stakeLay: 0,
          juice: 0,
          resultadoSeGreen: 0,
          resultadoSeRed: 0,
          eficienciaSeGreen: 0,
          eficienciaSeRed: 0,
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
      
      // CAPITAL RETIRÁVEL (CR) = S × ((Π odds_confirmadas × Π odds_pendentes) − 1)
      const CR = S * ((oddsConfirmadas * oddsPendentes) - 1);
      
      const oddLay = perna.oddLay;
      
      let stakeLay = 0;
      let juice = 0;
      let resultadoSeGreen = 0;
      let resultadoSeRed = 0;
      let eficienciaSeGreen = 0;
      let eficienciaSeRed = 0;

      if (perna.status === 'pendente') {
        // Stake_LAY = CR / (1 − comissão)
        stakeLay = CR / (1 - comissaoDecimal);
        
        // Juice = Stake_LAY × (odd_lay − 1) - CUSTO da retirada
        juice = stakeLay * (oddLay - 1);
        
        // Juice total se GREEN = acumulados + atual
        const juiceTotalSeGreen = juiceAcumulado + juice;
        
        // Resultado se GREEN = CR - Juice Total
        // Capital sai da bookmaker, mas pagamos todo o juice acumulado
        resultadoSeGreen = CR - juiceTotalSeGreen;
        
        // Resultado se RED = CR (melhor cenário!)
        // Capital sai via exchange, juice NÃO é consumido
        // Na prática: perdemos S na bookmaker, ganhamos stake_lay × (1 - comissão) na exchange
        // Que resulta em: CR (porque stake_lay × (1 - comissão) = CR)
        resultadoSeRed = CR;
        
        // Eficiência = (Resultado / CR) × 100
        eficienciaSeGreen = CR > 0 ? (resultadoSeGreen / CR) * 100 : 0;
        eficienciaSeRed = 100; // RED sempre tem 100% de eficiência (juice não consumido)
        
        // Ajuste para objetivo "limitar_lucro"
        if (objetivo === 'limitar_lucro') {
          const lucroMaximoDesejado = S * 0.1;
          const CRAjustado = Math.max(0, CR - lucroMaximoDesejado);
          stakeLay = CRAjustado / (1 - comissaoDecimal);
          juice = stakeLay * (oddLay - 1);
          const juiceTotalSeGreenAjustado = juiceAcumulado + juice;
          resultadoSeGreen = CR - juiceTotalSeGreenAjustado;
          eficienciaSeGreen = CR > 0 ? (resultadoSeGreen / CR) * 100 : 0;
        }
        
      } else if (perna.status === 'green') {
        // Perna já confirmada GREEN - calcular valores históricos
        const CRNoMomento = S * ((oddsConfirmadas * perna.oddBack * 
          pernas.slice(index + 1).reduce((prod, p) => prod * p.oddBack, 1)) - 1);
        
        stakeLay = CRNoMomento / (1 - comissaoDecimal);
        juice = stakeLay * (oddLay - 1);
        
        // Resultados zerados pois já aconteceu
        resultadoSeGreen = 0;
        resultadoSeRed = 0;
        eficienciaSeGreen = 0;
        eficienciaSeRed = 0;
        
      } else if (perna.status === 'red') {
        // RED aconteceu - melhor cenário de extração!
        // O capital foi extraído via exchange com 0% de juice consumido
        
        // Recalcular o CR que existia antes do RED
        const oddsConfirmadasAntes = pernas
          .slice(0, index)
          .filter(p => p.status === 'green')
          .reduce((prod, p) => prod * p.oddBack, 1);
        
        const oddsPendentesIncluindoEsta = pernas
          .slice(index)
          .reduce((prod, p) => prod * p.oddBack, 1);
        
        const CRAntes = S * ((oddsConfirmadasAntes * oddsPendentesIncluindoEsta) - 1);
        
        stakeLay = CRAntes / (1 - comissaoDecimal);
        juice = 0; // Juice NÃO foi consumido no RED
        resultadoSeRed = CRAntes; // Capital total extraído
        eficienciaSeRed = 100; // 100% de eficiência
      }

      return {
        ...perna,
        capitalRetiravel: CR,
        stakeLay: Math.max(0, stakeLay),
        juice: Math.max(0, juice),
        resultadoSeGreen,
        resultadoSeRed,
        eficienciaSeGreen,
        eficienciaSeRed,
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
    
    // CR atual (Capital Retirável)
    const CR = S * ((oddsConfirmadas * oddsPendentes) - 1);
    
    // Próxima perna pendente
    const proximaPerna = pernas.find(p => p.status === 'pendente');
    
    // Calcular juice acumulado de todas as pernas green
    const juiceAcumulado = pernas
      .filter(p => p.status === 'green')
      .reduce((sum, p) => sum + p.juice, 0);
    
    // Juice da próxima perna pendente
    const juiceAtual = proximaPerna?.juice || 0;
    
    // Juice TOTAL se GREEN = acumulado + atual
    const juiceTotal = juiceAcumulado + juiceAtual;
    
    // Resultado se GREEN = CR - Juice Total
    const resultadoSeGreen = CR - juiceTotal;
    
    // Resultado se RED = CR (melhor cenário - 0% juice consumido)
    const resultadoSeRed = CR;
    
    // Eficiência
    const eficienciaSeGreen = CR > 0 ? (resultadoSeGreen / CR) * 100 : 0;
    const eficienciaSeRed = 100; // RED sempre 100%

    return {
      capitalRetiravel: CR,
      custoRetirada: juiceTotal,
      resultadoLiquido: resultadoSeGreen, // Conservador: assume GREEN
      eficiencia: eficienciaSeGreen,
      resultadoSeGreen,
      resultadoSeRed,
      eficienciaSeGreen,
      eficienciaSeRed,
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

    // Calcular juice acumulado das pernas GREEN anteriores
    const juiceAcumulado = pernas
      .filter(p => p.status === 'green')
      .reduce((sum, p) => sum + p.juice, 0);

    // Calcular CR atual
    const oddsConfirmadas = pernas
      .filter(p => p.status === 'green')
      .reduce((prod, p) => prod * p.oddBack, 1);
    
    const oddsPendentes = pernas
      .filter(p => p.status === 'pendente')
      .reduce((prod, p) => prod * p.oddBack, 1);
    
    const CR = S * ((oddsConfirmadas * oddsPendentes) - 1);
    
    // Stake LAY recomendado para esta perna
    const stakeLay = CR / (1 - comissaoDecimal);
    const juiceAtual = stakeLay * (proximaPerna.oddLay - 1);
    
    // Juice TOTAL se executar este LAY
    const juiceTotal = juiceAcumulado + juiceAtual;
    
    // Resultado se GREEN = CR - Juice Total
    const resultadoSeGreen = CR - juiceTotal;
    
    // Resultado se RED = CR (melhor cenário!)
    const resultadoSeRed = CR;
    
    // Eficiência
    const eficienciaSeGreen = CR > 0 ? (resultadoSeGreen / CR) * 100 : 0;
    const eficienciaSeRed = 100; // RED sempre 100%

    return {
      stakeLay,
      oddLay: proximaPerna.oddLay,
      capitalRetiravel: CR,
      custoRetirada: juiceTotal,
      resultadoLiquido: resultadoSeGreen,
      eficiencia: eficienciaSeGreen,
      resultadoSeGreen,
      resultadoSeRed,
      eficienciaSeGreen,
      eficienciaSeRed,
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
