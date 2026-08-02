import { CalculationTrace } from "./calculationTrace";
import { 
  type EngineLeg, 
  type SurebetEngineConfig, 
  type SurebetEngineAnalysis,
  analisarArbitragem,
  calcularStakesEqualizadasMultiCurrency,
  calcularStakesDirecionadas
} from "@/utils/surebetCurrencyEngine";

export interface SurebetPipelineInput {
  legs: EngineLeg[];
  config: SurebetEngineConfig;
  numPernasEsperado: number;
  arredondarFn: (v: number) => number;
  directedProfitLegs?: number[];
  refIndex?: number;
  equalizedStakesSnapshot?: number[];
}

/**
 * Orquestrador determinístico do pipeline de cálculo de Surebet.
 */
export function runSurebetPipeline(
  input: SurebetPipelineInput,
  trace?: CalculationTrace
): SurebetEngineAnalysis {
  const pipelineTrace = trace?.child("run_surebet_pipeline", {
    inputs: { ...input, arredondarFn: undefined }
  });

  // 1. Currency Normalization & Equalization
  const equalizationResult = calcularStakesEqualizadasMultiCurrency(
    input.legs,
    input.config,
    input.arredondarFn,
    pipelineTrace // Pass trace into engine
  );

  // 1b. Direcionamento de lucro (coluna "D"): quando apenas parte das pernas
  // está marcada, o excedente é concentrado nelas e as demais ficam em break-even.
  let stakesEfetivas = equalizationResult.stakesLocal;
  const directedLegs = input.directedProfitLegs ?? [];
  const refIndex = input.refIndex ?? input.legs.findIndex(l => l.isReference);
  if (directedLegs.length > 0 && directedLegs.length < input.legs.length) {
    const directedResult = calcularStakesDirecionadas(
      input.legs,
      input.config,
      directedLegs,
      refIndex,
      input.arredondarFn,
      pipelineTrace
    );
    if (directedResult.isValid) {
      stakesEfetivas = directedResult.stakesLocal;
    }
  }

  // 2. Analisar Arbitragem baseada nas stakes reais/equalizadas
  const analysis = analisarArbitragem(
    input.legs,
    stakesEfetivas,
    input.config,
    input.numPernasEsperado,
    pipelineTrace // Pass trace into engine
  );

  pipelineTrace?.finalize({
    stakeTotal: analysis.stakeTotal,
    minLucro: analysis.minLucro,
    roi: analysis.minRoi,
    isValid: analysis.isValidArbitrage
  });

  return analysis;
}
