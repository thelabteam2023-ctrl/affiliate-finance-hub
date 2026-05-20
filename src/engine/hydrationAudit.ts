import { CalculationTrace } from "./calculationTrace";

export type DataSource = "user" | "draft" | "print" | "db" | "recalc" | "initial";

export interface HydrationAuditState {
  source: DataSource;
  timestamp: number;
  driftPct?: number;
  originalValue?: number;
  currentValue?: number;
}

/**
 * Auditoria de Hidratação — Rastreia a origem dos dados e detecta divergências.
 */
export class HydrationAudit {
  static mark(obj: any, source: DataSource, data: Partial<HydrationAuditState> = {}) {
    if (!obj || typeof obj !== 'object') return;
    
    obj.__hydrationAudit = {
      source,
      timestamp: Date.now(),
      ...data
    };
  }

  static get(obj: any): HydrationAuditState | undefined {
    return obj?.__hydrationAudit;
  }

  static checkDrift(
    obj: any, 
    currentValue: number, 
    threshold = 0.005,
    trace?: CalculationTrace
  ) {
    const state = this.get(obj);
    if (!state || state.originalValue === undefined) return;

    const drift = Math.abs(currentValue - state.originalValue);
    const driftPct = state.originalValue !== 0 ? (drift / state.originalValue) * 100 : 0;

    if (driftPct > threshold) {
      trace?.step("hydration_drift_detected", {
        inputs: { 
          source: state.source, 
          original: state.originalValue, 
          current: currentValue 
        },
        outputs: { driftPct, threshold },
        formula: "abs(current - original) / original * 100"
      });
      
      state.driftPct = driftPct;
      state.currentValue = currentValue;
    }
  }
}
