import { describe, it, expect } from "vitest";
import { dataCompetenciaAjusteCambial } from "@/lib/ledger/competenciaCambial";
import { getTodayCivilDate } from "@/utils/dateUtils";

describe("dataCompetenciaAjusteCambial", () => {
  it("usa a competência do saque pai, não a data da confirmação", () => {
    expect(dataCompetenciaAjusteCambial("2026-08-27")).toBe("2026-08-27");
  });

  it("aceita timestamp completo e mantém o dia da competência", () => {
    expect(dataCompetenciaAjusteCambial("2026-08-27T00:00:00+00:00")).toBe("2026-08-27");
  });

  it("aceita objeto Date", () => {
    expect(dataCompetenciaAjusteCambial(new Date("2026-08-27T12:00:00Z"))).toBe("2026-08-27");
  });

  it("cai para hoje quando o pai não tem data", () => {
    expect(dataCompetenciaAjusteCambial(null)).toBe(getTodayCivilDate());
    expect(dataCompetenciaAjusteCambial(undefined)).toBe(getTodayCivilDate());
    expect(dataCompetenciaAjusteCambial("")).toBe(getTodayCivilDate());
  });

  it("cai para hoje quando a data é inválida", () => {
    expect(dataCompetenciaAjusteCambial("data-invalida")).toBe(getTodayCivilDate());
  });

  it("nunca retorna a data de hoje quando existe competência retroativa", () => {
    const hoje = getTodayCivilDate();
    expect(dataCompetenciaAjusteCambial("2026-01-15")).not.toBe(hoje);
  });
});
