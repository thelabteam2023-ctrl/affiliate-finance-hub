/**
 * CalculationTrace — Motor de rastreabilidade matemática
 * Permite auditar cada passo de um cálculo financeiro complexo.
 */

export interface TraceStep {
  id: string;
  parentId?: string;
  step: string;
  inputs: any;
  outputs: any;
  formula?: string;
  currencyIn?: string;
  currencyOut?: string;
  rate?: number;
  rounded?: boolean;
  precisionLoss?: number;
  timestamp: number;
}

export class CalculationTrace {
  private steps: TraceStep[] = [];
  private id: string;
  private parentId?: string;
  private enabled: boolean;

  constructor(enabled = true, id = Math.random().toString(36).substring(7), parentId?: string) {
    this.enabled = enabled;
    this.id = id;
    this.parentId = parentId;
  }

  step(name: string, data: Omit<TraceStep, 'id' | 'step' | 'timestamp' | 'parentId'>) {
    if (!this.enabled) return;
    
    this.steps.push({
      id: this.id,
      parentId: this.parentId,
      step: name,
      timestamp: Date.now(),
      ...data
    });
  }

  child(name: string, data?: any): CalculationTrace {
    const childId = `${this.id}-${name}-${Math.random().toString(36).substring(7)}`;
    if (this.enabled) {
      this.step(`child_start:${name}`, { inputs: data, outputs: { childId } });
    }
    return new CalculationTrace(this.enabled, childId, this.id);
  }

  finalize(outputs: any) {
    if (!this.enabled) return;
    this.step('finalize', { inputs: null, outputs });
  }

  getSteps(): TraceStep[] {
    return this.steps;
  }

  getId(): string {
    return this.id;
  }
}
