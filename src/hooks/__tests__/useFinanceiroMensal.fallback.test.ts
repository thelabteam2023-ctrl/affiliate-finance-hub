import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
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
import { makeEmptyFinData, makeLedger } from "@/test/fixtures/financeiroMensal.fixtures";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useFinanceiroMensal — fallback legado (sem cotacoesOficiais)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T12:00:00Z"));
    fetchMock.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("não chama a engine canônica", () => {
    renderHook(
      () =>
        useFinanceiroMensal({
          finData: makeEmptyFinData(),
          meses: 3,
          incluirBaseline: false,
        }),
      { wrapper }
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("BASELINE ignorado, MIGRACAO subtraído, SAQUE somado", () => {
    const fin = makeEmptyFinData();
    (fin as any).cashLedger = [
      makeLedger({ tipo_transacao: "SAQUE", valor: 1000, data_transacao: "2026-04-10" }),
      makeLedger({ tipo_transacao: "DEPOSITO", valor: 300, data_transacao: "2026-04-12" }),
      makeLedger({
        tipo_transacao: "DEPOSITO_VIRTUAL",
        origem_tipo: "BASELINE",
        valor: 50000,
        data_transacao: "2026-04-01",
      }),
      makeLedger({
        tipo_transacao: "DEPOSITO_VIRTUAL",
        origem_tipo: "MIGRACAO",
        valor: 200,
        data_transacao: "2026-04-15",
      }),
    ];

    const { result } = renderHook(
      () =>
        useFinanceiroMensal({
          finData: fin,
          meses: 3,
          incluirBaseline: false,
        }),
      { wrapper }
    );

    const abril = result.current.find((m) => m.mesKey === "2026-04")!;
    // 1000 (saque) − 300 (dep) − 200 (migracao) = 500. Baseline 50000 ignorado.
    expect(abril.fluxoLiquido).toBe(500);
  });
});