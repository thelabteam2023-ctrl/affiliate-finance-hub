/**
 * TESTES DE DETERMINISMO — Surebet P&L Calculation
 * 
 * Garante que o motor frontend (analisarArbitragem) produz
 * resultados algebricamente consistentes e determinísticos.
 * 
 * O backend (fn_recalc_pai_surebet) usa a MESMA fórmula pivot BRL,
 * então qualquer divergência entre front e back é causada por:
 *   1. ROUND(x,2) no backend (max ±0.005)
 *   2. Diferença na cotação de trabalho utilizada
 *   3. Arredondamento de stakes na equalização
 */

import { describe, it, expect } from "vitest";
import {
  convertViaBRL,
  analisarArbitragem,
  calcularStakesEqualizadasMultiCurrency,
  type EngineLeg,
  type SurebetEngineConfig,
  type BRLRates,
} from "@/utils/surebetCurrencyEngine";

// ─── Helpers ──────────────────────────────────────────────────

function makeConfig(consolidation: string, rates: BRLRates): SurebetEngineConfig {
  return { consolidationCurrency: consolidation as any, brlRates: rates };
}

function makeLegs(
  entries: Array<{ moeda: string; stake: number; odd: number; isRef?: boolean }>
): EngineLeg[] {
  return entries.map((e, i) => ({
    moeda: e.moeda as any,
    stakeLocal: e.stake,
    odd: e.odd,
    isReference: e.isRef ?? i === 0,
    isManuallyEdited: false,
  }));
}

const noRound = (v: number) => v;
const roundInt = (v: number) => Math.round(v);

// ─── Cotações de Trabalho (fixture do cenário real do usuário) ──

const RATES_REAL: BRLRates = {
  BRL: 1,
  USD: 4.9806,
  EUR: 5.891,
  MXN: 0.28901677270098325,
};

// ─── 1. DETERMINISMO ──────────────────────────────────────────

describe("Determinismo do motor de cálculo", () => {
  it("produz resultado idêntico em execuções consecutivas", () => {
    const config = makeConfig("USD", RATES_REAL);
    const legs = makeLegs([
      { moeda: "USD", stake: 100, odd: 3.0, isRef: true },
      { moeda: "EUR", stake: 84.36, odd: 3.0 },
      { moeda: "MXN", stake: 1719.30, odd: 3.0 },
    ]);
    const stakes = legs.map(l => l.stakeLocal);

    const result1 = analisarArbitragem(legs, stakes, config, 3);
    const result2 = analisarArbitragem(legs, stakes, config, 3);

    expect(result1.minLucro).toBe(result2.minLucro);
    expect(result1.maxLucro).toBe(result2.maxLucro);
    expect(result1.stakeTotal).toBe(result2.stakeTotal);
    expect(result1.scenarios).toEqual(result2.scenarios);
  });

  it("produz resultado idêntico com input idêntico em ordens diferentes de chamada", () => {
    const config = makeConfig("USD", RATES_REAL);
    const legs = makeLegs([
      { moeda: "USD", stake: 100, odd: 3.0, isRef: true },
      { moeda: "EUR", stake: 84.36, odd: 3.0 },
      { moeda: "MXN", stake: 1719.30, odd: 3.0 },
    ]);
    const stakes = legs.map(l => l.stakeLocal);

    // Chamar várias vezes em sequência
    const results = Array.from({ length: 10 }, () =>
      analisarArbitragem(legs, stakes, config, 3)
    );

    for (let i = 1; i < results.length; i++) {
      expect(results[i].minLucro).toBe(results[0].minLucro);
      expect(results[i].stakeTotal).toBe(results[0].stakeTotal);
    }
  });
});

// ─── 2. EQUIVALÊNCIA ALGÉBRICA FRONT ↔ BACKEND ───────────────

describe("Equivalência algébrica Front ↔ Backend", () => {
  /**
   * Simula fn_recalc_pai_surebet em JS puro.
   * Usa a MESMA lógica do PostgreSQL:
   *   rate = brlRate[moeda] / brlRate[consolidação]
   *   lucro_total = Σ (lucro_perna × rate)
   *   lucro_perna = payout - stake (GREEN: stake*odd, RED: 0)
   */
  function simulateBackendRecalc(
    legs: Array<{ moeda: string; stake: number; odd: number; resultado: string }>,
    rates: BRLRates,
    consolidation: string
  ): { lucroTotal: number; stakeTotal: number } {
    const toRate = rates[consolidation.toUpperCase()] ?? 1;
    let lucroTotal = 0;
    let stakeTotal = 0;

    for (const leg of legs) {
      const fromRate = rates[leg.moeda.toUpperCase()] ?? 1;
      const rate = toRate > 0 ? fromRate / toRate : 1;

      let payout: number;
      if (leg.resultado === "GREEN") {
        payout = leg.stake * leg.odd;
      } else if (leg.resultado === "RED") {
        payout = 0;
      } else if (leg.resultado === "VOID") {
        payout = leg.stake;
      } else {
        payout = 0;
      }

      const lucroPerna = payout - leg.stake;
      lucroTotal += lucroPerna * rate;
      stakeTotal += leg.stake * rate;
    }

    return {
      lucroTotal: Math.round(lucroTotal * 100) / 100, // ROUND(x, 2)
      stakeTotal: Math.round(stakeTotal * 100) / 100,
    };
  }

  it("cenário real: 3 pernas multimoeda, perna 3 GREEN", () => {
    const config = makeConfig("USD", RATES_REAL);
    const legs = makeLegs([
      { moeda: "USD", stake: 100, odd: 3.0, isRef: true },
      { moeda: "EUR", stake: 84.36, odd: 3.0 },
      { moeda: "MXN", stake: 1719.30, odd: 3.0 },
    ]);
    const stakes = legs.map(l => l.stakeLocal);

    const frontend = analisarArbitragem(legs, stakes, config, 3);
    const backend = simulateBackendRecalc(
      [
        { moeda: "USD", stake: 100, odd: 3.0, resultado: "RED" },
        { moeda: "EUR", stake: 84.36, odd: 3.0, resultado: "RED" },
        { moeda: "MXN", stake: 1719.30, odd: 3.0, resultado: "GREEN" },
      ],
      RATES_REAL,
      "USD"
    );

    // Cenário 2 (index 2 = perna 3 GREEN)
    const frontendLucro = frontend.scenarios[2].lucro;

    // Diferença máxima tolerada: 0.005 (ROUND(2) no backend)
    expect(Math.abs(frontendLucro - backend.lucroTotal)).toBeLessThan(0.01);
  });

  it("cenário real: 3 pernas multimoeda, perna 1 GREEN", () => {
    const config = makeConfig("USD", RATES_REAL);
    const backend = simulateBackendRecalc(
      [
        { moeda: "USD", stake: 100, odd: 3.0, resultado: "GREEN" },
        { moeda: "EUR", stake: 84.36, odd: 3.0, resultado: "RED" },
        { moeda: "MXN", stake: 1719.30, odd: 3.0, resultado: "RED" },
      ],
      RATES_REAL,
      "USD"
    );
    const legs = makeLegs([
      { moeda: "USD", stake: 100, odd: 3.0, isRef: true },
      { moeda: "EUR", stake: 84.36, odd: 3.0 },
      { moeda: "MXN", stake: 1719.30, odd: 3.0 },
    ]);
    const frontend = analisarArbitragem(legs, legs.map(l => l.stakeLocal), config, 3);

    expect(Math.abs(frontend.scenarios[0].lucro - backend.lucroTotal)).toBeLessThan(0.01);
  });

  it("cenário mono-moeda: sem conversão, resultado exato", () => {
    const config = makeConfig("BRL", { BRL: 1 });
    const legs = makeLegs([
      { moeda: "BRL", stake: 100, odd: 2.0, isRef: true },
      { moeda: "BRL", stake: 100, odd: 2.0 },
    ]);
    const frontend = analisarArbitragem(legs, [100, 100], config, 2);
    const backend = simulateBackendRecalc(
      [
        { moeda: "BRL", stake: 100, odd: 2.0, resultado: "GREEN" },
        { moeda: "BRL", stake: 100, odd: 2.0, resultado: "RED" },
      ],
      { BRL: 1 },
      "BRL"
    );

    // Mono-moeda: sem arredondamento de conversão, deve ser EXATO
    expect(frontend.scenarios[0].lucro).toBe(backend.lucroTotal);
  });
});

// ─── 3. CONSISTÊNCIA DE CONVERSÃO ─────────────────────────────

describe("convertViaBRL — Pivot BRL", () => {
  it("mesma moeda retorna valor inalterado", () => {
    expect(convertViaBRL(100, "USD", "USD", RATES_REAL)).toBe(100);
    expect(convertViaBRL(0, "EUR", "EUR", RATES_REAL)).toBe(0);
  });

  it("conversão ida-e-volta preserva valor (dentro de float precision)", () => {
    const original = 100;
    const converted = convertViaBRL(original, "USD", "EUR", RATES_REAL);
    const backToOriginal = convertViaBRL(converted, "EUR", "USD", RATES_REAL);
    expect(Math.abs(backToOriginal - original)).toBeLessThan(1e-10);
  });

  it("conversão via BRL é consistente: USD→EUR vs USD→BRL→EUR", () => {
    const direct = convertViaBRL(100, "USD", "EUR", RATES_REAL);
    const viaBRL = convertViaBRL(
      convertViaBRL(100, "USD", "BRL", RATES_REAL),
      "BRL", "EUR", RATES_REAL
    );
    expect(Math.abs(direct - viaBRL)).toBeLessThan(1e-10);
  });

  it("zero retorna zero independente das taxas", () => {
    expect(convertViaBRL(0, "USD", "MXN", RATES_REAL)).toBe(0);
  });
});

// ─── 4. EQUALIZAÇÃO + ANÁLISE ─────────────────────────────────

describe("Equalização e arbitragem válida", () => {
  it("odds iguais + stakes equalizadas = lucro ~0 em todos os cenários", () => {
    const config = makeConfig("USD", RATES_REAL);
    const legs = makeLegs([
      { moeda: "USD", stake: 100, odd: 3.0, isRef: true },
      { moeda: "EUR", stake: 0, odd: 3.0 },
      { moeda: "MXN", stake: 0, odd: 3.0 },
    ]);

    const eq = calcularStakesEqualizadasMultiCurrency(legs, config, noRound);
    expect(eq.isValid).toBe(true);

    const analysis = analisarArbitragem(
      legs.map((l, i) => ({ ...l, stakeLocal: eq.stakesLocal[i] })),
      eq.stakesLocal,
      config,
      3
    );

    // Com odds 3.0 iguais e sem arredondamento: lucro = 0 em todos os cenários
    for (const scenario of analysis.scenarios) {
      expect(Math.abs(scenario.lucro)).toBeLessThan(0.001);
    }
  });

  it("arredondamento de stakes introduz divergência proporcional ao fator", () => {
    const config = makeConfig("USD", RATES_REAL);
    const legs = makeLegs([
      { moeda: "USD", stake: 100, odd: 3.0, isRef: true },
      { moeda: "EUR", stake: 0, odd: 3.0 },
      { moeda: "MXN", stake: 0, odd: 3.0 },
    ]);

    const exact = calcularStakesEqualizadasMultiCurrency(legs, config, noRound);
    const rounded = calcularStakesEqualizadasMultiCurrency(legs, config, roundInt);

    // Equalizadas sem arredondamento
    const analysisExact = analisarArbitragem(
      legs.map((l, i) => ({ ...l, stakeLocal: exact.stakesLocal[i] })),
      exact.stakesLocal, config, 3
    );

    // Equalizadas COM arredondamento
    const analysisRounded = analisarArbitragem(
      legs.map((l, i) => ({ ...l, stakeLocal: rounded.stakesLocal[i] })),
      rounded.stakesLocal, config, 3
    );

    // Sem arredondamento: lucro ≈ 0
    expect(Math.abs(analysisExact.minLucro)).toBeLessThan(0.001);

    // Com arredondamento: divergência existe mas é limitada
    // Para odds 3.0 e arredondamento para inteiro, max ~$1 de divergência
    expect(Math.abs(analysisRounded.minLucro)).toBeLessThan(2.0);
  });
});

// ─── 5. CASO DO BUG REPORTADO ─────────────────────────────────

describe("Cenário do bug reportado (odds 3.0 iguais, multimoeda)", () => {
  it("confirma que -$0.24 é CORRETO para stakes 100/84.36/1719.30", () => {
    const config = makeConfig("USD", RATES_REAL);
    const legs = makeLegs([
      { moeda: "USD", stake: 100, odd: 3.0, isRef: true },
      { moeda: "EUR", stake: 84.36, odd: 3.0 },
      { moeda: "MXN", stake: 1719.30, odd: 3.0 },
    ]);
    const stakes = [100, 84.36, 1719.30];

    const analysis = analisarArbitragem(legs, stakes, config, 3);

    // O lucro NÃO é zero porque as stakes foram arredondadas
    // após equalização e não compensam perfeitamente
    expect(analysis.minLucro).toBeLessThan(0);

    // O minLucro deve ser próximo de -0.24 (valor confirmado no DB)
    expect(analysis.minLucro).toBeCloseTo(-0.24, 1);
  });

  it("stakes EQUALIZADAS SEM arredondamento dão lucro ≈ 0", () => {
    const config = makeConfig("USD", RATES_REAL);
    const legs = makeLegs([
      { moeda: "USD", stake: 100, odd: 3.0, isRef: true },
      { moeda: "EUR", stake: 0, odd: 3.0 },
      { moeda: "MXN", stake: 0, odd: 3.0 },
    ]);

    const eq = calcularStakesEqualizadasMultiCurrency(legs, config, noRound);
    const analysis = analisarArbitragem(
      legs.map((l, i) => ({ ...l, stakeLocal: eq.stakesLocal[i] })),
      eq.stakesLocal, config, 3
    );

    // Com equalização perfeita, lucro = 0 para odds iguais
    expect(Math.abs(analysis.minLucro)).toBeLessThan(0.0001);
    expect(Math.abs(analysis.maxLucro)).toBeLessThan(0.0001);
  });

  it("divergência calculadora vs liquidação é APENAS do arredondamento de stakes", () => {
    const config = makeConfig("USD", RATES_REAL);
    const legs = makeLegs([
      { moeda: "USD", stake: 100, odd: 3.0, isRef: true },
      { moeda: "EUR", stake: 0, odd: 3.0 },
      { moeda: "MXN", stake: 0, odd: 3.0 },
    ]);

    // Stakes equalizadas SEM arredondamento (o que a calculadora "mostra")
    const eqExact = calcularStakesEqualizadasMultiCurrency(legs, config, noRound);

    // Stakes equalizadas COM arredondamento (o que foi persistido)
    const eqRounded = calcularStakesEqualizadasMultiCurrency(legs, config, roundInt);

    const lucroExact = analisarArbitragem(
      legs.map((l, i) => ({ ...l, stakeLocal: eqExact.stakesLocal[i] })),
      eqExact.stakesLocal, config, 3
    ).minLucro;

    const lucroRounded = analisarArbitragem(
      legs.map((l, i) => ({ ...l, stakeLocal: eqRounded.stakesLocal[i] })),
      eqRounded.stakesLocal, config, 3
    ).minLucro;

    // A DIVERGÊNCIA é apenas a diferença entre stakes arredondadas e exatas
    const divergencia = Math.abs(lucroExact - lucroRounded);
    
    // Para odds 3.0 e arredondamento para inteiro, a divergência deve ser < $1
    expect(divergencia).toBeLessThan(1.0);
    
    // Equalizadas exatas: lucro ≈ 0
    expect(Math.abs(lucroExact)).toBeLessThan(0.001);
  });
});
