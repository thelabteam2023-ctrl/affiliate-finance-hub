import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useInvalidateCaixaData, CAIXA_QUERY_KEYS } from "../useInvalidateCaixaData";

function makeWrapper(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function captureInvalidatedKeys(qc: QueryClient): string[][] {
  const calls: string[][] = [];
  const orig = qc.invalidateQueries.bind(qc);
  vi.spyOn(qc, "invalidateQueries").mockImplementation((filters?: any) => {
    if (filters?.queryKey) calls.push(filters.queryKey as string[]);
    return orig(filters);
  });
  return calls;
}

describe("useInvalidateCaixaData — invalidação real de saldos Caixa↔Parceiros", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it("only=saldoContasParceiros invalida financeiro-data e parceiros-data", async () => {
    const calls = captureInvalidatedKeys(qc);
    const { result } = renderHook(() => useInvalidateCaixaData(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current({ only: ["saldoContasParceiros"] });
    });
    const flat = calls.map((k) => k[0]);
    expect(flat).toContain("financeiro-data");
    expect(flat).toContain("parceiros-data");
  });

  it("only=saldoWalletsParceiros invalida financeiro-data e parceiros-data", async () => {
    const calls = captureInvalidatedKeys(qc);
    const { result } = renderHook(() => useInvalidateCaixaData(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current({ only: ["saldoWalletsParceiros"] });
    });
    const flat = calls.map((k) => k[0]);
    expect(flat).toContain("financeiro-data");
    expect(flat).toContain("parceiros-data");
  });

  it("invalidação ampla (sem only) cobre todos os queryKeys consumidos de fato", async () => {
    const calls = captureInvalidatedKeys(qc);
    const { result } = renderHook(() => useInvalidateCaixaData(), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current();
    });
    const flat = new Set(calls.map((k) => k[0]));
    for (const required of [
      "financeiro-data",
      "parceiros-data",
      "exposicao-financeira",
      "bookmaker-saldos",
      "central-operacoes-data",
      "caixa-transacoes",
    ]) {
      expect(flat.has(required), `faltou invalidar "${required}"`).toBe(true);
    }
  });

  it("smoke: CAIXA_QUERY_KEYS existe e é estável (proibido remover chaves sem migrar consumidores)", () => {
    expect(Object.keys(CAIXA_QUERY_KEYS)).toEqual(
      expect.arrayContaining([
        "transacoes",
        "saldosFiat",
        "saldosCrypto",
        "saldosBookmakers",
        "saldoContasParceiros",
        "saldoWalletsParceiros",
      ])
    );
  });
});