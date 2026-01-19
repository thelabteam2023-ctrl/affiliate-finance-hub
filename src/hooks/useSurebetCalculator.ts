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
// CÁLCULO CHECKBOX D — REDISTRIBUIÇÃO DE LUCRO
// ============================================
// 
// REGRA DE NEGÓCIO CORRETA:
// - Pernas DESMARCADAS (D=false): stakes permanecem FIXAS, lucro deve ser ≈ 0
// - Perna MARCADA (D=true): única que pode ter stake ajustada (REDUZIDA)
//
// O objetivo é concentrar todo o lucro na perna marcada,
// zerando o lucro das pernas desmarcadas.
//
// Lógica:
// 1. Manter stakes fixas das pernas desmarcadas
// 2. Calcular o retorno necessário para zerar lucro das desmarcadas
// 3. Ajustar (reduzir) a stake da perna marcada para atingir esse retorno
// ============================================

function calcularStakesDirecionadas(
  parsedOdds: number[],
  odds: OddEntry[],
  directedProfitLegs: number[],
  arredondarFn: (value: number) => number
): number[] | null {
  const n = parsedOdds.length;
  
  // Não há direcionamento se:
  // - Todas marcadas (comportamento padrão equalizado)
  // - Nenhuma marcada (impossível redistribuir)
  if (directedProfitLegs.length === 0) return null;
  if (directedProfitLegs.length === n) return null;
  
  // Validar que todas as odds são válidas
  const validOddsCount = parsedOdds.filter(o => o > 1).length;
  if (validOddsCount !== n) return null;
  
  // Identificar pernas marcadas e desmarcadas
  const markedIndices = directedProfitLegs;
  const unmarkedIndices = parsedOdds.map((_, i) => i).filter(i => !markedIndices.includes(i));
  
  // VALIDAÇÃO: Deve haver exatamente UMA perna marcada
  // (múltiplas marcadas seria comportamento ambíguo)
  if (markedIndices.length !== 1) {
    // Se múltiplas marcadas, comportar como equalizado para elas
    // Mas mantemos a lógica original por compatibilidade
    return calcularMultipleMarkedLegs(parsedOdds, odds, markedIndices, unmarkedIndices, arredondarFn);
  }
  
  const markedIndex = markedIndices[0];
  const markedOdd = parsedOdds[markedIndex];
  
  // Stakes atuais de TODAS as pernas (permanecem fixas para desmarcadas)
  const currentStakes = odds.map(o => parseFloat(o.stake) || 0);
  
  // Validar que temos stakes válidas nas pernas desmarcadas
  const stakesUnmarkedValid = unmarkedIndices.every(i => currentStakes[i] > 0);
  if (!stakesUnmarkedValid) return null;
  
  // CÁLCULO:
  // Para lucro = 0 nas pernas desmarcadas:
  // retorno_desmarcada = stake_total
  // stake_desmarcada * odd_desmarcada = stake_total
  //
  // Soma das stakes = stake_marcada + soma_stakes_desmarcadas
  // Para cada perna desmarcada: stake_i * odd_i = stake_total
  // Então: stake_total = stake_i * odd_i (para qualquer i desmarcada)
  //
  // Dado que as stakes das desmarcadas são FIXAS:
  // Precisamos calcular a stake_marcada tal que o retorno dela
  // seja igual ao retorno esperado quando ela vencer.
  
  // Soma das stakes desmarcadas (fixas)
  const somaStakesDesmarcadas = unmarkedIndices.reduce((acc, i) => acc + currentStakes[i], 0);
  
  // Para cada perna desmarcada, calculamos qual seria o stake_total
  // necessário para que seu lucro seja zero (retorno = stake_total)
  // retorno_i = stake_i * odd_i = stake_total
  // stake_marcada = stake_total - soma_desmarcadas = stake_i * odd_i - soma_desmarcadas
  
  // Para lucro ≈ 0 em TODAS as desmarcadas, precisamos que:
  // stake_i * odd_i = stake_j * odd_j para todo i,j desmarcados
  // Isso geralmente não é possível com stakes fixas...
  //
  // Solução: calcular a stake_marcada que MINIMIZA o erro
  // O retorno alvo é o maior dos retornos das pernas desmarcadas
  // (garantindo lucro >= 0 em todas)
  
  const retornosDesmarcadas = unmarkedIndices.map(i => currentStakes[i] * parsedOdds[i]);
  const retornoAlvo = Math.max(...retornosDesmarcadas);
  
  // Stake total necessário = retorno alvo (para lucro = 0 no pior caso)
  const stakeTotalNecessario = retornoAlvo;
  
  // Stake da perna marcada = stake_total - soma das fixas
  let stakeMarkedCalculada = stakeTotalNecessario - somaStakesDesmarcadas;
  
  // VALIDAÇÃO: A stake não pode ser negativa
  if (stakeMarkedCalculada < 0) {
    // As stakes das desmarcadas já são suficientes para cobrir
    // Nesse caso, stake marcada = 0 (ou mínimo)
    stakeMarkedCalculada = 0;
  }
  
  // Arredondar
  stakeMarkedCalculada = arredondarFn(stakeMarkedCalculada);
  
  // Montar array de stakes finais
  const newStakes: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === markedIndex) {
      newStakes.push(stakeMarkedCalculada);
    } else {
      // Stakes das desmarcadas permanecem FIXAS
      newStakes.push(currentStakes[i]);
    }
  }
  
  return newStakes;
}

/**
 * Caso especial: múltiplas pernas marcadas
 * Distribui lucro entre as marcadas, zerando as desmarcadas
 */
function calcularMultipleMarkedLegs(
  parsedOdds: number[],
  odds: OddEntry[],
  markedIndices: number[],
  unmarkedIndices: number[],
  arredondarFn: (value: number) => number
): number[] | null {
  const n = parsedOdds.length;
  const currentStakes = odds.map(o => parseFloat(o.stake) || 0);
  
  // Soma das stakes das desmarcadas (fixas)
  const somaStakesDesmarcadas = unmarkedIndices.reduce((acc, i) => acc + currentStakes[i], 0);
  
  // Calcular retorno alvo baseado nas desmarcadas
  const retornosDesmarcadas = unmarkedIndices.map(i => currentStakes[i] * parsedOdds[i]);
  
  if (retornosDesmarcadas.length === 0) {
    // Todas marcadas - comportamento padrão
    return null;
  }
  
  const retornoAlvo = Math.max(...retornosDesmarcadas);
  const stakeTotalNecessario = retornoAlvo;
  
  // Stake disponível para as marcadas
  const stakeDisponivelMarcadas = Math.max(0, stakeTotalNecessario - somaStakesDesmarcadas);
  
  // Distribuir proporcionalmente entre as marcadas (baseado em 1/odd)
  const somaInvOdds = markedIndices.reduce((acc, i) => acc + 1 / parsedOdds[i], 0);
  
  const newStakes: number[] = [];
  for (let i = 0; i < n; i++) {
    if (markedIndices.includes(i)) {
      // Proporcional ao inverso da odd
      const proporcao = (1 / parsedOdds[i]) / somaInvOdds;
      newStakes.push(arredondarFn(stakeDisponivelMarcadas * proporcao));
    } else {
      // Desmarcadas mantêm stake fixa
      newStakes.push(currentStakes[i]);
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
    
    // CORREÇÃO: Para cálculo de lucro, SEMPRE usar as stakes REAIS inseridas pelo usuário
    // (que incluem entries adicionais), não as stakes recalculadas/equalizadas
    const realStakes = odds.map(o => getStakeTotalPerna(o));
    
    // Para distribuição de stakes (direcionamento), usamos calculatedStakes
    // Mas para ANÁLISE de lucro, usamos as stakes REAIS da tela
    const actualStakes = directedStakes || realStakes;
    
    // Detectar multi-moeda
    const moedasSelecionadas = odds.map(o => {
      const bk = bookmakerSaldos.find(b => b.id === o.bookmaker_id);
      return bk?.moeda as SupportedCurrency;
    });
    
    const moedasUnicas = [...new Set(moedasSelecionadas.filter(Boolean))];
    const isMultiCurrency = moedasUnicas.length > 1;
    const moedaDominante: SupportedCurrency = moedasUnicas.length === 1 ? moedasUnicas[0] : 'BRL';
    
    // CORREÇÃO: Usar realStakes para cálculo de stakeTotal (soma das stakes inseridas)
    const stakeTotal = isMultiCurrency ? 0 : realStakes.reduce((a, b) => a + b, 0);
    
    // Calcular cenários por perna
    // CORREÇÃO: Usar realStakes para cálculo de lucro (stakes reais inseridas pelo usuário)
    const scenarios: LegScenario[] = parsedOdds.map((odd, i) => {
      const stakeNesseLado = realStakes[i]; // Stake REAL inserida pelo usuário
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
  }, [odds, directedProfitLegs, numPernas, directedStakes, bookmakerSaldos, getOddMediaPerna, getStakeTotalPerna]);

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
