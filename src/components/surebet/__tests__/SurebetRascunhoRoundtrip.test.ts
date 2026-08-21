/**
 * Regressão: rascunho de arbitragem com múltiplas pernas E múltiplas entradas
 * na mesma perna deve ser reconstruído 100% idêntico ao salvo.
 */

import { describe, it, expect } from "vitest";
import { oddsToRascunhoPernas, rascunhoPernasToOdds } from "@/utils/surebetRascunhoMapper";
import type { OddEntry } from "@/hooks/useSurebetCalculator";

const perna = (over: Partial<OddEntry> = {}): OddEntry => ({
  bookmaker_id: "bk-1",
  moeda: "BRL",
  odd: "2.06",
  stake: "99.89",
  selecao: "Casa",
  selecaoLivre: "",
  isReference: false,
  isManuallyEdited: true,
  additionalEntries: [],
  ...over,
});

const roundtrip = (odds: OddEntry[]) =>
  rascunhoPernasToOdds(oddsToRascunhoPernas(odds), []);

describe("Rascunho de arbitragem — roundtrip", () => {
  it("preserva 2 entradas na mesma perna com 3 pernas", () => {
    const odds: OddEntry[] = [
      perna({
        isReference: true,
        additionalEntries: [
          { bookmaker_id: "bk-9", moeda: "USD", odd: "1.95", stake: "70", selecaoLivre: "" },
        ],
      }),
      perna({ bookmaker_id: "bk-2", selecao: "Empate", odd: "3.6", stake: "82.42" }),
      perna({ bookmaker_id: "bk-3", selecao: "Fora", odd: "3.69", stake: "420" }),
    ];

    const out = roundtrip(odds);

    expect(out).toHaveLength(3);
    expect(out[0].additionalEntries).toHaveLength(1);
    expect(out[0].additionalEntries![0]).toMatchObject({
      bookmaker_id: "bk-9",
      moeda: "USD",
      odd: "1.95",
      stake: "70",
    });
    expect(out[1].bookmaker_id).toBe("bk-2");
    expect(out[2].stake).toBe("420");
  });

  it("suporta 3+ entradas na mesma perna", () => {
    const odds = [
      perna({
        additionalEntries: [
          { bookmaker_id: "bk-a", moeda: "BRL", odd: "2.1", stake: "10", selecaoLivre: "" },
          { bookmaker_id: "bk-b", moeda: "EUR", odd: "2.2", stake: "20", selecaoLivre: "" },
          { bookmaker_id: "bk-c", moeda: "USD", odd: "2.3", stake: "30", selecaoLivre: "" },
        ],
      }),
      perna({ bookmaker_id: "bk-2" }),
    ];

    const out = roundtrip(odds);
    expect(out[0].additionalEntries!.map(e => e.bookmaker_id)).toEqual(["bk-a", "bk-b", "bk-c"]);
    expect(out[0].additionalEntries!.map(e => e.moeda)).toEqual(["BRL", "EUR", "USD"]);
  });

  it("preserva LAY, comissão e fonte de saldo (perna e sub-entrada)", () => {
    const odds = [
      perna({
        tipo: "lay",
        comissao: 0.02,
        fonteSaldo: "FREEBET",
        additionalEntries: [
          {
            bookmaker_id: "bk-x",
            moeda: "BRL",
            odd: "3.0",
            stake: "50",
            selecaoLivre: "Under 2.5",
            tipo: "lay",
            comissao: 0.05,
            fonteSaldo: "FREEBET",
          },
        ],
      }),
    ];

    const out = roundtrip(odds);
    expect(out[0]).toMatchObject({ tipo: "lay", comissao: 0.02, fonteSaldo: "FREEBET" });
    expect(out[0].additionalEntries![0]).toMatchObject({
      tipo: "lay",
      comissao: 0.05,
      fonteSaldo: "FREEBET",
      selecaoLivre: "Under 2.5",
    });
  });

  it("descarta apenas sub-entradas totalmente vazias", () => {
    const odds = [
      perna({
        additionalEntries: [
          { bookmaker_id: "", moeda: "BRL", odd: "", stake: "", selecaoLivre: "" },
          { bookmaker_id: "bk-parcial", moeda: "BRL", odd: "", stake: "", selecaoLivre: "" },
        ],
      }),
    ];

    const out = roundtrip(odds);
    expect(out[0].additionalEntries).toHaveLength(1);
    expect(out[0].additionalEntries![0].bookmaker_id).toBe("bk-parcial");
  });

  it("carrega rascunho legado (sem entradas_adicionais) sem quebrar", () => {
    const legado = [
      { bookmaker_id: "bk-1", odd: 2.0, stake: 100, moeda: "BRL", selecao: "Casa" },
      { bookmaker_id: "bk-2", odd: 2.1, stake: 95, moeda: "BRL", selecao: "Fora" },
    ];

    const out = rascunhoPernasToOdds(legado as any, ["Casa", "Fora"]);
    expect(out).toHaveLength(2);
    expect(out[0].additionalEntries).toEqual([]);
    expect(out[0].isReference).toBe(true);
  });

  it("editar após reabrir e salvar de novo não duplica nem perde entradas", () => {
    const original = [
      perna({
        additionalEntries: [
          { bookmaker_id: "bk-a", moeda: "BRL", odd: "2.1", stake: "10", selecaoLivre: "" },
        ],
      }),
      perna({ bookmaker_id: "bk-2" }),
    ];

    // salvar → reabrir
    const reaberto = roundtrip(original);

    // editar: adicionar uma sub-entrada e alterar stake
    reaberto[0].additionalEntries!.push({
      bookmaker_id: "bk-b",
      moeda: "USD",
      odd: "2.4",
      stake: "40",
      selecaoLivre: "",
    });
    reaberto[1].stake = "123.45";

    // salvar de novo → reabrir
    const final = roundtrip(reaberto);

    expect(final[0].additionalEntries).toHaveLength(2);
    expect(final[0].additionalEntries!.map(e => e.bookmaker_id)).toEqual(["bk-a", "bk-b"]);
    expect(final[1].stake).toBe("123.45");
  });
});
