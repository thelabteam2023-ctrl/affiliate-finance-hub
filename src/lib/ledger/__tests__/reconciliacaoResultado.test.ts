import { describe, it, expect } from "vitest";
import { calcularReconciliacaoResultado } from "../reconciliacaoResultado";
import { classificarDiferencaConciliacao } from "../classificarDiferencaConciliacao";

const TAXA_TRABALHO = 5.1537;
const TAXA_OPERACAO = 5.16272;

const convertBRL = (valor: number, moeda: string) => {
  const m = moeda.toUpperCase();
  if (m === "BRL") return valor;
  if (["USD", "USDT", "USDC"].includes(m)) return valor * TAXA_TRABALHO;
  return valor;
};

describe("classificarDiferencaConciliacao", () => {
  it("mesma moeda → diferença de recebimento, não câmbio", () => {
    expect(
      classificarDiferencaConciliacao({ moeda: "USD", moedaContraparte: "USD" })
    ).toBe("DIFERENCA_RECEBIMENTO");
  });

  it("USD x USDT são paritários", () => {
    expect(
      classificarDiferencaConciliacao({ moeda: "USDT", moedaContraparte: "USD" })
    ).toBe("DIFERENCA_RECEBIMENTO");
  });

  it("moedas diferentes → resultado cambial", () => {
    expect(
      classificarDiferencaConciliacao({ moeda: "USD", moedaContraparte: "BRL" })
    ).toBe("RESULTADO_CAMBIAL");
  });
});

describe("calcularReconciliacaoResultado", () => {
  // Cenário real do projeto BONUS EVVERTON (consolidação BRL).
  const operacionalPorMoeda = { BRL: -1408, USD: 336.25 };
  const operacionalHistorico = -1408 + 336.25 * TAXA_OPERACAO; // 327,96

  it("reconcilia operacional + cambial + outros = realizado", () => {
    const r = calcularReconciliacaoResultado({
      operacionalHistorico,
      operacionalPorMoeda,
      eventosDiferenca: [
        { tipo_transacao: "GANHO_CAMBIAL", valor: 5, moeda: "USD", moedaContraparte: "USD" },
      ],
      saldosPorMoeda: [
        { moeda: "BRL", saldo: 0 },
        { moeda: "USD", saldo: 0 },
      ],
      lucroRealizadoFluxo:
        operacionalHistorico + 336.25 * (TAXA_TRABALHO - TAXA_OPERACAO) + 5 * TAXA_TRABALHO,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });

    expect(r.operacional).toBeCloseTo(327.96, 1);
    expect(r.cambialTotal).toBeCloseTo(-3.03, 2);
    expect(r.cambialNaoRealizado).toBeCloseTo(0, 6);
    expect(r.outrosFinanceiros).toBeCloseTo(25.77, 2);
    expect(r.lucroRealizado).toBeCloseTo(350.7, 1);
    expect(r.reconciliado).toBe(true);
    expect(Math.abs(r.residuo)).toBeLessThan(0.01);
  });

  it("os US$ 5 não são classificados como câmbio", () => {
    const r = calcularReconciliacaoResultado({
      operacionalHistorico: 0,
      operacionalPorMoeda: {},
      eventosDiferenca: [
        { tipo_transacao: "GANHO_CAMBIAL", valor: 5, moeda: "USD", moedaContraparte: "USD" },
      ],
      saldosPorMoeda: [],
      lucroRealizadoFluxo: 5 * TAXA_TRABALHO,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r.cambialTotal).toBeCloseTo(0, 6);
    expect(r.outrosFinanceiros).toBeCloseTo(25.77, 2);
  });

  it("diferença com troca real de moeda entra no cambial realizado", () => {
    const r = calcularReconciliacaoResultado({
      operacionalHistorico: 0,
      operacionalPorMoeda: {},
      eventosDiferenca: [
        { tipo_transacao: "PERDA_CAMBIAL", valor: 10, moeda: "USD", moedaContraparte: "BRL" },
      ],
      saldosPorMoeda: [],
      lucroRealizadoFluxo: -10 * TAXA_TRABALHO,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r.outrosFinanceiros).toBeCloseTo(0, 6);
    expect(r.cambialRealizado).toBeCloseTo(-10 * TAXA_TRABALHO, 4);
    expect(r.reconciliado).toBe(true);
  });

  it("operação 100% BRL não gera resultado cambial", () => {
    const r = calcularReconciliacaoResultado({
      operacionalHistorico: 500,
      operacionalPorMoeda: { BRL: 500 },
      eventosDiferenca: [],
      saldosPorMoeda: [{ moeda: "BRL", saldo: 0 }],
      lucroRealizadoFluxo: 500,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r.cambialTotal).toBe(0);
    expect(r.reconciliado).toBe(true);
  });

  it("posição ainda aberta em USD gera cambial NÃO realizado", () => {
    const operacional = 100 * TAXA_OPERACAO;
    const r = calcularReconciliacaoResultado({
      operacionalHistorico: operacional,
      operacionalPorMoeda: { USD: 100 },
      eventosDiferenca: [],
      saldosPorMoeda: [{ moeda: "USD", saldo: 100 }], // nada sacado
      lucroRealizadoFluxo: 0,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r.cambialNaoRealizado).toBeCloseTo(100 * (TAXA_TRABALHO - TAXA_OPERACAO), 6);
    expect(r.cambialRealizado).toBeCloseTo(0, 6);
  });

  it("saque parcial divide cambial entre realizado e não realizado", () => {
    const operacional = 100 * TAXA_OPERACAO;
    const r = calcularReconciliacaoResultado({
      operacionalHistorico: operacional,
      operacionalPorMoeda: { USD: 100 },
      eventosDiferenca: [],
      saldosPorMoeda: [{ moeda: "USD", saldo: 40 }], // 60% já sacado
      lucroRealizadoFluxo: 0,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    const deltaTotal = 100 * (TAXA_TRABALHO - TAXA_OPERACAO);
    expect(r.cambialNaoRealizado).toBeCloseTo(deltaTotal * 0.4, 6);
    expect(r.cambialRealizado).toBeCloseTo(deltaTotal * 0.6, 6);
    expect(r.cambialTotal).toBeCloseTo(deltaTotal, 6);
  });

  it("valorização do dólar gera cambial positivo; desvalorização, negativo", () => {
    const base = {
      operacionalHistorico: 100 * 5.0,
      operacionalPorMoeda: { USD: 100 },
      eventosDiferenca: [],
      saldosPorMoeda: [{ moeda: "USD", saldo: 0 }],
      lucroRealizadoFluxo: 0,
      moedaConsolidacao: "BRL",
    };
    const alta = calcularReconciliacaoResultado({
      ...base,
      convertToConsolidation: (v, m) => (m === "BRL" ? v : v * 5.5),
    });
    const baixa = calcularReconciliacaoResultado({
      ...base,
      convertToConsolidation: (v, m) => (m === "BRL" ? v : v * 4.5),
    });
    expect(alta.cambialTotal).toBeCloseTo(50, 6);
    expect(baixa.cambialTotal).toBeCloseTo(-50, 6);
  });

  it("resultado operacional negativo mantém reconciliação", () => {
    const operacional = -200 * TAXA_OPERACAO;
    const r = calcularReconciliacaoResultado({
      operacionalHistorico: operacional,
      operacionalPorMoeda: { USD: -200 },
      eventosDiferenca: [],
      saldosPorMoeda: [{ moeda: "USD", saldo: 0 }],
      lucroRealizadoFluxo: -200 * TAXA_TRABALHO,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r.reconciliado).toBe(true);
  });

  it("USDT é tratado com paridade USD no cambial", () => {
    const operacional = 100 * TAXA_OPERACAO;
    const r = calcularReconciliacaoResultado({
      operacionalHistorico: operacional,
      operacionalPorMoeda: { USDT: 100 },
      eventosDiferenca: [],
      saldosPorMoeda: [{ moeda: "USDT", saldo: 0 }],
      lucroRealizadoFluxo: 100 * TAXA_TRABALHO,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r.cambialTotal).toBeCloseTo(100 * (TAXA_TRABALHO - TAXA_OPERACAO), 6);
    expect(r.reconciliado).toBe(true);
  });

  it("projeto USD: resultado em USD não sofre cambial", () => {
    const r = calcularReconciliacaoResultado({
      operacionalHistorico: 336.25,
      operacionalPorMoeda: { USD: 336.25 },
      eventosDiferenca: [],
      saldosPorMoeda: [{ moeda: "USD", saldo: 0 }],
      lucroRealizadoFluxo: 336.25,
      moedaConsolidacao: "USD",
      convertToConsolidation: (v) => v,
    });
    expect(r.cambialTotal).toBe(0);
    expect(r.reconciliado).toBe(true);
  });

  it("resíduo inexplicado é sinalizado em vez de escondido", () => {
    const r = calcularReconciliacaoResultado({
      operacionalHistorico: 100,
      operacionalPorMoeda: { BRL: 100 },
      eventosDiferenca: [],
      saldosPorMoeda: [],
      lucroRealizadoFluxo: 130,
      moedaConsolidacao: "BRL",
      convertToConsolidation: convertBRL,
    });
    expect(r.reconciliado).toBe(false);
    expect(r.residuo).toBeCloseTo(30, 6);
  });
});
