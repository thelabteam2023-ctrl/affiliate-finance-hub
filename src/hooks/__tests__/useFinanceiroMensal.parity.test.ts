import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// Mocks ANTES dos imports do código produtivo (hoisted pelo Vitest)
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockResolvedValue({
        data: [{ id: "p1" }, { id: "p2" }],
        error: null,
      }),
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
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

const cotacoes = { USD: 5, EUR: 6, GBP: 7, MYR: 1.1, MXN: 0.3, ARS: 0.005, COP: 0.001 };

describe("useFinanceiroMensal — paridade canônica", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // Fixa o "agora" em 30/abr/2026 para janelas determinísticas
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));
    fetchMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("fluxoLiquido vem da engine canônica (Σ lucroRealizadoBRL por projeto)", async () => {
    // Cada chamada (1 por mês) devolve 1000 + 500 = 1500
    fetchMock.mockResolvedValue({
      p1: makeCanonico(1000),
      p2: makeCanonico(500),
    });

    const { result } = renderHook(
      () =>
        useFinanceiroMensal({
          finData: makeEmptyFinData(),
          meses: 6,
          incluirBaseline: false,
          cotacoesOficiais: cotacoes,
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current[result.current.length - 1].fluxoLiquido).toBe(1500);
    });

    // Todos os meses da janela receberam fluxo canônico
    result.current.forEach((m) => {
      expect(m.fluxoLiquido).toBe(1500);
      expect(m.custoTotal).toBe(0);
      expect(m.resultadoLiquido).toBe(1500);
      // base = 1500 + 0 → margem = 100%
      expect(m.margemOperacional).toBe(100);
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("resultadoLiquido === fluxoLiquido − custoTotal (exato, sem arredondamento)", async () => {
    fetchMock.mockResolvedValue({ p1: makeCanonico(9403.71), p2: makeCanonico(0) });

    const fin = makeEmptyFinData();
    // Custo: 1 despesa CAC de R$ 1.234,56 em abr/2026 (mês de referência)
    (fin as any).despesas = [
      { tipo: "PAGTO_PARCEIRO", valor: 1234.56, data_movimentacao: "2026-04-10" },
    ];

    const { result } = renderHook(
      () =>
        useFinanceiroMensal({
          finData: fin,
          meses: 3,
          incluirBaseline: false,
          cotacoesOficiais: cotacoes,
        }),
      { wrapper }
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => {
      const abril = result.current.find((m) => m.mesKey === "2026-04")!;
      expect(abril.fluxoLiquido).toBe(9403.71);
    });

    const abril = result.current.find((m) => m.mesKey === "2026-04")!;
    expect(abril.custoTotal).toBe(1234.56);
    expect(abril.resultadoLiquido).toBe(9403.71 - 1234.56);
    expect(abril.cac).toBe(1234.56);
  });

  it("margemOperacional é null quando base (fluxo+custo) ≤ 0", async () => {
    fetchMock.mockResolvedValue({ p1: makeCanonico(0), p2: makeCanonico(0) });

    const { result } = renderHook(
      () =>
        useFinanceiroMensal({
          finData: makeEmptyFinData(),
          meses: 2,
          incluirBaseline: false,
          cotacoesOficiais: cotacoes,
        }),
      { wrapper }
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    result.current.forEach((m) => expect(m.margemOperacional).toBeNull());
  });

  it("caso de regressão Abril/2026: fluxo canônico = 9403.71 (não 17490.18)", async () => {
    fetchMock.mockImplementation(async ({ dataInicio }: any) => {
      if (dataInicio === "2026-04-01") {
        return { p1: makeCanonico(9403.71), p2: makeCanonico(0) };
      }
      return { p1: makeCanonico(0), p2: makeCanonico(0) };
    });

    const { result } = renderHook(
      () =>
        useFinanceiroMensal({
          finData: makeEmptyFinData(),
          meses: 6,
          incluirBaseline: false,
          cotacoesOficiais: cotacoes,
        }),
      { wrapper }
    );

    await waitFor(() => {
      const abril = result.current.find((m) => m.mesKey === "2026-04");
      expect(abril?.fluxoLiquido).toBe(9403.71);
    });

    const abril = result.current.find((m) => m.mesKey === "2026-04")!;
    expect(abril.fluxoLiquido).not.toBe(17490.18);
  });
});