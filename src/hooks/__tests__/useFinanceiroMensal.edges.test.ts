import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({ data: [], error: null }),
    })),
  },
}));

const fetchMock = vi.fn();
vi.mock("@/services/fetchProjetosLucroCanonico", () => ({
  fetchProjetosLucroCanonico: (...args: any[]) => fetchMock(...args),
}));

import { useFinanceiroMensal } from "@/hooks/useFinanceiroMensal";
import { makeEmptyFinData, makeCanonico } from "@/test/fixtures/financeiroMensal.fixtures";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const cot = { USD: 5, EUR: 6, GBP: 7, MYR: 1.1, MXN: 0.3, ARS: 0.005, COP: 0.001 };

describe("useFinanceiroMensal — edge cases", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));
    fetchMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("workspace sem projetos → fluxo = 0 em todos os meses, sem crash", async () => {
    // supabase mock já retorna data:[] (sem projetos)
    fetchMock.mockResolvedValue({}); // não deveria ser chamado, mas defensivo

    const { result } = renderHook(
      () =>
        useFinanceiroMensal({
          finData: makeEmptyFinData(),
          meses: 6,
          incluirBaseline: false,
          cotacoesOficiais: cot,
        }),
      { wrapper }
    );

    await waitFor(() => expect(result.current.length).toBe(6));
    result.current.forEach((m) => expect(m.fluxoLiquido).toBe(0));
  });

  it("USD = 0 (cotação carregando) → query desabilitada, engine NÃO é chamada", async () => {
    renderHook(
      () =>
        useFinanceiroMensal({
          finData: makeEmptyFinData(),
          meses: 3,
          incluirBaseline: false,
          cotacoesOficiais: { ...cot, USD: 0 },
        }),
      { wrapper }
    );
    // Pequena espera para garantir que nenhuma chamada ocorre
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("janela respeita `meses` e `incluirBaseline` (+1)", async () => {
    fetchMock.mockResolvedValue({});
    const { result, rerender } = renderHook(
      ({ meses, baseline }: any) =>
        useFinanceiroMensal({
          finData: makeEmptyFinData(),
          meses,
          incluirBaseline: baseline,
          cotacoesOficiais: cot,
        }),
      { wrapper, initialProps: { meses: 6, baseline: false } }
    );
    await waitFor(() => expect(result.current.length).toBe(6));

    rerender({ meses: 12, baseline: true });
    await waitFor(() => expect(result.current.length).toBe(13));

    // Primeiro mês marcado como baseline
    expect(result.current[0].isBaseline).toBe(true);
    expect(result.current[0].fluxoLiquido).toBe(0);
  });

  it("hook NÃO re-converte o fluxo canônico (já vem em BRL)", async () => {
    fetchMock.mockResolvedValue({ p1: makeCanonico(1000) });

    // convertToBRL multiplicando por 10 — se fosse aplicado ao fluxo canônico, daria 10000
    const spyConvert = vi.fn((v: number) => v * 10);

    const { result } = renderHook(
      () =>
        useFinanceiroMensal({
          finData: makeEmptyFinData(),
          meses: 2,
          incluirBaseline: false,
          cotacoesOficiais: cot,
          convertToBRL: spyConvert,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current[result.current.length - 1].fluxoLiquido).toBe(1000);
    });
    // convertToBRL não deve ter sido aplicado ao fluxo (ele só serviria ao fallback cru)
    result.current.forEach((m) => expect(m.fluxoLiquido).toBe(1000));
  });
});