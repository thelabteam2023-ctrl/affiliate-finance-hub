import { CalculationTrace } from "./calculationTrace";
import { 
  type EngineLeg, 
  type SurebetEngineConfig, 
  type SurebetEngineAnalysis,
  analisarArbitragem,
  calcularStakesEqualizadasMultiCurrency
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

  // 2. Analisar Arbitragem baseada nas stakes reais/equalizadas
  const analysis = analisarArbitragem(
    input.legs,
    equalizationResult.stakesLocal,
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
