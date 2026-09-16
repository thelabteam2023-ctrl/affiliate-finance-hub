import { describe, it, expect } from "vitest";
import { resolveValorConsolidado } from "../resolveValorConsolidado";

const TAXA_TRABALHO = 5.1537;
const TAXA_OPERACAO = 5.16272;

const convertBRL = (valor: number, moeda: string) => {
  const m = moeda.toUpperCase();
  if (m === "BRL") return valor;
  if (["USD", "USDT", "USDC"].includes(m)) return valor * TAXA_TRABALHO;
  return valor;
};

const convertUSD = (valor: number, moeda: string) => {
  const m = moeda.toUpperCase();
  if (["USD", "USDT", "USDC"].includes(m)) return valor;
  if (m === "BRL") return valor / TAXA_TRABALHO;
  return valor;
};

describe("resolveValorConsolidado — regra de ouro multimoeda", () => {
  it("BRL em projeto BRL: valor nativo, sem passar por USD", () => {
    const snapshotUsd = 2500 / TAXA_OPERACAO; // snapshot gravado no ledger
    const r = resolveValorConsolidado({
      valor: 2500,
      moeda: "BRL",
      snapshotUsd,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r).toBe(2500);
  });

  it("não sofre distorção BRL → USD → BRL (bug de 0,175%)", () => {
    const snapshotUsd = 5000 / TAXA_OPERACAO;
    const duplaConversao = convertBRL(snapshotUsd, "USD");
    expect(Math.abs(duplaConversao - 5000)).toBeGreaterThan(8); // o bug antigo

    const r = resolveValorConsolidado({
      valor: 5000,
      moeda: "BRL",
      snapshotUsd,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r).toBe(5000);
  });

  it("USD em projeto USD: valor nativo", () => {
    const r = resolveValorConsolidado({
      valor: 1000,
      moeda: "USD",
      snapshotUsd: 1000,
      moedaConsolidacao: "USD",
      convertToConsolidation: convertUSD,
    });
    expect(r).toBe(1000);
  });

  it("USDT em projeto USD: paridade, usa snapshot", () => {
    const r = resolveValorConsolidado({
      valor: 500,
      moeda: "USDT",
      snapshotUsd: 500,
      moedaConsolidacao: "USD",
      convertToConsolidation: convertUSD,
    });
    expect(r).toBe(500);
  });

  it("USD em projeto BRL: usa snapshot convertido pela Cotação de Trabalho", () => {
    const r = resolveValorConsolidado({
      valor: 1000,
      moeda: "USD",
      snapshotUsd: 1000,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r).toBeCloseTo(1000 * TAXA_TRABALHO, 4);
  });

  it("sem snapshot cai na Cotação de Trabalho", () => {
    const r = resolveValorConsolidado({
      valor: 200,
      moeda: "USD",
      snapshotUsd: null,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r).toBeCloseTo(200 * TAXA_TRABALHO, 4);
  });

  it("preserva o sinal em valores negativos (reversões)", () => {
    const r = resolveValorConsolidado({
      valor: -1000,
      moeda: "USD",
      snapshotUsd: 1000,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r).toBeCloseTo(-1000 * TAXA_TRABALHO, 4);
  });

  it("valor zero não gera ruído", () => {
    expect(
      resolveValorConsolidado({
        valor: 0,
        moeda: "USD",
        snapshotUsd: 10,
        moedaConsolidacao: "BRL",
        convertToConsolidation: convertBRL,
      })
    ).toBe(0);
  });
});
