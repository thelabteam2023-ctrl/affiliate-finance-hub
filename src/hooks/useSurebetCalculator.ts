/**
 * useSurebetCalculator - Hook de cálculo de arbitragem N-pernas
 * 
 * Implementa:
 * - Cálculo de stakes para lucro equalizado
 * - Checkbox D para distribuição de lucro (como surebet.com)
 * - Análise de cenários por perna
 * - Arredondamento configurável
 */

import { useMemo, useCallback } from 'react';
import { type SupportedCurrency } from '@/hooks/useCurrencySnapshot';

// ============================================
// TIPOS
// ============================================

export interface OddEntry {
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  selecao: string;
  selecaoLivre: string;
  isReference: boolean;
  isManuallyEdited: boolean;
  stakeOrigem?: 'print' | 'referencia' | 'manual';
  resultado?: string | null;
  lucro_prejuizo?: number | null;
  gerouFreebet?: boolean;
  valorFreebetGerada?: string;
  additionalEntries?: OddFormEntry[];
}

export interface OddFormEntry {
  bookmaker_id: string;
  moeda: SupportedCurrency;
  odd: string;
  stake: string;
  selecaoLivre: string;
}

export interface LegScenario {
  index: number;
  selecao: string;
  stake: number;
  oddMedia: number;
  retorno: number;
  lucro: number;
  roi: number;
  isPositive: boolean;
  isDirected: boolean;
}

export interface SurebetAnalysis {
  stakeTotal: number;
  scenarios: LegScenario[];
  minLucro: number;
  maxLucro: number;
  minRoi: number;
  maxRoi: number;
  isMultiCurrency: boolean;
  moedaDominante: SupportedCurrency;
  validOddsCount: number;
  pernasCompletasCount: number;
  isValidArbitrage: boolean;
  isOperacaoParcial: boolean;
}

interface BookmakerInfo {
  id: string;
  moeda: string;
}

// ============================================
// FUNÇÕES UTILITÁRIAS
// ============================================

export function calcularOddMedia(
  mainEntry: { odd: string; stake: string }, 
  additionalEntries?: OddFormEntry[]
): number {
  const allEntries = [
    { odd: mainEntry.odd, stake: mainEntry.stake, isMain: true },
    ...(additionalEntries || []).map(e => ({ odd: e.odd, stake: e.stake, isMain: false }))
  ];

  const oddsValidas = allEntries
    .map(e => ({ ...e, oddNum: parseFloat(e.odd), stakeNum: parseFloat(e.stake) }))
    .filter(e => !isNaN(e.oddNum) && e.oddNum > 1);

  if (oddsValidas.length === 0) return 0;

  const entriesComStake = oddsValidas.filter(e => !isNaN(e.stakeNum) && e.stakeNum > 0);
  const somaStake = entriesComStake.reduce((acc, e) => acc + e.stakeNum, 0);

  if (somaStake > 0) {
    const somaStakeOdd = entriesComStake.reduce((acc, e) => acc + e.stakeNum * e.oddNum, 0);
    return somaStakeOdd / somaStake;
  }

  const mainOdd = oddsValidas.find(e => e.isMain)?.oddNum;
  return mainOdd ?? oddsValidas[0].oddNum;
}

export function calcularStakeTotal(
  mainEntry: { stake: string }, 
  additionalEntries?: OddFormEntry[]
): number {
  const mainStake = parseFloat(mainEntry.stake) || 0;
  const additionalStakes = (additionalEntries || []).reduce((acc, e) => {
    return acc + (parseFloat(e.stake) || 0);
  }, 0);
  return mainStake + additionalStakes;
}

// ============================================
// CÁLCULO N-PERNAS — LUCRO EQUALIZADO
// ============================================

function calcularStakesEqualizadas(
  odds: { oddMedia: number; stakeAtual: number; isReference: boolean }[],
  arredondarFn: (value: number) => number
): { stakes: number[]; isValid: boolean; lucroIgualado: number } {
  const n = odds.length;
  if (n < 2) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const todasOddsValidas = odds.every(o => o.oddMedia > 1);
  if (!todasOddsValidas) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const refIndex = odds.findIndex(o => o.isReference);
  if (refIndex === -1) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const refOdd = odds[refIndex].oddMedia;
  const refStake = odds[refIndex].stakeAtual;
  
  if (refStake <= 0 || refOdd <= 1) {
    return { stakes: odds.map(o => o.stakeAtual), isValid: false, lucroIgualado: 0 };
  }
  
  const targetReturn = refStake * refOdd;
  
  const calculatedStakes = odds.map((o, i) => {
    if (i === refIndex) return refStake;
    return arredondarFn(targetReturn / o.oddMedia);
  });
  
  const stakeTotal = calculatedStakes.reduce((a, b) => a + b, 0);
  const lucroIgualado = targetReturn - stakeTotal;
  
  return { stakes: calculatedStakes, isValid: true, lucroIgualado };
}

// ============================================
// CÁLCULO CHECKBOX D — DISTRIBUIÇÃO DE LUCRO
// ============================================

function calcularStakesDirecionadas(
  parsedOdds: number[],
  odds: OddEntry[],
  directedProfitLegs: number[],
  arredondarFn: (value: number) => number
): number[] | null {
  // Se todas ou nenhuma marcada, não há direcionamento
  if (directedProfitLegs.length === parsedOdds.length) return null;
  if (directedProfitLegs.length === 0) return null;
  
  const validOddsCount = parsedOdds.filter(o => o > 1).length;
  if (validOddsCount !== parsedOdds.length) return null;
  
  // Encontrar perna de referência (primeira D=true com stake)
  const refIndex = directedProfitLegs.find(i => {
    const stake = parseFloat(odds[i].stake);
    return !isNaN(stake) && stake > 0;
  });
  
  if (refIndex === undefined) return null;
  
  const refStake = parseFloat(odds[refIndex].stake) || 0;
  const refOdd = parsedOdds[refIndex];
  
  if (refStake <= 0 || refOdd <= 1) return null;
  
  const retornoAlvo = refStake * refOdd;
  
  // Calcular stakes para pernas D=true
  const stakesDirected: { [key: number]: number } = {};
  for (const i of directedProfitLegs) {
    const oddI = parsedOdds[i];
    if (oddI > 1) {
      stakesDirected[i] = retornoAlvo / oddI;
    }
  }
  
  const somaStakesDirected = Object.values(stakesDirected).reduce((a, b) => a + b, 0);
  
  // Índices das pernas não direcionadas (D=false)
  const undirectedIndices = parsedOdds.map((_, i) => i).filter(i => !directedProfitLegs.includes(i));
  
  if (undirectedIndices.length === 0) return null;
  
  // Resolver sistema para pernas D=false (lucro = 0)
  const sumInvOdds = undirectedIndices.reduce((acc, i) => acc + 1 / parsedOdds[i], 0);
  
  if (sumInvOdds >= 1) return null;
  
  const S = (somaStakesDirected * sumInvOdds) / (1 - sumInvOdds);
  const stakeTotal = somaStakesDirected + S;
  
  const newStakes: number[] = [];
  
  for (let i = 0; i < parsedOdds.length; i++) {
    const oddI = parsedOdds[i];
    if (oddI <= 1) {
      newStakes.push(0);
    } else if (directedProfitLegs.includes(i)) {
      newStakes.push(arredondarFn(stakesDirected[i] || retornoAlvo / oddI));
    } else {
      newStakes.push(arredondarFn(stakeTotal / oddI));
    }
  }
  
  return newStakes;
}

// ============================================
// HOOK PRINCIPAL
// ============================================

interface UseSurebetCalculatorParams {
  odds: OddEntry[];
  directedProfitLegs: number[];
  numPernas: number;
  arredondarAtivado: boolean;
  arredondarValor: string;
  bookmakerSaldos: BookmakerInfo[];
}

export function useSurebetCalculator({
  odds,
  directedProfitLegs,
  numPernas,
  arredondarAtivado,
  arredondarValor,
  bookmakerSaldos
}: UseSurebetCalculatorParams) {
  
  // Função de arredondamento
  const arredondarStake = useCallback((valor: number): number => {
    if (!arredondarAtivado || !valor) return valor;
    const fator = parseFloat(arredondarValor) || 1;
    return Math.round(valor / fator) * fator;
  }, [arredondarAtivado, arredondarValor]);

  // Helpers
  const getOddMediaPerna = useCallback((entry: OddEntry): number => {
    return calcularOddMedia({ odd: entry.odd, stake: entry.stake }, entry.additionalEntries);
  }, []);

  const getStakeTotalPerna = useCallback((entry: OddEntry): number => {
    return calcularStakeTotal({ stake: entry.stake }, entry.additionalEntries);
  }, []);

  // Cálculo de stakes direcionadas (checkbox D)
  const directedStakes = useMemo(() => {
    const parsedOdds = odds.map(o => getOddMediaPerna(o));
    return calcularStakesDirecionadas(parsedOdds, odds, directedProfitLegs, arredondarStake);
  }, [odds, directedProfitLegs, arredondarStake, getOddMediaPerna]);

  // Stakes calculadas (equalizadas ou direcionadas)
  const calculatedStakes = useMemo(() => {
    if (directedStakes) return directedStakes;
    
    const pernaData = odds.map(perna => ({
      oddMedia: getOddMediaPerna(perna),
      stakeAtual: getStakeTotalPerna(perna),
      isReference: perna.isReference,
      isManuallyEdited: perna.isManuallyEdited
    }));
    
    const resultado = calcularStakesEqualizadas(pernaData, arredondarStake);
    return resultado.isValid ? resultado.stakes : odds.map(o => getStakeTotalPerna(o));
  }, [odds, directedStakes, arredondarStake, getOddMediaPerna, getStakeTotalPerna]);

  // Análise completa
  const analysis = useMemo((): SurebetAnalysis => {
    const parsedOdds = odds.map(o => getOddMediaPerna(o));
    const validOddsCount = parsedOdds.filter(o => o > 1).length;
    
    const actualStakes = directedStakes || calculatedStakes;
    
    // Detectar multi-moeda
    const moedasSelecionadas = odds.map(o => {
      const bk = bookmakerSaldos.find(b => b.id === o.bookmaker_id);
      return bk?.moeda as SupportedCurrency;
    });
    
    const moedasUnicas = [...new Set(moedasSelecionadas.filter(Boolean))];
    const isMultiCurrency = moedasUnicas.length > 1;
    const moedaDominante: SupportedCurrency = moedasUnicas.length === 1 ? moedasUnicas[0] : 'BRL';
    
    const stakeTotal = isMultiCurrency ? 0 : actualStakes.reduce((a, b) => a + b, 0);
    
    // Calcular cenários por perna
    const scenarios: LegScenario[] = parsedOdds.map((odd, i) => {
      const stakeNesseLado = actualStakes[i];
      const retorno = odd > 1 ? stakeNesseLado * odd : 0;
      const lucro = retorno - stakeTotal;
      const roi = stakeTotal > 0 ? (lucro / stakeTotal) * 100 : 0;
      const isDirected = directedProfitLegs.includes(i);
      
      return {
        index: i,
        selecao: odds[i].selecao,
        stake: stakeNesseLado,
        oddMedia: odd,
        retorno,
        lucro,
        roi,
        isPositive: lucro >= 0,
        isDirected
      };
    });
    
    const lucros = scenarios.map(s => s.lucro);
    const minLucro = lucros.length > 0 ? Math.min(...lucros) : 0;
    const maxLucro = lucros.length > 0 ? Math.max(...lucros) : 0;
    const minRoi = stakeTotal > 0 ? (minLucro / stakeTotal) * 100 : 0;
    const maxRoi = stakeTotal > 0 ? (maxLucro / stakeTotal) * 100 : 0;
    
    // Contagem de pernas completas
    const pernasCompletasCount = odds.filter(entry => {
      const odd = parseFloat(entry.odd);
      const stake = parseFloat(entry.stake);
      return !isNaN(odd) && odd > 1 && !isNaN(stake) && stake > 0 && entry.bookmaker_id;
    }).length;
    
    const isValidArbitrage = pernasCompletasCount >= numPernas && minLucro >= 0;
    const isOperacaoParcial = pernasCompletasCount >= 2 && pernasCompletasCount < numPernas;
    
    return {
      stakeTotal,
      scenarios,
      minLucro,
      maxLucro,
      minRoi,
      maxRoi,
      isMultiCurrency,
      moedaDominante,
      validOddsCount,
      pernasCompletasCount,
      isValidArbitrage,
      isOperacaoParcial
    };
  }, [odds, directedProfitLegs, numPernas, directedStakes, calculatedStakes, bookmakerSaldos, getOddMediaPerna]);

  // Pernas válidas para conversão
  const pernasValidas = useMemo(() => {
    return odds.filter(entry => {
      const odd = parseFloat(entry.odd);
      const stake = parseFloat(entry.stake);
      return !isNaN(odd) && odd > 1 && !isNaN(stake) && stake > 0 && entry.bookmaker_id;
    });
  }, [odds]);

  return {
    analysis,
    calculatedStakes,
    directedStakes,
    pernasValidas,
    arredondarStake,
    getOddMediaPerna,
    getStakeTotalPerna
  };
}
