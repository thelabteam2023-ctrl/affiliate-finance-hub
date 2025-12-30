import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * CALCULADORA DE RECUPERAÇÃO PROGRESSIVA + EXTRAÇÃO VIA LAY
 * 
 * CONCEITO FUNDAMENTAL CORRIGIDO:
 * - Passivo: capital atualmente preso na Bookmaker
 * - Extração: FRAÇÃO do passivo que se deseja retirar via Exchange (0% a 100%)
 * - Target: Passivo × Percentual_Extração (NUNCA maior que o passivo!)
 * - Lucro: valor acima do passivo (não é objetivo padrão)
 * 
 * FÓRMULAS CENTRAIS:
 * - Target_n = Passivo_n × (Percentual_Extração / 100)
 * - Stake_LAY_n = Target_n / (1 - comissão)
 * - Se RED: Ganho_LAY = Stake_LAY × (1 - c), Passivo restante = Passivo - Target
 * - Se GREEN: Resultado = Lucro_BACK - Perda_LAY, Novo_Passivo depende do resultado
 * 
 * REGRA ABSOLUTA: Target ≤ Passivo (nunca pode extrair mais do que tem)
 */

export type StatusPerna = 'aguardando' | 'ativa' | 'green' | 'red' | 'travada';
export type TipoAposta = 'dupla' | 'tripla' | 'multipla';
export type MoedaCalc = 'BRL' | 'USD';

export interface PernaAposta {
  id: number;
  oddBack: number;            // Definido na configuração inicial (read-only durante execução)
  oddLay: number;             // Editável APENAS quando a perna está ativa
  percentualExtracao: number; // % do passivo a extrair (0-100)
  status: StatusPerna;
  
  // Calculados automaticamente com base no modelo
  passivoAtual: number;       // Pₙ - Passivo ATUAL da perna
  target: number;             // Tₙ = Pₙ × (% Extração) - O quanto queremos recuperar
  stakeLayNecessario: number; // Stake_LAY = Target / (1 - c)
  responsabilidade: number;   // Stake_LAY × (oddLay - 1)
  
  // Resultados projetados
  lucroBack: number;           // S0 × (oddBack - 1)
  perdaLay: number;            // Stake_LAY × (oddLay - 1)
  resultadoSeGreen: number;    // Lucro_BACK - Perda_LAY
  novoPassivoSeGreen: number;  // Depende do resultado GREEN
  resultadoSeRed: number;      // Sempre 0 (passivo parcialmente zerado)
  capitalExtraidoSeRed: number; // Stake_LAY × (1 - c) = Target
  passivoRestanteSeRed: number; // Passivo - Target (o que sobra se RED)
}

export interface MetricasGlobais {
  stakeInicial: number;
  
  // Volume operado (informativo)
  volumeExchange: number;       // Soma dos stakes LAY
  exposicaoMaxima: number;      // Maior responsabilidade
  
  // Passivo atual
  passivoAtual: number;
  targetAtual: number;
  
  // Se RED na perna ativa
  capitalExtraidoSeRedAgora: number;
  
  // Se todas GREEN (pior cenário)
  passivoFinalSeTodasGreen: number;
  
  // Status
  operacaoEncerrada: boolean;
  motivoEncerramento: 'red' | null;
  capitalFinal: number;
  eficienciaFinal: number;
  
  // Aviso de risco
  avisoRisco: string;
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
  updatePernaExtracao: (id: number, percentual: number) => void;
  confirmarPerna: (id: number, resultado: 'green' | 'red') => void;
  resetCalculadora: () => void;
  getMetricasGlobais: () => MetricasGlobais;
  getSimulacaoAtiva: () => {
    pernaId: number;
    passivo: number;
    percentualExtracao: number;
    target: number;
    stakeLay: number;
    oddLay: number;
    oddBack: number;
    responsabilidade: number;
    seRed: { capitalExtraido: number; resultado: string; passivoRestante: number };
    seGreen: { resultado: number; novoPassivo: number; proxPerna: number | null };
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
    percentualExtracao: 100, // Por padrão, 100% = extrair todo o passivo
    status: i === 0 ? 'ativa' : 'aguardando',
    // Perna 1: passivoAtual = stakeInicial (o capital já está em jogo!)
    // Demais: será calculado pelo recalcularPernas
    passivoAtual: i === 0 ? stakeInicial : 0,
    target: 0,
    stakeLayNecessario: 0,
    responsabilidade: 0,
    lucroBack: 0,
    perdaLay: 0,
    resultadoSeGreen: 0,
    novoPassivoSeGreen: 0,
    resultadoSeRed: 0,
    capitalExtraidoSeRed: 0,
    passivoRestanteSeRed: 0,
  }));
};

export const CalculadoraProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<CalculadoraState>(() => ({
    ...defaultState,
    pernas: createPernas(2, defaultState.stakeInicial),
  }));

  /**
   * RECALCULAR PERNAS - Modelo de Extração Percentual
   * 
   * CONCEITO CORRIGIDO:
   * - Passivo = capital preso na Bookmaker
   * - Extração = PERCENTUAL do passivo a retirar (0-100%)
   * - Target = Passivo × (% Extração) → NUNCA maior que o passivo!
   * 
   * Fórmulas:
   * - Target_n = Passivo_Atual_n × (Percentual_Extração / 100)
   * - Stake_LAY_n = Target_n / (1 - comissão)
   * - Se RED: recupera Target, sobra (Passivo - Target)
   * - Se GREEN: Resultado = Lucro_BACK - Perda_LAY
   */
  const recalcularPernas = useCallback((
    pernas: PernaAposta[],
    stakeInicial: number,
    comissao: number
  ): PernaAposta[] => {
    const comissaoDecimal = comissao / 100;
    let operacaoEncerrada = false;
    let pernaAtiva = 1;
    // Perna 1 começa com o stake inicial como passivo (REGRA ABSOLUTA)
    let passivoParaProximaPerna = stakeInicial;
    
    return pernas.map((perna, index) => {
      const { oddBack, oddLay, percentualExtracao } = perna;
      
      // Se operação já encerrou (RED anterior)
      if (operacaoEncerrada) {
        return {
          ...perna,
          status: 'travada' as StatusPerna,
          passivoAtual: 0,
          target: 0,
          stakeLayNecessario: 0,
          responsabilidade: 0,
          lucroBack: 0,
          perdaLay: 0,
          resultadoSeGreen: 0,
          novoPassivoSeGreen: 0,
          resultadoSeRed: 0,
          capitalExtraidoSeRed: 0,
          passivoRestanteSeRed: 0,
        };
      }
      
      // ==========================================
      // MODELO DE EXTRAÇÃO PERCENTUAL (CORRIGIDO)
      // ==========================================
      
      // PASSIVO ATUAL:
      // - Perna 1: = stakeInicial (o capital JÁ está em jogo desde o início!)
      // - Perna n > 1: = passivo herdado da perna anterior
      const passivoAtual = index === 0 ? stakeInicial : passivoParaProximaPerna;
      
      // VALIDAÇÃO: Perna 1 NUNCA pode ter passivo zero (isso seria um bug)
      if (index === 0 && passivoAtual === 0 && stakeInicial > 0) {
        console.error('ERRO: Perna 1 com passivo zero - isso não deveria acontecer!');
      }
      
      // ==========================================
      // FÓRMULA CORRIGIDA: Target = Passivo × % Extração
      // ==========================================
      // REGRA ABSOLUTA: Target NUNCA pode ser maior que o Passivo!
      const percentualLimitado = Math.min(Math.max(percentualExtracao, 0), 100);
      const target = passivoAtual * (percentualLimitado / 100);
      
      // Stake LAY necessário = Target / (1 - comissão)
      const stakeLayNecessario = target / (1 - comissaoDecimal);
      
      // Responsabilidade = Stake_LAY × (oddLay - 1)
      const responsabilidade = stakeLayNecessario * (oddLay - 1);
      
      // Lucro BACK = S0 × (oddBack - 1)
      const lucroBack = stakeInicial * (oddBack - 1);
      
      // Perda LAY = Stake_LAY × (oddLay - 1) = responsabilidade
      const perdaLay = responsabilidade;
      
      // ==========================================
      // SE GREEN (ganha na Bookmaker)
      // ==========================================
      const resultadoSeGreen = lucroBack - perdaLay;
      
      // Novo passivo se GREEN:
      // - Se resultado positivo: diminui o passivo
      // - Se resultado negativo (perdeu mais do que ganhou): aumenta o passivo
      const novoPassivoSeGreen = passivoAtual - target - resultadoSeGreen;
      
      // ==========================================
      // SE RED (cai na Exchange)
      // ==========================================
      // Ganho LAY Líquido = Stake_LAY × (1 - c) = Target (exatamente o que queríamos extrair!)
      const capitalExtraidoSeRed = stakeLayNecessario * (1 - comissaoDecimal);
      // Passivo restante = Passivo - Target (o que NÃO conseguimos extrair)
      const passivoRestanteSeRed = passivoAtual - target;
      // Resultado = 0 (não é lucro nem prejuízo, é extração do próprio capital)
      const resultadoSeRed = 0;
      
      // ==========================================
      // ATUALIZAR STATUS
      // ==========================================
      
      // Se perna já foi confirmada como RED
      if (perna.status === 'red') {
        operacaoEncerrada = true;
        
        return {
          ...perna,
          passivoAtual,
          target,
          stakeLayNecessario,
          responsabilidade,
          lucroBack,
          perdaLay,
          resultadoSeGreen,
          novoPassivoSeGreen,
          resultadoSeRed,
          capitalExtraidoSeRed,
          passivoRestanteSeRed,
        };
      }
      
      // Se perna já foi confirmada como GREEN
      if (perna.status === 'green') {
        // Atualizar passivo para próxima perna
        passivoParaProximaPerna = novoPassivoSeGreen;
        pernaAtiva = index + 2;
        
        return {
          ...perna,
          passivoAtual,
          target,
          stakeLayNecessario,
          responsabilidade,
          lucroBack,
          perdaLay,
          resultadoSeGreen,
          novoPassivoSeGreen,
          resultadoSeRed,
          capitalExtraidoSeRed,
          passivoRestanteSeRed,
        };
      }
      
      // Determinar status
      let status: StatusPerna = 'aguardando';
      if (index === pernaAtiva - 1) {
        status = 'ativa';
      }
      
      // Preparar passivo para próxima perna (se esta for GREEN)
      passivoParaProximaPerna = novoPassivoSeGreen;
      
      return {
        ...perna,
        status,
        passivoAtual,
        target,
        stakeLayNecessario,
        responsabilidade,
        lucroBack,
        perdaLay,
        resultadoSeGreen,
        novoPassivoSeGreen,
        resultadoSeRed,
        capitalExtraidoSeRed,
        passivoRestanteSeRed,
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
      // Percentual de extração permanece o mesmo (não depende do valor do stake)
      return {
        ...prev,
        stakeInicial: stake,
        pernas: recalcularPernas(prev.pernas, stake, prev.comissaoExchange),
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

  const updatePernaExtracao = useCallback((id: number, percentual: number) => {
    setState(prev => {
      const perna = prev.pernas.find(p => p.id === id);
      if (perna && (perna.status === 'aguardando' || perna.status === 'ativa')) {
        // Limitar percentual entre 0 e 100
        const percentualLimitado = Math.min(Math.max(percentual, 0), 100);
        const newPernas = prev.pernas.map(p => p.id === id ? { ...p, percentualExtracao: percentualLimitado } : p);
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
    const pernaAtiva = pernas.find(p => p.status === 'ativa');
    
    // Volume operado
    const volumeExchange = pernas.reduce((sum, p) => sum + p.stakeLayNecessario, 0);
    const exposicaoMaxima = Math.max(...pernas.map(p => p.responsabilidade));
    
    // Passivo atual (da perna ativa) - nunca é zero na Perna 1
    const passivoAtual = pernaAtiva?.passivoAtual || stakeInicial;
    const targetAtual = pernaAtiva?.target || 0;
    
    // Se RED agora
    const capitalExtraidoSeRedAgora = pernaAtiva?.capitalExtraidoSeRed || stakeInicial;
    
    // Se todas GREEN (calcular passivo final)
    const ultimaPerna = pernas[pernas.length - 1];
    const passivoFinalSeTodasGreen = ultimaPerna?.novoPassivoSeGreen || 0;
    
    // Calcular capital final e eficiência
    let capitalFinal = stakeInicial;
    let eficienciaFinal = 100;
    
    if (pernaRed) {
      // RED = capital extraído
      capitalFinal = pernaRed.capitalExtraidoSeRed;
      eficienciaFinal = stakeInicial > 0 ? (capitalFinal / stakeInicial) * 100 : 0;
    }
    
    // Aviso de risco progressivo
    const maiorStake = Math.max(...pernas.map(p => p.stakeLayNecessario));
    const avisoRisco = `O risco cresce progressivamente a cada GREEN. Maior stake LAY necessário: ${maiorStake.toFixed(2)}`;
    
    return {
      stakeInicial,
      volumeExchange,
      exposicaoMaxima,
      passivoAtual,
      targetAtual,
      capitalExtraidoSeRedAgora,
      passivoFinalSeTodasGreen,
      operacaoEncerrada: !!pernaRed,
      motivoEncerramento: pernaRed ? 'red' : null,
      capitalFinal,
      eficienciaFinal,
      avisoRisco,
    };
  }, [state]);

  const getSimulacaoAtiva = useCallback(() => {
    const { pernas } = state;
    
    const pernaAtiva = pernas.find(p => p.status === 'ativa');
    if (!pernaAtiva) return null;
    
    if (pernas.some(p => p.status === 'red')) return null;
    
    const proxPerna = pernas.find(p => p.id === pernaAtiva.id + 1);
    
    return {
      pernaId: pernaAtiva.id,
      passivo: pernaAtiva.passivoAtual,
      percentualExtracao: pernaAtiva.percentualExtracao,
      target: pernaAtiva.target,
      stakeLay: pernaAtiva.stakeLayNecessario,
      oddLay: pernaAtiva.oddLay,
      oddBack: pernaAtiva.oddBack,
      responsabilidade: pernaAtiva.responsabilidade,
      seRed: {
        capitalExtraido: pernaAtiva.capitalExtraidoSeRed,
        resultado: pernaAtiva.percentualExtracao === 100 ? 'Passivo zerado' : `Passivo restante: ${pernaAtiva.passivoRestanteSeRed.toFixed(2)}`,
        passivoRestante: pernaAtiva.passivoRestanteSeRed,
      },
      seGreen: {
        resultado: pernaAtiva.resultadoSeGreen,
        novoPassivo: pernaAtiva.novoPassivoSeGreen,
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
    updatePernaExtracao,
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
