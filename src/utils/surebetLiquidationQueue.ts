/**
 * SurebetLiquidationQueue — Fila serial por operação para evitar race conditions.
 */

interface LiquidationAction {
  operationId: string;
  entryId: string;
  result: 'GREEN' | 'RED' | 'HALF_GREEN' | 'HALF_RED' | 'VOID';
  timestamp: number;
  calculationId: string;
}

class LiquidationQueue {
  private queue: LiquidationAction[] = [];
  private processing = false;
  public sessionId: string = Math.random().toString(36).substring(2, 15);

  /**
   * Enfileira uma ação de liquidação.
   */
  enqueue(action: Omit<LiquidationAction, 'calculationId' | 'timestamp'>) {
    this.queue.push({
      ...action,
      calculationId: this.sessionId,
      timestamp: Date.now(),
    });
    console.log(`[LiquidationQueue] Ação enfileirada para ${action.entryId}. Fila: ${this.queue.length}`);
  }

  /**
   * Processa a fila serialmente.
   */
  async flush(onAction: (action: LiquidationAction) => Promise<any>) {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const action = this.queue.shift()!;
      try {
        console.log(`[LiquidationQueue] Processando ${action.entryId}...`);
        await onAction(action);
      } catch (err) {
        console.error('[LiquidationQueue] Erro ao processar ação:', err);
        // Em caso de erro, opcionalmente recolocar na fila ou descartar.
        // Aqui optamos por descartar para não travar a fila indefinidamente.
      }
    }

    this.processing = false;
  }

  discardStale(currentSessionId: string) {
    this.queue = this.queue.filter(a => a.calculationId === currentSessionId);
  }

  get pendingCount() { return this.queue.length; }
  get isProcessing() { return this.processing; }
}

export const liquidationQueue = new LiquidationQueue();
