import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BonusContaminationAlert } from "../BonusContaminationAlert";

const dismissMock = vi.fn();
let dismissalState = { isDismissed: false, isLoading: false, dismiss: dismissMock };

vi.mock("@/hooks/useAlertDismissal", () => ({
  useAlertDismissal: () => dismissalState,
}));

const casas = [
  { id: "bk1", nome: "CASA 1", estrategias: ["SUREBET"], totalApostas: 10 },
];

describe("BonusContaminationAlert — dispensa persistente", () => {
  beforeEach(() => {
    dismissMock.mockClear();
    dismissalState = { isDismissed: false, isLoading: false, dismiss: dismissMock };
  });

  it("exibe o aviso quando ainda não foi dispensado", () => {
    render(<BonusContaminationAlert contaminatedBookmakers={casas} totalNonBonusBets={64} projetoId="p1" />);
    expect(screen.getByText("Métricas com influência externa")).toBeTruthy();
  });

  it("não renderiza nada enquanto a preferência carrega", () => {
    dismissalState = { isDismissed: false, isLoading: true, dismiss: dismissMock };
    const { container } = render(
      <BonusContaminationAlert contaminatedBookmakers={casas} totalNonBonusBets={64} projetoId="p1" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("não renderiza quando já foi dispensado pelo usuário", () => {
    dismissalState = { isDismissed: true, isLoading: false, dismiss: dismissMock };
    const { container } = render(
      <BonusContaminationAlert contaminatedBookmakers={casas} totalNonBonusBets={64} projetoId="p1" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("o X persiste a preferência", () => {
    render(<BonusContaminationAlert contaminatedBookmakers={casas} totalNonBonusBets={64} projetoId="p1" />);
    screen.getByLabelText("Não mostrar novamente").click();
    expect(dismissMock).toHaveBeenCalledTimes(1);
  });
});
