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
  stakeLay: number;       // Valor a apostar no lay
  juice: number;          // Custo da retirada (responsabilidade do LAY)
  resultadoSeGreen: number; // Resultado líquido se GREEN
  resultadoSeRed: number;   // Resultado líquido se RED
  eficienciaSeGreen: number; // % do capital preservado se GREEN
  eficienciaSeRed: number;   // % do capital preservado se RED
}

export interface JuiceData {
  capitalExtraido: number;     // = Stake Inicial (sempre)
  custoRetirada: number;       // Juice total - custo se GREEN
  resultadoSeGreen: number;    // Resultado se tudo GREEN
  resultadoSeRed: number;      // Resultado se RED agora
  eficienciaSeGreen: number;   // Eficiência se GREEN
  eficienciaSeRed: number;     // Eficiência se RED
  compensacaoExchange: number; // Valor pago pela exchange (para info)
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
    capitalExtraido: number;
    custoRetirada: number;
    resultadoSeGreen: number; 
    resultadoSeRed: number; 
    eficienciaSeGreen: number;
    eficienciaSeRed: number;
    pernaAtual: number;
    compensacaoExchange: number;
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
   * MODELO DE RETIRADA DE CAPITAL (CORRIGIDO)
   * 
   * REGRA-MÃE: O objetivo é RETIRAR o CAPITAL (stake) da bookmaker.
   * A exchange é apenas um MECANISMO de conversão/compensação.
   * 
   * DEFINIÇÕES CORRETAS:
   * - Capital Extraído = Stake Inicial (SEMPRE) - é o capital "preso" na bookmaker
   * - Juice = custo pago na exchange quando LAY PERDE (GREEN)
   * - Resultado Líquido = Capital Extraído - Juice
   * - Eficiência = Resultado / Capital Extraído × 100
   * 
   * CENÁRIOS:
   * - Se GREEN: Capital sai via vitória, mas pagamos juice → Resultado = S - Juice
   * - Se RED: Capital sai via exchange (LAY ganha), juice NÃO é consumido → Resultado = S (100% eficiência)
   * 
   * A exchange NÃO É FONTE de capital extraído - ela apenas viabiliza a retirada.
   */
  const recalcularPernas = useCallback((
    pernas: PernaAposta[],
    stakeInicial: number,
    comissao: number,
    objetivo: ObjetivoAposta
  ): PernaAposta[] => {
    const comissaoDecimal = comissao / 100;
    const S = stakeInicial; // Capital a ser extraído (FIXO)
    
    // Verificar se já existe RED
    const temRed = pernas.some(p => p.status === 'red');
    
    // Calcular juice acumulado das pernas GREEN confirmadas
    let juiceAcumulado = 0;
    
    for (const perna of pernas) {
      if (perna.status === 'green') {
        const indexPerna = pernas.indexOf(perna);
        
        // Calcular o LPR (Lucro Potencial Real) que existia no momento dessa perna
        const oddsConfirmadasAteMomento = pernas
          .slice(0, indexPerna + 1)
          .filter(p => p.status === 'green')
          .reduce((prod, p) => prod * p.oddBack, 1);
        
        const oddsPendentesAposMomento = pernas
          .slice(indexPerna + 1)
          .reduce((prod, p) => prod * p.oddBack, 1);
        
        const LPRNoMomento = S * ((oddsConfirmadasAteMomento * oddsPendentesAposMomento) - 1);
        const stakeLayNoMomento = LPRNoMomento / (1 - comissaoDecimal);
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
      
      // LPR = Lucro Potencial Real (usado para calcular stake LAY)
      const LPR = S * ((oddsConfirmadas * oddsPendentes) - 1);
      
      const oddLay = perna.oddLay;
      
      let stakeLay = 0;
      let juice = 0;
      let resultadoSeGreen = 0;
      let resultadoSeRed = 0;
      let eficienciaSeGreen = 0;
      let eficienciaSeRed = 0;

      if (perna.status === 'pendente') {
        // Stake_LAY = LPR / (1 − comissão)
        stakeLay = LPR / (1 - comissaoDecimal);
        
        // Juice = Stake_LAY × (odd_lay − 1) - CUSTO se GREEN
        juice = stakeLay * (oddLay - 1);
        
        // Juice total se GREEN = acumulados + atual
        const juiceTotalSeGreen = juiceAcumulado + juice;
        
        // RESULTADO SE GREEN = Capital Extraído - Juice Total
        // Capital sai da bookmaker, mas pagamos o juice
        resultadoSeGreen = S - juiceTotalSeGreen;
        
        // RESULTADO SE RED = Capital Extraído (100% - juice NÃO consumido)
        // O stake é "liberado" via exchange, sem custo
        resultadoSeRed = S;
        
        // Eficiência = Resultado / Capital Extraído × 100
        eficienciaSeGreen = S > 0 ? (resultadoSeGreen / S) * 100 : 0;
        eficienciaSeRed = 100; // RED sempre 100% (juice não consumido)
        
        // Ajuste para objetivo "limitar_lucro"
        if (objetivo === 'limitar_lucro') {
          const lucroMaximoDesejado = S * 0.1;
          const LPRAjustado = Math.max(0, LPR - lucroMaximoDesejado);
          stakeLay = LPRAjustado / (1 - comissaoDecimal);
          juice = stakeLay * (oddLay - 1);
          const juiceTotalSeGreenAjustado = juiceAcumulado + juice;
          resultadoSeGreen = S - juiceTotalSeGreenAjustado;
          eficienciaSeGreen = S > 0 ? (resultadoSeGreen / S) * 100 : 0;
        }
        
      } else if (perna.status === 'green') {
        // Perna já confirmada GREEN - calcular valores históricos
        const LPRNoMomento = S * ((oddsConfirmadas * perna.oddBack * 
          pernas.slice(index + 1).reduce((prod, p) => prod * p.oddBack, 1)) - 1);
        
        stakeLay = LPRNoMomento / (1 - comissaoDecimal);
        juice = stakeLay * (oddLay - 1);
        
        // Resultados zerados pois já aconteceu
        resultadoSeGreen = 0;
        resultadoSeRed = 0;
        eficienciaSeGreen = 0;
        eficienciaSeRed = 0;
        
      } else if (perna.status === 'red') {
        // RED aconteceu - extração perfeita!
        // Capital foi extraído via exchange com 0% de juice consumido
        
        const oddsConfirmadasAntes = pernas
          .slice(0, index)
          .filter(p => p.status === 'green')
          .reduce((prod, p) => prod * p.oddBack, 1);
        
        const oddsPendentesIncluindoEsta = pernas
          .slice(index)
          .reduce((prod, p) => prod * p.oddBack, 1);
        
        const LPRAntes = S * ((oddsConfirmadasAntes * oddsPendentesIncluindoEsta) - 1);
        
        stakeLay = LPRAntes / (1 - comissaoDecimal);
        juice = 0; // Juice NÃO foi consumido no RED
        resultadoSeRed = S; // Capital extraído = Stake inicial
        eficienciaSeRed = 100; // 100% de eficiência
      }

      return {
        ...perna,
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
    const S = stakeInicial; // Capital Extraído = Stake Inicial (SEMPRE)
    const comissaoDecimal = comissaoExchange / 100;
    
    // Calcular odds confirmadas (green)
    const oddsConfirmadas = pernas
      .filter(p => p.status === 'green')
      .reduce((prod, p) => prod * p.oddBack, 1);
    
    // Calcular odds pendentes
    const oddsPendentes = pernas
      .filter(p => p.status === 'pendente')
      .reduce((prod, p) => prod * p.oddBack, 1);
    
    // LPR atual (para calcular compensação)
    const LPR = S * ((oddsConfirmadas * oddsPendentes) - 1);
    
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
    
    // Compensação da exchange (apenas para info)
    const stakeLayAtual = proximaPerna?.stakeLay || 0;
    const compensacaoExchange = stakeLayAtual * (1 - comissaoDecimal);
    
    // RESULTADOS CORRETOS:
    // Se GREEN = Capital Extraído - Juice
    const resultadoSeGreen = S - juiceTotal;
    
    // Se RED = Capital Extraído (100%, juice não consumido)
    const resultadoSeRed = S;
    
    // Eficiência
    const eficienciaSeGreen = S > 0 ? (resultadoSeGreen / S) * 100 : 0;
    const eficienciaSeRed = 100; // RED sempre 100%

    return {
      capitalExtraido: S,
      custoRetirada: juiceTotal,
      resultadoSeGreen,
      resultadoSeRed,
      eficienciaSeGreen,
      eficienciaSeRed,
      compensacaoExchange,
    };
  }, [state]);

  const getAcaoRecomendada = useCallback(() => {
    const { pernas, stakeInicial, comissaoExchange } = state;
    const S = stakeInicial; // Capital Extraído = Stake Inicial (SEMPRE)
    const comissaoDecimal = comissaoExchange / 100;
    
    const proximaPerna = pernas.find(p => p.status === 'pendente');
    if (!proximaPerna) return null;
    
    const algumRed = pernas.some(p => p.status === 'red');
    if (algumRed) return null;

    // Calcular juice acumulado das pernas GREEN anteriores
    const juiceAcumulado = pernas
      .filter(p => p.status === 'green')
      .reduce((sum, p) => sum + p.juice, 0);

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
    const juiceAtual = stakeLay * (proximaPerna.oddLay - 1);
    
    // Juice TOTAL se executar este LAY
    const juiceTotal = juiceAcumulado + juiceAtual;
    
    // Compensação da exchange (para info)
    const compensacaoExchange = stakeLay * (1 - comissaoDecimal);
    
    // RESULTADOS CORRETOS:
    // Se GREEN = Capital Extraído - Juice
    const resultadoSeGreen = S - juiceTotal;
    
    // Se RED = Capital Extraído (100%, juice não consumido)
    const resultadoSeRed = S;
    
    // Eficiência
    const eficienciaSeGreen = S > 0 ? (resultadoSeGreen / S) * 100 : 0;
    const eficienciaSeRed = 100; // RED sempre 100%

    return {
      stakeLay,
      oddLay: proximaPerna.oddLay,
      capitalExtraido: S,
      custoRetirada: juiceTotal,
      resultadoSeGreen,
      resultadoSeRed,
      eficienciaSeGreen,
      eficienciaSeRed,
      pernaAtual: proximaPerna.id,
      compensacaoExchange,
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
