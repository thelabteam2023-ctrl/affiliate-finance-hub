import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOperacoesFilter } from "../useOperacoesFilter";
import type { ItemAdapter } from "../types";

interface Row {
  id: string;
  parceiro: string;
  casa: string;
  moeda: string;
  projeto: string;
  valor: number;
  created_at: string;
}

const adapter: ItemAdapter<Row> = {
  getId: (r) => r.id,
  getParceiro: (r) => r.parceiro,
  getCasa: (r) => r.casa,
  getMoeda: (r) => r.moeda,
  getProjeto: (r) => r.projeto,
  getValor: (r) => r.valor,
  getCreatedAt: (r) => r.created_at,
  getSearchText: (r) => `${r.parceiro} ${r.casa} ${r.projeto}`,
};

const now = new Date().toISOString();
const rows: Row[] = [
  { id: "1", parceiro: "Diego", casa: "Bet365", moeda: "BRL", projeto: "P1", valor: 100, created_at: now },
  { id: "2", parceiro: "Diego", casa: "Sportingbet", moeda: "USD", projeto: "P1", valor: 50, created_at: now },
  { id: "3", parceiro: "Lolisa", casa: "Bet365", moeda: "BRL", projeto: "P2", valor: 200, created_at: now },
];

beforeEach(() => localStorage.clear());

describe("useOperacoesFilter", () => {
  it("filtra por uma faceta (OR dentro da faceta)", () => {
    const { result } = renderHook(() => useOperacoesFilter("test", rows, adapter, "u1"));
    act(() => result.current.toggleFacet("parceiro", "Diego"));
    expect(result.current.filtered.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("combina facetas (AND entre facetas)", () => {
    const { result } = renderHook(() => useOperacoesFilter("t2", rows, adapter, "u1"));
    act(() => {
      result.current.toggleFacet("parceiro", "Diego");
      result.current.toggleFacet("casa", "Bet365");
    });
    expect(result.current.filtered.map((r) => r.id)).toEqual(["1"]);
  });

  it("ordena por valor desc", () => {
    const { result } = renderHook(() => useOperacoesFilter("t3", rows, adapter, "u1"));
    act(() => {
      result.current.toggleSort("valor");
      result.current.toggleSort("valor"); // asc -> desc
    });
    expect(result.current.filtered.map((r) => r.id)).toEqual(["3", "1", "2"]);
  });

  it("agrega totais por moeda", () => {
    const { result } = renderHook(() => useOperacoesFilter("t4", rows, adapter, "u1"));
    const totals = Object.fromEntries(result.current.totalsByMoeda.map((t) => [t.moeda, t.total]));
    expect(totals).toEqual({ BRL: 300, USD: 50 });
  });

  it("persiste estado por (cardId,userId)", () => {
    const { result, rerender } = renderHook(() => useOperacoesFilter("t5", rows, adapter, "u1"));
    act(() => result.current.toggleFacet("parceiro", "Diego"));
    rerender();
    const { result: r2 } = renderHook(() => useOperacoesFilter("t5", rows, adapter, "u1"));
    expect(r2.current.state.facets.parceiro).toEqual(["Diego"]);
  });

  it("facetOptions reflete count por dimensão", () => {
    const { result } = renderHook(() => useOperacoesFilter("t6", rows, adapter, "u1"));
    const parceiros = Object.fromEntries(result.current.facetOptions.parceiro.map((o) => [o.value, o.count]));
    expect(parceiros).toEqual({ Diego: 2, Lolisa: 1 });
  });
});