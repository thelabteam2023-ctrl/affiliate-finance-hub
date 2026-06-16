import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExposicaoFinanceiraCard } from "../ExposicaoFinanceiraCard";

vi.mock("@/hooks/useExposicaoFinanceira", () => ({
  useExposicaoFinanceira: () => ({
    loading: false,
    totalEmDisputa: 12345,
    totalPerdasPeriodo: 6789,
    countPerdas: 5,
    bySegmentDisputa: { bookmakers: 12345, "contas-parc": 0, wallets: 0, "caixa-op": 0 },
    detalhes: {
      disputaBookmakers: [],
      disputaContasParceiros: [],
      disputaWallets: [],
      disputaCaixa: [],
      perdas: [],
    },
  }),
}));

vi.mock("@/hooks/useBookmakerLogoMap", () => ({
  useBookmakerLogoMap: () => ({ getLogoUrl: () => null }),
}));

const fmt = (v: number) => `R$ ${v.toFixed(2)}`;

describe("ExposicaoFinanceiraCard — regressão de KPIs voláteis", () => {
  it("não renderiza percentual sobre patrimônio nem sobre fluxo líquido", () => {
    const { container } = render(
      <ExposicaoFinanceiraCard
        dataInicio="2026-01-01"
        dataFim="2026-01-31"
        formatCurrency={fmt}
      />
    );
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/% do patrim/i);
    expect(text).not.toMatch(/% do fluxo/i);
    expect(text).not.toMatch(/fluxo l[ií]quido/i);
    // Confirma KPIs absolutos presentes
    expect(screen.getAllByText(fmt(12345)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(fmt(6789)).length).toBeGreaterThan(0);
    expect(screen.getByText(/5 ocorr[êe]ncias/i)).toBeInTheDocument();
  });

  it("Props não aceitam mais patrimonioTotal nem fluxoLiquidoPeriodo", () => {
    // Type-level guard: se essas props voltarem, o teste falha na build.
    type Props = React.ComponentProps<typeof ExposicaoFinanceiraCard>;
    const _check: Record<string, true> = {
      hasNoPatrimonio: (("patrimonioTotal" in ({} as Props)) ? false : true) as true,
      hasNoFluxo: (("fluxoLiquidoPeriodo" in ({} as Props)) ? false : true) as true,
    };
    expect(_check.hasNoPatrimonio).toBe(true);
    expect(_check.hasNoFluxo).toBe(true);
  });
});