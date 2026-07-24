import { describe, it, expect } from "vitest";
import { convertPernaToConsolidacao } from "@/lib/currency-conversion-snapshot";

/**
 * Guardrail — Auditoria de Stake (Todas as Apostas × Bônus).
 *
 * Garante que a hierarquia snapshot → trabalho → live está intacta e que
 * o mesmo valor de perna produz o mesmo consolidado, independentemente
 * de qual módulo (Todas as Apostas ou Bônus) esteja renderizando.
 */

describe("stake parity — convertPernaToConsolidacao", () => {
  const ctx = {
    moedaConsolidacao: "USD",
    convertToConsolidationFallback: (v: number, m: string) => {
      // fallback simulado (Cotação de Trabalho USD→BRL = 5.16)
      if (m === "BRL") return v / 5.16;
      return v;
    },
  };

  it("usa o snapshot da perna quando presente (BRL → USD)", () => {
    const out = convertPernaToConsolidacao(
      { valor: 759, moedaOrigem: "BRL", cotacaoSnapshot: 5.102 },
      ctx,
    );
    expect(out).toBeCloseTo(759 / 5.102, 4);
  });

  it("mantém USD → USD sem conversão", () => {
    const out = convertPernaToConsolidacao(
      { valor: 144.28, moedaOrigem: "USD", cotacaoSnapshot: 5.102 },
      ctx,
    );
    expect(out).toBe(144.28);
  });

  it("cai para o fallback quando não há snapshot", () => {
    const out = convertPernaToConsolidacao(
      { valor: 759, moedaOrigem: "BRL" },
      ctx,
    );
    expect(out).toBeCloseTo(759 / 5.16, 4);
  });

  it("BELGRANO x ROSARIO: 3 pernas mistas convergem ~404 USD", () => {
    const pernas = [
      { valor: 759, moedaOrigem: "BRL", cotacaoSnapshot: 5.102 },
      { valor: 144.28, moedaOrigem: "USD", cotacaoSnapshot: 5.102 },
      { valor: 111, moedaOrigem: "USD", cotacaoSnapshot: 5.102 },
    ];
    const total = pernas.reduce(
      (s, p) => s + convertPernaToConsolidacao(p, ctx),
      0,
    );
    // Esperado: 759/5.102 + 144.28 + 111 = ~404 USD (NÃO 1014 da soma naive).
    expect(total).toBeGreaterThan(400);
    expect(total).toBeLessThan(410);
  });
});