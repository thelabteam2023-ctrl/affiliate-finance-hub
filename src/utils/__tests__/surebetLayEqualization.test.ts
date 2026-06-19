import { describe, expect, it } from "vitest";
import {
  analisarArbitragem,
  calcularStakesEqualizadasMultiCurrency,
  type BRLRates,
  type EngineLeg,
  type SurebetEngineConfig,
} from "@/utils/surebetCurrencyEngine";

const config: SurebetEngineConfig = {
  consolidationCurrency: "BRL" as any,
  brlRates: { BRL: 1 } satisfies BRLRates,
};

describe("Surebet lay equalization", () => {
  it("equaliza o caso referência back 100 @2.00 contra lay @2.00 com 2,8%", () => {
    const legs: EngineLeg[] = [
      { moeda: "BRL" as any, stakeLocal: 100, odd: 2, isReference: true, tipo: "back", comissao: 0 },
      { moeda: "BRL" as any, stakeLocal: 100, odd: 2, isReference: false, tipo: "lay", comissao: 0.028 },
    ];

    const equalized = calcularStakesEqualizadasMultiCurrency(legs, config, (value) => value);
    expect(equalized.stakesLocal[1]).toBeCloseTo(101.42, 2);

    const analysis = analisarArbitragem(legs, equalized.stakesLocal, config, 2);
    expect(analysis.scenarios[0].lucro).toBeCloseTo(-1.42, 2);
    expect(analysis.scenarios[1].lucro).toBeCloseTo(-1.42, 2);
    expect(analysis.maxLucro - analysis.minLucro).toBeLessThan(0.01);
    expect(analysis.exposicaoTotal).toBeCloseTo(201.42, 2);
  });

  it("mantém regressão do caminho 100% back sem alterar a fórmula existente", () => {
    const legs: EngineLeg[] = [
      { moeda: "BRL" as any, stakeLocal: 100, odd: 2, isReference: true, tipo: "back", comissao: 0 },
      { moeda: "BRL" as any, stakeLocal: 100, odd: 2, isReference: false, tipo: "back", comissao: 0 },
    ];

    const equalized = calcularStakesEqualizadasMultiCurrency(legs, config, (value) => value);
    expect(equalized.stakesLocal).toEqual([100, 100]);

    const analysis = analisarArbitragem(legs, equalized.stakesLocal, config, 2);
    expect(analysis.minLucro).toBeCloseTo(0, 5);
    expect(analysis.maxLucro).toBeCloseTo(0, 5);
    expect(analysis.minRoi).toBeCloseTo(0, 5);
    expect(analysis.exposicaoTotal).toBeCloseTo(200, 5);
  });
});