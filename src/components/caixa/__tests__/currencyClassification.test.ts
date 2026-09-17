import { describe, it, expect } from "vitest";
import {
  FIAT_CURRENCIES,
  CRYPTO_CURRENCIES,
  getCurrencyKind,
  isFiatCurrency,
  isUsdEquivalent,
  violatesSnapshotUmParaUm,
} from "@/types/currency";

/**
 * Regressão do bug "saque cripto em MYR": a tela usava listas fixas de moedas
 * e o Ringgit ficava de fora, sendo tratado como cripto 1:1 com dólar.
 */
describe("classificação canônica de moedas", () => {
  it("toda moeda fiduciária suportada é classificada como FIAT", () => {
    for (const { value } of FIAT_CURRENCIES) {
      expect(getCurrencyKind(value), value).toBe("FIAT");
    }
  });

  it("toda cripto suportada é classificada como CRYPTO", () => {
    for (const { value } of CRYPTO_CURRENCIES) {
      expect(getCurrencyKind(value), value).toBe("CRYPTO");
    }
  });

  it("MYR é fiduciária (caso do bug)", () => {
    expect(isFiatCurrency("MYR")).toBe(true);
    expect(isFiatCurrency("myr")).toBe(true);
  });

  it("moeda desconhecida cai em FIAT (exige cotação, nunca 1:1 com dólar)", () => {
    expect(isFiatCurrency("XYZ")).toBe(true);
    expect(isFiatCurrency(null)).toBe(true);
  });

  it("apenas USD e stablecoins de dólar são equivalentes a dólar", () => {
    expect(isUsdEquivalent("USD")).toBe(true);
    expect(isUsdEquivalent("USDT")).toBe(true);
    expect(isUsdEquivalent("USDC")).toBe(true);
    expect(isUsdEquivalent("MYR")).toBe(false);
    expect(isUsdEquivalent("BTC")).toBe(false);
  });
});

describe("trava espelho de chk_snapshot_1_para_1_nao_stable", () => {
  const casos = ["MYR", "GBP", "ARS", "COP", "MXN", "EUR", "BRL"];

  it.each(casos)("bloqueia %s com cotação 1 e referência igual ao valor", (moeda) => {
    expect(
      violatesSnapshotUmParaUm({
        moeda,
        valor: 2000,
        valorUsdReferencia: 2000,
        cotacaoOrigemUsd: 1,
      }),
    ).toBe(true);
  });

  it("permite USD/USDT/USDC com cotação 1", () => {
    for (const moeda of ["USD", "USDT", "USDC"]) {
      expect(
        violatesSnapshotUmParaUm({
          moeda,
          valor: 2000,
          valorUsdReferencia: 2000,
          cotacaoOrigemUsd: 1,
        }),
      ).toBe(false);
    }
  });

  it("permite MYR com cotação correta (2.000 MYR ≈ US$ 488,83)", () => {
    expect(
      violatesSnapshotUmParaUm({
        moeda: "MYR",
        valor: 2000,
        valorUsdReferencia: 488.83,
        cotacaoOrigemUsd: 0.2444,
      }),
    ).toBe(false);
  });

  it("ignora valor zero ou campos ausentes", () => {
    expect(
      violatesSnapshotUmParaUm({ moeda: "MYR", valor: 0, valorUsdReferencia: 0, cotacaoOrigemUsd: 1 }),
    ).toBe(false);
    expect(
      violatesSnapshotUmParaUm({ moeda: "MYR", valor: 100, valorUsdReferencia: null, cotacaoOrigemUsd: 1 }),
    ).toBe(false);
  });
});
