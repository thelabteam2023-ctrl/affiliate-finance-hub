/**
 * Calculation Trace Engine — Rastreamento determinístico de operações matemáticas.
 */

export interface TraceStep {
  id: string;
  parentId?: string;
  step: string;
  inputs: Record<string, any>;
  outputs: Record<string, any>;
  currencyIn?: string;
  currencyOut?: string;
  rate?: number;
  formula?: string;
  rounded?: boolean;
  precisionLoss?: number;
  deps?: string[];
  timestamp: number;
}

export class CalculationTrace {
  private steps: TraceStep[] = [];
  private currentParentId?: string;
  private enabled: boolean;

  constructor(enabled = true) {
    this.enabled = enabled;
  }

  step(name: string, data: Partial<Omit<TraceStep, 'id' | 'step' | 'timestamp'>>): string {
    if (!this.enabled) return '';

    const id = crypto.randomUUID();
    this.steps.push({
      id,
      parentId: data.parentId || this.currentParentId,
      step: name,
      inputs: data.inputs || {},
      outputs: data.outputs || {},
      ...data,
      timestamp: performance.now(),
    } as TraceStep);
    return id;
  }

  child(name: string, data: Partial<Omit<TraceStep, 'id' | 'step' | 'timestamp'>> = {}): CalculationTrace {
    const childTrace = new CalculationTrace(this.enabled);
    const parentId = this.step(name, { ...data, outputs: { status: 'started' } });
    childTrace.currentParentId = parentId;
    childTrace.steps = this.steps; // Shared reference for flat collection
    return childTrace;
  }

  finalize(outputs: Record<string, any> = { status: 'completed' }) {
    if (this.currentParentId) {
      const parentStep = this.steps.find(s => s.id === this.currentParentId);
      if (parentStep) {
        parentStep.outputs = { ...parentStep.outputs, ...outputs };
      }
    }
  }

  getSteps(): TraceStep[] {
    return [...this.steps];
  }

  exportSnapshot() {
    return JSON.stringify(this.steps, null, 2);
  }
}

// Global bridge for IA and debugging
declare global {
  interface Window {
    __CALC_DEBUG__?: {
      enabled: boolean;
      lastCalculation?: any;
      hydrationState?: any;
      currencyPipeline?: any;
      dependencyGraph?: any;
      traces: TraceStep[][];
      getTrace: (index: number) => TraceStep[];
      exportLastTrace: () => string;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__CALC_DEBUG__ = {
    enabled: true,
    traces: [],
    getTrace: (idx) => window.__CALC_DEBUG__?.traces[idx] || [],
    exportLastTrace: () => {
      const last = window.__CALC_DEBUG__?.traces[window.__CALC_DEBUG__?.traces.length - 1];
      return JSON.stringify(last, null, 2);
    }
  };
}
