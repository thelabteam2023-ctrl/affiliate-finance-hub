export type ExtractionMode = 'Equilibrado' | 'Cascata' | 'Cenário 3 Zero';
export type CapitalType = 'bonus' | 'real';

export interface ExtractionConfig {
  bonusAmount: number;
  spread: number;
  exchangeCommission: number;
  model: ExtractionMode;
  capitalType: CapitalType;
}

export interface SimulationParams {
  meta: number;
  nOps: number;
  oddMin: number;
  oddMaxDupla: number;
  nSims: number;
  initialBanca?: number;
}

export interface BancaParams {
  initialBanca: number;
  lucroDesejado: number;
  maxOps: number;
  nSims: number;
}

export interface PlannedOp {
  id: string;
  odd1: number;
  odd2: number;
  label?: string;
}

export interface StrategySequence {
  name: string;
  steps: PlannedOp[];
  initialBanca: number;
  targetProfit: number;
  stake: number;
}
