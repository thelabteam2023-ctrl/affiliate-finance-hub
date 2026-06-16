import { describe, it, expect } from "vitest";
import { calcResultadoLiquido } from "../resultadoLiquido";

describe("calcResultadoLiquido", () => {
  it("subtrai custos do fluxo líquido positivo", () => {
    expect(calcResultadoLiquido(10_000, 5_000)).toBe(5_000);
  });

  it("retorna negativo quando custos > fluxo", () => {
    expect(calcResultadoLiquido(-2_000, 3_000)).toBe(-5_000);
  });

  it("retorna o fluxo intacto quando não há custos", () => {
    expect(calcResultadoLiquido(1_234.56, 0)).toBe(1_234.56);
  });

  it("tolera entradas nulas/undefined", () => {
    expect(calcResultadoLiquido(undefined as unknown as number, 100)).toBe(-100);
    expect(calcResultadoLiquido(100, undefined as unknown as number)).toBe(100);
  });
});