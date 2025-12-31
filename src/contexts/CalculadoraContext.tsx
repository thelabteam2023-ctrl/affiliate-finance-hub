import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * CALCULADORA DE RECUPERAÇÃO PROGRESSIVA - MODELO CAPITAL COMPROMETIDO
 * 
 * CONCEITO FUNDAMENTAL:
 * - Capital Comprometido: TODO o valor já colocado em risco enquanto a aposta NÃO foi resolvida
 *   Inclui: stake inicial + todo capital utilizado em LAYs anteriores
 * - Target: SEMPRE igual ao Capital Comprometido (recuperação de 100%)
 * - Custo se GREEN: responsabilidade do LAY (aumenta o capital comprometido)
 * - Recuperação se RED: capital comprometido é recuperado via Exchange
 * 
 * FÓRMULAS CENTRAIS:
 * - Capital_Comprometido_1 = Stake_Inicial
 * - Capital_Comprometido_n = Capital_Comprometido_{n-1} + Custo_LAY_{n-1}
 * - Target_n = Capital_Comprometido_n (SEMPRE 100%)
 * - Stake_LAY_n = Target_n / (1 - comissão)
 * - Custo_LAY = Responsabilidade = Stake_LAY × (oddLay - 1)
 * - Se RED: Recuperado = Stake_LAY × (1 - c) = Target
 * - Se GREEN: Novo_Capital_Comprometido = Capital_Comprometido + Custo_LAY
 * 
 * REGRA ABSOLUTA: Capital Comprometido só aumenta (nunca diminui, exceto em RED onde zera)
 */

export type StatusPerna = 'aguardando' | 'ativa' | 'green' | 'red' | 'travada';
export type TipoAposta = 'dupla' | 'tripla' | 'multipla';
export type MoedaCalc = 'BRL' | 'USD';

export interface PernaAposta {
  id: number;
  oddBack: number;            // Definido na configuração inicial (read-only durante execução)
  oddLay: number;             // Editável APENAS quando a perna está ativa
  status: StatusPerna;
  
  // MODELO CAPITAL COMPROMETIDO
  capitalComprometido: number;    // Todo capital já em risco (Stake Inicial + Σ custos LAY anteriores)
  target: number;                 // = capitalComprometido (sempre 100%)
  stakeLayNecessario: number;     // = Target / (1 - comissão)
  custoLay: number;               // = Stake_LAY × (oddLay - 1) = responsabilidade
  
  // Resultados projetados
  lucroBack: number;              // S0 × (oddBack - 1)
  
  // SE GREEN (Bookmaker ganha, aposta continua)
  custoSeGreen: number;                  // = custoLay (o que perdemos no LAY)
  novoCapitalComprometido: number;       // = capitalComprometido + custoLay
  
  // SE RED (Exchange ganha, operação encerra)
  capitalRecuperado: number;             // = Stake_LAY × (1 - c) = Target
  lucroSeRed: number;                    // = capitalRecuperado - stakeInicial
}

export interface MetricasGlobais {
  stakeInicial: number;
  
  // Capital comprometido atual
  capitalComprometidoAtual: number;
  targetAtual: number;
  
  // Volume operado (informativo)
  volumeExchange: number;       // Soma dos stakes LAY
  exposicaoMaxima: number;      // Maior responsabilidade
  
  // Se RED na perna ativa
  capitalRecuperadoSeRedAgora: number;
  lucroSeRedAgora: number;
  
  // Se todas GREEN (pior cenário)
  capitalComprometidoFinal: number;
  
  // Se parar agora (sem proteger)
  custoSeParar: number;         // Capital comprometido que seria perdido
  
  // Status
  operacaoEncerrada: boolean;
  motivoEncerramento: 'red' | 'green_final' | null;
  capitalFinal: number;
  eficienciaFinal: number;
  
  // RED - Quando ocorre RED (extração via Exchange)
  redFinal: {
    capitalBruto: number;              // Stake LAY recebido (bruto, antes da comissão)
    valorComissaoExchange: number;     // Comissão paga à Exchange (só se houver lucro)
    capitalExtraido: number;           // Valor líquido após comissão
    custosTotaisLay: number;           // Soma de todos os custos LAY pagos nas pernas GREEN anteriores
    resultadoLiquido: number;          // capitalExtraido - custosTotaisLay
    percentualExtracao: number;        // resultadoLiquido / stakeInicial × 100
    extracaoCompleta: boolean;         // resultadoLiquido >= stakeInicial (100%+)
  } | null;
  
  // GREEN FINAL - Quando a última perna termina GREEN
  greenFinal: {
    retornoBrutoBookmaker: number;     // Stake × OddBack (retorno total da bookmaker)
    custosTotaisLay: number;           // Soma de todos os custos LAY pagos
    novoSaldoNaCasa: number;           // Retorno bruto - stake inicial (lucro na bookmaker)
    lucroLiquidoReal: number;          // novoSaldoNaCasa - custosTotaisLay
    percentualExtracao: number;        // lucroLiquidoReal / stakeInicial × 100
    houvePerda: boolean;               // lucroLiquidoReal < 0
  } | null;
  
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
  confirmarPerna: (id: number, resultado: 'green' | 'red') => void;
  resetCalculadora: () => void;
  getMetricasGlobais: () => MetricasGlobais;
  getSimulacaoAtiva: () => {
    pernaId: number;
    capitalComprometido: number;
    target: number;
    stakeLay: number;
    oddLay: number;
    oddBack: number;
    custoLay: number;
    seRed: { capitalRecuperado: number; lucro: number };
    seGreen: { custo: number; novoCapitalComprometido: number; proxPerna: number | null };
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
    status: i === 0 ? 'ativa' : 'aguardando',
    // Perna 1: capitalComprometido = stakeInicial
    capitalComprometido: i === 0 ? stakeInicial : 0,
    target: 0,
    stakeLayNecessario: 0,
    custoLay: 0,
    lucroBack: 0,
    custoSeGreen: 0,
    novoCapitalComprometido: 0,
    capitalRecuperado: 0,
    lucroSeRed: 0,
  }));
};

export const CalculadoraProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<CalculadoraState>(() => ({
    ...defaultState,
    pernas: createPernas(2, defaultState.stakeInicial),
  }));

  /**
   * RECALCULAR PERNAS - Modelo Capital Comprometido
   * 
   * CONCEITO:
   * - Capital Comprometido = todo capital já em risco
   * - Target = Capital Comprometido (sempre 100%)
   * - Custo do LAY = responsabilidade = Stake_LAY × (oddLay - 1)
   * - Se GREEN: novo Capital Comprometido = atual + custo do LAY
   * - Se RED: recupera todo o Capital Comprometido
   */
  const recalcularPernas = useCallback((
    pernas: PernaAposta[],
    stakeInicial: number,
    comissao: number
  ): PernaAposta[] => {
    const comissaoDecimal = comissao / 100;
    let operacaoEncerrada = false;
    let pernaAtiva = 1;
    // Perna 1 começa com o stake inicial como capital comprometido
    let capitalParaProximaPerna = stakeInicial;
    
    return pernas.map((perna, index) => {
      const { oddBack, oddLay } = perna;
      
      // Se operação já encerrou (RED anterior)
      if (operacaoEncerrada) {
        return {
          ...perna,
          status: 'travada' as StatusPerna,
          capitalComprometido: 0,
          target: 0,
          stakeLayNecessario: 0,
          custoLay: 0,
          lucroBack: 0,
          custoSeGreen: 0,
          novoCapitalComprometido: 0,
          capitalRecuperado: 0,
          lucroSeRed: 0,
        };
      }
      
      // ==========================================
      // MODELO CAPITAL COMPROMETIDO
      // ==========================================
      
      // CAPITAL COMPROMETIDO:
      // - Perna 1: = stakeInicial (o capital JÁ está em jogo!)
      // - Perna n > 1: = capital comprometido anterior + custo do LAY anterior
      const capitalComprometido = index === 0 ? stakeInicial : capitalParaProximaPerna;
      
      // VALIDAÇÃO: Capital Comprometido só pode aumentar (nunca diminuir)
      if (index > 0 && capitalComprometido < stakeInicial) {
        console.error('ERRO: Capital Comprometido menor que stake inicial - isso não deveria acontecer!');
      }
      
      // ==========================================
      // FÓRMULA: Target = Capital Comprometido (sempre 100%)
      // ==========================================
      const target = capitalComprometido;
      
      // Stake LAY necessário = Target / (1 - comissão)
      const stakeLayNecessario = target / (1 - comissaoDecimal);
      
      // Custo do LAY (responsabilidade) = Stake_LAY × (oddLay - 1)
      const custoLay = stakeLayNecessario * (oddLay - 1);
      
      // Lucro BACK = S0 × (oddBack - 1)
      const lucroBack = stakeInicial * (oddBack - 1);
      
      // ==========================================
      // SE GREEN (Bookmaker ganha, aposta continua)
      // ==========================================
      // O LAY perde, pagamos a responsabilidade
      const custoSeGreen = custoLay;
      
      // Novo capital comprometido = atual + custo do LAY
      // REGRA: Capital Comprometido SÓ AUMENTA!
      const novoCapitalComprometido = capitalComprometido + custoLay;
      
      // ==========================================
      // SE RED (Exchange ganha, operação encerra)
      // ==========================================
      // Recuperamos todo o capital comprometido via Exchange
      const capitalRecuperado = stakeLayNecessario * (1 - comissaoDecimal); // = target
      
      // Lucro = capital recuperado - stake inicial
      const lucroSeRed = capitalRecuperado - stakeInicial;
      
      // ==========================================
      // ATUALIZAR STATUS
      // ==========================================
      
      // Se perna já foi confirmada como RED
      if (perna.status === 'red') {
        operacaoEncerrada = true;
        
        return {
          ...perna,
          capitalComprometido,
          target,
          stakeLayNecessario,
          custoLay,
          lucroBack,
          custoSeGreen,
          novoCapitalComprometido,
          capitalRecuperado,
          lucroSeRed,
        };
      }
      
      // Se perna já foi confirmada como GREEN
      if (perna.status === 'green') {
        // Atualizar capital comprometido para próxima perna
        capitalParaProximaPerna = novoCapitalComprometido;
        pernaAtiva = index + 2;
        
        return {
          ...perna,
          capitalComprometido,
          target,
          stakeLayNecessario,
          custoLay,
          lucroBack,
          custoSeGreen,
          novoCapitalComprometido,
          capitalRecuperado,
          lucroSeRed,
        };
      }
      
      // Determinar status
      let status: StatusPerna = 'aguardando';
      if (index === pernaAtiva - 1) {
        status = 'ativa';
      }
      
      // Preparar capital comprometido para próxima perna (se esta for GREEN)
      capitalParaProximaPerna = novoCapitalComprometido;
      
      return {
        ...perna,
        status,
        capitalComprometido,
        target,
        stakeLayNecessario,
        custoLay,
        lucroBack,
        custoSeGreen,
        novoCapitalComprometido,
        capitalRecuperado,
        lucroSeRed,
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
    const { pernas, stakeInicial, comissaoExchange } = state;
    
    // Verificar status
    const pernaRed = pernas.find(p => p.status === 'red');
    const pernaAtiva = pernas.find(p => p.status === 'ativa');
    const todasGreen = pernas.every(p => p.status === 'green');
    const ultimaPerna = pernas[pernas.length - 1];
    const ultimaPernaGreen = ultimaPerna?.status === 'green';
    
    // Volume operado
    const volumeExchange = pernas.reduce((sum, p) => sum + p.stakeLayNecessario, 0);
    const exposicaoMaxima = Math.max(...pernas.map(p => p.custoLay));
    
    // Capital comprometido atual (da perna ativa)
    const capitalComprometidoAtual = pernaAtiva?.capitalComprometido || stakeInicial;
    const targetAtual = pernaAtiva?.target || stakeInicial;
    
    // Se RED agora
    const capitalRecuperadoSeRedAgora = pernaAtiva?.capitalRecuperado || stakeInicial;
    const lucroSeRedAgora = pernaAtiva?.lucroSeRed || 0;
    
    // Se todas GREEN (pior cenário - maior capital comprometido)
    const capitalComprometidoFinal = ultimaPerna?.novoCapitalComprometido || 0;
    
    // Se parar agora (sem proteger)
    const custoSeParar = capitalComprometidoAtual;
    
    // Calcular capital final e eficiência
    let capitalFinal = stakeInicial;
    let eficienciaFinal = 100;
    let motivoEncerramento: 'red' | 'green_final' | null = null;
    let greenFinal: MetricasGlobais['greenFinal'] = null;
    let redFinal: MetricasGlobais['redFinal'] = null;
    
    if (pernaRed) {
      // RED = capital recuperado via Exchange
      motivoEncerramento = 'red';
      
      // Capital BRUTO recebido da Exchange (stake LAY)
      const capitalBruto = pernaRed.stakeLayNecessario;
      
      // Responsabilidade LAY da perna RED (o que foi arriscado)
      const responsabilidadeLay = pernaRed.stakeLayNecessario * (pernaRed.oddLay - 1);
      
      // Lucro na Exchange = ganho bruto - risco (responsabilidade)
      // Responsabilidade é zero porque ganhou, então lucro = stake LAY
      const lucroExchange = capitalBruto - 0; // Quando ganha LAY, recebe o stake sem pagar responsabilidade
      
      // Comissão da Exchange SOMENTE sobre o lucro
      const valorComissaoExchange = lucroExchange > 0 
        ? (lucroExchange * comissaoExchange / 100) 
        : 0;
      
      // Capital LÍQUIDO = bruto - comissão
      const capitalExtraido = capitalBruto - valorComissaoExchange;
      
      // Soma dos custos LAY das pernas GREEN anteriores (só as que deram GREEN)
      const pernasGreenAnteriores = pernas.filter(p => p.status === 'green');
      const custosTotaisLay = pernasGreenAnteriores.reduce((sum, p) => sum + p.custoLay, 0);
      
      // Resultado líquido = capital extraído - stake perdido na bookmaker - custos LAY anteriores
      // O stake foi PERDIDO na bookmaker (RED), então precisa descontar
      const resultadoLiquido = capitalExtraido - stakeInicial - custosTotaisLay;
      
      // Percentual de extração: quanto do stake inicial foi efetivamente recuperado
      // Se resultadoLiquido = 0, significa break-even (recuperou 100% do stake, sem lucro)
      // Se resultadoLiquido = -5.26, significa que perdeu 5.26% (o juice)
      const percentualExtracao = stakeInicial > 0 ? (resultadoLiquido / stakeInicial) * 100 : 0;
      
      redFinal = {
        capitalBruto,
        valorComissaoExchange,
        capitalExtraido,
        custosTotaisLay,
        resultadoLiquido,
        percentualExtracao,
        extracaoCompleta: resultadoLiquido >= stakeInicial,
      };
      
      capitalFinal = resultadoLiquido;
      eficienciaFinal = percentualExtracao;
    } else if (ultimaPernaGreen) {
      // GREEN FINAL = Última perna terminou GREEN
      // A Bookmaker pagou a múltipla completa
      motivoEncerramento = 'green_final';
      
      // Soma de todos os custos LAY (responsabilidades pagas nas proteções)
      const custosTotaisLay = pernas.reduce((sum, p) => sum + p.custoLay, 0);
      
      // Retorno da Bookmaker em MÚLTIPLA: stake × Π(odds)
      // Produto de todas as odds BACK das pernas confirmadas como GREEN
      const pernasGreen = pernas.filter(p => p.status === 'green');
      const produtoOdds = pernasGreen.reduce((prod, p) => prod * p.oddBack, 1);
      const retornoBrutoBookmaker = stakeInicial * produtoOdds;
      
      // Novo saldo na casa = retorno total da bookmaker (stake + lucros)
      const novoSaldoNaCasa = retornoBrutoBookmaker;
      
      // Lucro líquido real = saldo total - stake investido - custos LAY
      // Representa a variação patrimonial total da operação
      const lucroLiquidoReal = novoSaldoNaCasa - stakeInicial - custosTotaisLay;
      
      // Percentual de extração real (em relação ao stake inicial)
      const percentualExtracao = stakeInicial > 0 ? (lucroLiquidoReal / stakeInicial) * 100 : 0;
      
      greenFinal = {
        retornoBrutoBookmaker,
        custosTotaisLay,
        novoSaldoNaCasa,
        lucroLiquidoReal,
        percentualExtracao,
        houvePerda: lucroLiquidoReal < 0,
      };
      
      capitalFinal = stakeInicial + lucroLiquidoReal;
      eficienciaFinal = stakeInicial > 0 ? (capitalFinal / stakeInicial) * 100 : 0;
    }
    
    // Aviso de risco progressivo
    const maiorCusto = Math.max(...pernas.map(p => p.custoLay));
    const avisoRisco = `O risco cresce progressivamente a cada GREEN. Maior custo LAY: ${maiorCusto.toFixed(2)}`;
    
    return {
      stakeInicial,
      capitalComprometidoAtual,
      targetAtual,
      volumeExchange,
      exposicaoMaxima,
      capitalRecuperadoSeRedAgora,
      lucroSeRedAgora,
      capitalComprometidoFinal,
      custoSeParar,
      operacaoEncerrada: !!pernaRed || ultimaPernaGreen,
      motivoEncerramento,
      capitalFinal,
      eficienciaFinal,
      redFinal,
      greenFinal,
      avisoRisco,
    };
  }, [state]);

  const getSimulacaoAtiva = useCallback(() => {
    const { pernas, stakeInicial } = state;
    
    const pernaAtiva = pernas.find(p => p.status === 'ativa');
    if (!pernaAtiva) return null;
    
    if (pernas.some(p => p.status === 'red')) return null;
    
    const proxPerna = pernas.find(p => p.id === pernaAtiva.id + 1);
    
    return {
      pernaId: pernaAtiva.id,
      capitalComprometido: pernaAtiva.capitalComprometido,
      target: pernaAtiva.target,
      stakeLay: pernaAtiva.stakeLayNecessario,
      oddLay: pernaAtiva.oddLay,
      oddBack: pernaAtiva.oddBack,
      custoLay: pernaAtiva.custoLay,
      seRed: {
        capitalRecuperado: pernaAtiva.capitalRecuperado,
        lucro: pernaAtiva.lucroSeRed,
      },
      seGreen: {
        custo: pernaAtiva.custoSeGreen,
        novoCapitalComprometido: pernaAtiva.novoCapitalComprometido,
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
    getSimulacaoAtiva,
  };

  return (
    <CalculadoraContext.Provider value={contextValue}>
      {children}
    </CalculadoraContext.Provider>
  );
};
