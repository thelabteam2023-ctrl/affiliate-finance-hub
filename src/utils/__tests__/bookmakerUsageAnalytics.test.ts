import { describe, expect, it } from "vitest";
import { aggregateBookmakerUsage } from "../bookmakerUsageAnalytics";

describe("bookmakerUsageAnalytics", () => {
  it("contabiliza todas as entries agrupadas dentro da mesma seleção", () => {
    const result = aggregateBookmakerUsage([
      {
        id: "op-1",
        status: "LIQUIDADA",
        resultado: "GREEN",
        stake: 150,
        lucro_prejuizo: 20,
        bookmaker_id: null,
        bookmaker_nome: "Casa principal",
        pernas: [
          {
            id: "perna-1",
            selecao: "Casa" as any,
            stake: 150,
            lucro_prejuizo: 20,
            resultado: "GREEN",
            bookmaker_nome: "Grupo",
            entries: [
              { bookmaker_id: "bk-1", bookmaker_nome: "AlphaBet - João Silva", parceiro_nome: "João Silva", stake: 100, lucro_prejuizo: 10, resultado: "GREEN", moeda: "BRL" },
              { bookmaker_id: "bk-2", bookmaker_nome: "BetaBook - Maria Souza", parceiro_nome: "Maria Souza", stake: 50, lucro_prejuizo: 10, resultado: "GREEN", moeda: "BRL" },
            ],
          },
        ],
      },
    ], { moedaConsolidacao: "BRL" });

    expect(result).toHaveLength(2);
    expect(result.map((item) => item.casa).sort()).toEqual(["AlphaBet", "BetaBook"]);
    expect(result.find((item) => item.casa === "AlphaBet")?.volume).toBe(100);
    expect(result.find((item) => item.casa === "BetaBook")?.volume).toBe(50);
  });

  it("contabiliza _sub_entries de aposta simples multi-entry", () => {
    const result = aggregateBookmakerUsage([
      {
        id: "op-2",
        status: "LIQUIDADA",
        resultado: "RED",
        stake: 200,
        lucro_prejuizo: -200,
        _sub_entries: [
          { bookmaker_id: "bk-1", bookmaker_nome: "Novibet - Pedro", parceiro_nome: "Pedro", stake: 120, lucro_prejuizo: -120, resultado: "RED", moeda: "BRL" },
          { bookmaker_id: "bk-2", bookmaker_nome: "Superbet - Ana", parceiro_nome: "Ana", stake: 80, lucro_prejuizo: -80, resultado: "RED", moeda: "BRL" },
        ],
      },
    ], { moedaConsolidacao: "BRL" });

    expect(result.map((item) => item.casa).sort()).toEqual(["Novibet", "Superbet"]);
    expect(result.reduce((sum, item) => sum + item.apostas, 0)).toBe(2);
    expect(result.reduce((sum, item) => sum + item.volume, 0)).toBe(200);
  });

  it("distribui lucro faltante proporcionalmente pela stake das entries", () => {
    const result = aggregateBookmakerUsage([
      {
        id: "op-3",
        status: "LIQUIDADA",
        resultado: "GREEN",
        stake: 200,
        lucro_prejuizo: 60,
        pernas: [
          {
            id: "perna-1",
            selecao: "Casa" as any,
            stake: 200,
            resultado: "GREEN",
            bookmaker_nome: "Grupo",
            entries: [
              { bookmaker_id: "bk-1", bookmaker_nome: "AlphaBet", stake: 150, resultado: "GREEN", moeda: "BRL" },
              { bookmaker_id: "bk-2", bookmaker_nome: "BetaBook", stake: 50, resultado: "GREEN", moeda: "BRL" },
            ],
          },
        ],
      },
    ], { moedaConsolidacao: "BRL" });

    expect(result.find((item) => item.casa === "AlphaBet")?.lucro).toBe(45);
    expect(result.find((item) => item.casa === "BetaBook")?.lucro).toBe(15);
  });
});