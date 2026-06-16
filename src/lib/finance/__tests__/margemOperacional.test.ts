import { describe, it, expect } from "vitest";
import { calcMargemOperacional } from "../margemOperacional";

describe("calcMargemOperacional", () => {
  it("retorna margem entre 0 e 100 quando fluxo e custo são positivos", () => {
    // 7000 / (7000 + 3000) = 70%
    expect(calcMargemOperacional(7000, 3000)).toBeCloseTo(70, 5);
  });

  it("retorna margem negativa quando fluxo é negativo (depósitos > saques)", () => {
    // -2000 / (-2000 + 5000) = -66.66...%
    expect(calcMargemOperacional(-2000, 5000)).toBeCloseTo(-66.6666, 3);
  });

  it("retorna 100 quando fluxo > 0 e custo = 0", () => {
    expect(calcMargemOperacional(5000, 0)).toBe(100);
  });

  it("retorna null quando fluxo + custo = 0 (sem base de comparação)", () => {
    expect(calcMargemOperacional(0, 0)).toBeNull();
  });

  it("retorna null quando denominador é negativo", () => {
    expect(calcMargemOperacional(-1000, 500)).toBeNull();
  });

  it("tolera entradas null/undefined", () => {
    expect(calcMargemOperacional(null, null)).toBeNull();
    expect(calcMargemOperacional(undefined, 100)).toBeCloseTo(0, 5);
  });
});