import { describe, it, expect } from "vitest";
import { resolveRealPernaIds, extractRealPernaId } from "@/utils/resolvePernaIds";

describe("resolveRealPernaIds", () => {
  it("Caso 1/2 — perna com 1 casa: retorna o próprio id da perna", () => {
    expect(resolveRealPernaIds({ id: "perna-1" })).toEqual(["perna-1"]);
  });

  it("Caso 3/4 — Bônus: perna com 2 casas (entries são apostas_perna_entradas) resolve 1 única perna", () => {
    const perna = {
      id: "perna-1",
      entries: [
        { id: "entrada-a", perna_id: "perna-1" },
        { id: "entrada-b", perna_id: "perna-1" },
      ],
    };
    expect(resolveRealPernaIds(perna)).toEqual(["perna-1"]);
  });

  it("Todas as apostas — entries com ids sintéticos são normalizados para a perna real", () => {
    const perna = {
      id: "perna-9__entrada_x",
      entries: [{ id: "perna-9__entrada_x" }, { id: "perna-9__entrada_y" }],
    };
    expect(resolveRealPernaIds(perna)).toEqual(["perna-9"]);
  });

  it("Agrupamento por seleção — pernas reais distintas geram múltiplos ids", () => {
    const perna = {
      id: "perna-1",
      entries: [{ id: "perna-1" }, { id: "perna-2" }],
    };
    expect(resolveRealPernaIds(perna)).toEqual(["perna-1", "perna-2"]);
  });

  it("Caso 5 — múltiplas pernas: cada perna resolve seu conjunto isolado", () => {
    const pernas = [
      { id: "p1", entries: [{ id: "e1", perna_id: "p1" }, { id: "e2", perna_id: "p1" }] },
      { id: "p2" },
    ];
    expect(pernas.map(resolveRealPernaIds)).toEqual([["p1"], ["p2"]]);
  });

  it("Caso 7 — idempotência: ids duplicados não geram chamadas duplicadas", () => {
    const perna = {
      id: "p1",
      entries: [{ id: "e1", perna_id: "p1" }, { id: "e2", perna_id: "p1" }, { id: "p1" }],
    };
    expect(resolveRealPernaIds(perna)).toEqual(["p1"]);
  });

  it("ignora ids ausentes/nulos", () => {
    expect(resolveRealPernaIds({ id: null, entries: [{ id: null }] })).toEqual([]);
    expect(extractRealPernaId(undefined)).toBeNull();
  });
});
