import { describe, expect, it } from "vitest";
import { avaliarVariacaoSaldo, isErroSaldoInsuficiente } from "@/lib/ledger/saldoGuard";

describe("saldoGuard", () => {
  it("recusa débito acima do saldo real", () => {
    const r = avaliarVariacaoSaldo(100, -150, "REAL", "BET365", "BRL");
    expect(r.permitido).toBe(false);
    expect(r.motivo).toContain("SALDO_INSUFICIENTE");
    expect(r.motivo).toContain("saldo real");
  });

  it("recusa uso de freebet acima do estoque", () => {
    const r = avaliarVariacaoSaldo(50, -80, "FREEBET", "BETANO", "BRL");
    expect(r.permitido).toBe(false);
    expect(r.motivo).toContain("freebet");
  });

  it("permite débito exatamente igual ao saldo", () => {
    expect(avaliarVariacaoSaldo(559, -559).permitido).toBe(true);
  });

  it("permite crédito em casa já negativa", () => {
    const r = avaliarVariacaoSaldo(-2834.52, 1000);
    expect(r.permitido).toBe(true);
    expect(r.saldoResultante).toBeCloseTo(-1834.52, 2);
  });

  it("recusa agravar casa já negativa", () => {
    expect(avaliarVariacaoSaldo(-100, -10).permitido).toBe(false);
  });

  it("tolera diferença de um centavo por arredondamento", () => {
    expect(avaliarVariacaoSaldo(100, -100.005).permitido).toBe(true);
  });

  it("simula saques concorrentes: o segundo é recusado", () => {
    const saldo = 559;
    const primeiro = avaliarVariacaoSaldo(saldo, -559);
    expect(primeiro.permitido).toBe(true);
    const segundo = avaliarVariacaoSaldo(primeiro.saldoResultante, -559);
    expect(segundo.permitido).toBe(false);
  });

  it("reconhece a mensagem de recusa vinda do banco", () => {
    expect(isErroSaldoInsuficiente("SALDO_INSUFICIENTE: HAPPY SLOTS — saldo real...")).toBe(true);
    expect(isErroSaldoInsuficiente("outro erro")).toBe(false);
  });
});
