import type { SurebetEngineAnalysis } from "@/utils/surebetCurrencyEngine";
import type { TraceStep } from "@/engine/calculationTrace";

declare global {
  interface Window {
    __CALC_DEBUG__?: {
      lastCalculation: (SurebetEngineAnalysis & { traceId?: string }) | null;
      traces: Array<{
        id: string;
        steps: TraceStep[];
        timestamp: number;
      }>;
      hydrationState: Record<string, any>;
      dependencyGraph: Record<string, any>;
      exportSnapshot: () => string;
    };
  }
}
