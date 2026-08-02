import { describe, it, expect, afterEach, vi } from "vitest";
import { resolveCalendarInitialMonth } from "@/utils/calendarInitialMonth";

/** Fixa "agora" em um instante UTC */
function freeze(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

/** Range do filtro "Ano": 01/01 até 31/12 do ano */
const anoRange = (y: number) => ({
  start: new Date(y, 0, 1, 0, 0, 0),
  end: new Date(y, 11, 31, 23, 59, 59),
});

/** Retorna "YYYY-MM" do resultado */
const ym = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

describe("resolveCalendarInitialMonth", () => {
  afterEach(() => vi.useRealTimers());

  it.each([
    ["Janeiro", "2026-01-15T15:00:00Z", "2026-01"],
    ["Junho", "2026-06-10T15:00:00Z", "2026-06"],
    ["Julho", "2026-07-28T15:00:00Z", "2026-07"],
    ["Novembro", "2026-11-05T15:00:00Z", "2026-11"],
    ["Dezembro", "2026-12-20T15:00:00Z", "2026-12"],
  ])("filtro Ano em %s abre no mês corrente", (_label, now, expected) => {
    freeze(now);
    const { start, end } = anoRange(2026);
    expect(ym(resolveCalendarInitialMonth(start, end))).toBe(expected);
  });

  it("virada de ano: 31/12 23:30 BRT permanece em dezembro", () => {
    freeze("2027-01-01T02:30:00Z"); // 31/12/2026 23:30 em São Paulo
    const { start, end } = anoRange(2026);
    expect(ym(resolveCalendarInitialMonth(start, end))).toBe("2026-12");
  });

  it("virada de ano: 01/01 00:30 BRT abre em janeiro do novo ano", () => {
    freeze("2027-01-01T03:30:00Z"); // 01/01/2027 00:30 em São Paulo
    const { start, end } = anoRange(2027);
    expect(ym(resolveCalendarInitialMonth(start, end))).toBe("2027-01");
  });

  it("filtro Mês anterior continua abrindo no mês anterior", () => {
    freeze("2026-07-28T15:00:00Z");
    const start = new Date(2026, 5, 1);
    const end = new Date(2026, 5, 30, 23, 59, 59);
    expect(ym(resolveCalendarInitialMonth(start, end))).toBe("2026-06");
  });

  it("filtro 1 dia abre no mês corrente", () => {
    freeze("2026-07-28T15:00:00Z");
    const d = new Date(2026, 6, 28);
    expect(ym(resolveCalendarInitialMonth(d, d))).toBe("2026-07");
  });

  it("filtro 7 dias cruzando meses abre no mês corrente", () => {
    freeze("2026-07-03T15:00:00Z");
    expect(
      ym(resolveCalendarInitialMonth(new Date(2026, 5, 27), new Date(2026, 6, 3))),
    ).toBe("2026-07");
  });

  it("período custom no passado abre no mês final do intervalo", () => {
    freeze("2026-07-28T15:00:00Z");
    expect(
      ym(resolveCalendarInitialMonth(new Date(2026, 2, 5), new Date(2026, 3, 20))),
    ).toBe("2026-04");
  });

  it("período totalmente futuro abre no mês de início", () => {
    freeze("2026-07-28T15:00:00Z");
    expect(
      ym(resolveCalendarInitialMonth(new Date(2026, 9, 1), new Date(2026, 9, 31))),
    ).toBe("2026-10");
  });

  it("sem range abre no mês corrente", () => {
    freeze("2026-11-09T15:00:00Z");
    expect(ym(resolveCalendarInitialMonth())).toBe("2026-11");
  });
});