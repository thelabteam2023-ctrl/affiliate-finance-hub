import { describe, it, expect, vi } from "vitest";
import { 
  expandLegsWithSubEntries, 
  generateLiquidationOptions 
} from "@/utils/surebetLiquidationUtils";
import { validateBalanceForOperation } from "@/utils/surebetBalanceValidator";
import { liquidationQueue } from "@/utils/surebetLiquidationQueue";

describe("Surebet FinancialHardening - Autônomo", () => {
  const mockPernas = [
    { 
      id: 'l1', 
      bookmaker_id: 'bk1',
      bookmaker_nome: 'HUGEWIN', 
      odd: 3, 
      stake: 100, 
      moeda: 'USD',
      selecao: 'Casa'
    },
    {
      id: 'l2', 
      bookmaker_id: 'bk2',
      bookmaker_nome: 'AMUNRA', 
      odd: 3, 
      moeda: 'USD',
      selecao: 'Empate',
      entries: [
        { id: 'l2_sub_0', bookmaker_id: 'bk2', bookmaker_nome: 'AMUNRA', stake: 74, moeda: 'USD', odd: 3 },
        { id: 'l2_sub_1', bookmaker_id: 'bk3', bookmaker_nome: 'ALAWIN', stake: 450, moeda: 'MXN', odd: 3 },
      ]
    },
    { 
      id: 'l3', 
      bookmaker_id: 'bk4',
      bookmaker_nome: 'MY EMPIRE', 
      odd: 3, 
      stake: 100, 
      moeda: 'USD',
      selecao: 'Fora'
    },
  ] as any[];

  it("L1: Sub-entradas devem aparecer nas opções de liquidação", () => {
    const options = generateLiquidationOptions(mockPernas);
    const labels = options.singleWin.map(o => o.label);
    
    expect(options.singleWin).toHaveLength(4);
    expect(labels).toContain('ALAWIN Win');
    expect(labels).toContain('AMUNRA Win');
    
    const doubleLabels = options.doubleGreen.map(o => o.label);
    expect(doubleLabels.some(l => l.includes('ALAWIN'))).toBe(true);
  });

  it("L2: Saldo insuficiente deve ser detectado por sub-entrada", () => {
    const balances = {
      'bk1': { amount: 200, currency: 'USD' },
      'bk2': { amount: 26, currency: 'USD' }, // $74 necessário
      'bk3': { amount: 1003.50, currency: 'MXN' },
      'bk4': { amount: 100, currency: 'USD' },
    };

    const result = validateBalanceForOperation(mockPernas, balances);
    expect(result.valid).toBe(false);
    const amunraErr = result.errors.find(e => e.bookmakerId === 'bk2');
    expect(amunraErr).toBeDefined();
    expect(amunraErr?.deficit).toBe(48); // 74 - 26
  });

  it("L3: Race condition - fila processa ações serialmente", async () => {
    const executionOrder: string[] = [];
    const mockAction = async (action: any) => {
      await new Promise(r => setTimeout(r, 10));
      executionOrder.push(action.entryId);
    };

    liquidationQueue.enqueue({ operationId: 'op1', entryId: 'l1', result: 'GREEN' });
    liquidationQueue.enqueue({ operationId: 'op1', entryId: 'l2_sub_0', result: 'RED' });
    
    await liquidationQueue.flush(mockAction);
    
    expect(executionOrder).toEqual(['l1', 'l2_sub_0']);
  });

  it("L4: Edição de stake deve considerar crédito virtual", () => {
    const originalStakes = { 'bk2': 74 };
    const balances = { 'bk2': { amount: 26, currency: 'USD' } }; // Disponível real: 26
    
    // Editar para 90: (26 atual + 74 original) = 100 virtual >= 90 -> OK
    const resultValid = validateBalanceForOperation(mockPernas, balances, true, originalStakes);
    expect(resultValid.valid).toBe(true);

    // Editar para 110: 100 virtual < 110 -> FAIL
    const mockPernasHigh = JSON.parse(JSON.stringify(mockPernas));
    mockPernasHigh[1].entries[0].stake = 110;
    const resultInvalid = validateBalanceForOperation(mockPernasHigh, balances, true, originalStakes);
    expect(resultInvalid.valid).toBe(false);
  });
});
