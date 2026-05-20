import { describe, it, expect } from "vitest";
import { 
  buildLiquidationLegs, 
  generateLiquidationOptions 
} from "@/utils/surebetLiquidationUtils";
import { liquidationQueue } from "@/utils/surebetLiquidationQueue";

describe("Surebet Liquidation Correction - Aggregated Legs", () => {
  const mockPernas = [
    { 
      id: 'l1', 
      bookmaker_id: 'bk1',
      bookmaker_nome: 'HUGEWIN', 
      odd: 3, 
      stake: 100, 
      moeda: 'USD',
      selecao: 'Casa',
      stake_brl_referencia: 510.00
    },
    {
      id: 'l2', 
      odd: 3, 
      moeda: 'USD',
      selecao: 'Empate',
      entries: [
        { id: 'l2_sub_0', bookmaker_id: 'bk2', bookmaker_nome: 'AMUNRA', stake: 74, moeda: 'USD', odd: 3, stake_brl_referencia: 377.40 },
        { id: 'l2_sub_1', bookmaker_id: 'bk3', bookmaker_nome: 'ALAWIN', stake: 450, moeda: 'MXN', odd: 3, stake_brl_referencia: 132.75 },
      ]
    },
    { 
      id: 'l3', 
      bookmaker_id: 'bk4',
      bookmaker_nome: 'MY EMPIRE', 
      odd: 3, 
      stake: 100, 
      moeda: 'USD',
      selecao: 'Fora',
      stake_brl_referencia: 510.00
    },
  ] as any[];

  it("L1: Menu tem 3 opções (uma por perna, não por casa)", () => {
    const options = generateLiquidationOptions(mockPernas);
    
    // 3 pernas no total
    expect(options.singleWin).toHaveLength(3);

    const labels = options.singleWin.map(o => o.label);
    expect(labels).not.toContain('AMUNRA Win');
    expect(labels).not.toContain('ALAWIN Win');

    // Perna 2 deve ser agregada
    const perna2Option = options.singleWin[1];
    expect(perna2Option.hasMultipleHouses).toBe(true);
    expect(perna2Option.houseCount).toBe(2);
    expect(perna2Option.houses.map(h => h.casa)).toContain('AMUNRA');
    expect(perna2Option.houses.map(h => h.casa)).toContain('ALAWIN');
  });

  it("L2: Duplo Green tem 3 opções (combinações de pernas)", () => {
    const options = generateLiquidationOptions(mockPernas);
    // C(3,2) = 3
    expect(options.doubleGreen).toHaveLength(3);
    
    // Nenhuma opção deve ter AMUNRA ou ALAWIN isolados no label
    const labels = options.doubleGreen.map(o => o.label);
    expect(labels.some(l => l === 'AMUNRA + ALAWIN')).toBe(false);
    expect(labels.some(l => l.includes('AMUNRA + HUGEWIN'))).toBe(false);
    
    // Perna 2 agregada aparece no label
    expect(labels[0]).toBe('HUGEWIN + AMUNRA + ALAWIN');
  });

  it("L5: P&L projetado correto para perna 2", () => {
    const options = generateLiquidationOptions(mockPernas);
    const perna2Option = options.singleWin[1];

    // Total investido: 510.00 + 377.40 + 132.75 + 510.00 = 1530.15
    // Retorno Perna 2: (377.40 + 132.75) * 3 = 510.15 * 3 = 1530.45
    // P&L: 1530.45 - 1530.15 = +0.30
    
    expect(perna2Option.pnl).toBeCloseTo(0.30, 2);
  });

  it("L6: Regressão - Perna simples não afetada", () => {
    const options = generateLiquidationOptions(mockPernas);
    const perna1Option = options.singleWin[0];
    
    expect(perna1Option.hasMultipleHouses).toBe(false);
    expect(perna1Option.houseCount).toBe(1);
    expect(perna1Option.label).toBe('HUGEWIN');
    
    // P&L Perna 1: 510.00 * 3 - 1530.15 = 1530.00 - 1530.15 = -0.15
    expect(perna1Option.pnl).toBeCloseTo(-0.15, 2);
  });

  it("L4: Ao liquidar perna 2, AMBAS as casas são liquidadas", async () => {
    const mockExecute = vi.fn().mockResolvedValue(undefined);
    
    // Simular clique na opção Perna 2
    const options = generateLiquidationOptions(mockPernas);
    const perna2Option = options.singleWin[1];
    
    // Enfileirar ações conforme lógica do componente
    for (const house of perna2Option.houses) {
      liquidationQueue.enqueue({
        operationId: 'op1',
        entryId: house.entryId,
        result: 'GREEN'
      });
    }

    expect(liquidationQueue.pendingCount).toBe(2);
    
    await liquidationQueue.flush(mockExecute);
    
    expect(mockExecute).toHaveBeenCalledTimes(2);
    expect(mockExecute).toHaveBeenNthCalledWith(1, expect.objectContaining({ entryId: 'l2_sub_0' }));
    expect(mockExecute).toHaveBeenNthCalledWith(2, expect.objectContaining({ entryId: 'l2_sub_1' }));
  });
});