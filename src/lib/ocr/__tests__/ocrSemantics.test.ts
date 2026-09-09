import { describe, it, expect } from "vitest";
import { normalizeMarketKey, isThreeWayMatchResult } from "../marketSynonyms";
import { resolveSelectionPosition, teamSimilarity, normalizeTeamName } from "../teamNameMatch";
import { resolveEventTimes } from "../eventTimeResolution";

describe("marketSynonyms", () => {
  it("reconhece sinônimos de Match Result como 1X2", () => {
    for (const raw of ["Match Result", "Resultado da Partida", "1X2", "Full Time Result", "Resultado Final"]) {
      const c = normalizeMarketKey(raw).canonical;
      expect(isThreeWayMatchResult(c!), raw).toBe(true);
    }
  });

  it("não confunde Dupla Chance nem Placar Exato com Match Result", () => {
    expect(isThreeWayMatchResult(normalizeMarketKey("Dupla Chance").canonical!)).toBe(false);
    expect(isThreeWayMatchResult(normalizeMarketKey("Placar Exato").canonical!)).toBe(false);
  });

  it("mantém mercados de período separados do tempo integral", () => {
    expect(normalizeMarketKey("Resultado 1º Tempo").canonical).toBe("HALF_TIME_RESULT");
    expect(normalizeMarketKey("Resultado 1º Tempo").canonical).not.toBe("MATCH_RESULT_1X2");
  });
});

describe("teamNameMatch", () => {
  it("casa nomes com acento e sufixos", () => {
    expect(teamSimilarity("Grêmio", "GREMIO FBPA")).toBeGreaterThan(0.7);
    expect(normalizeTeamName("São Paulo FC")).toContain("sao");
  });

  it("preserva categorias distintas", () => {
    expect(teamSimilarity("Corinthians", "Corinthians Feminino")).toBeLessThan(0.9);
  });

  it("resolve posição da seleção", () => {
    expect(resolveSelectionPosition("Pohang", "POHANG", "GIMCHEON SANGMU FC")?.position).toBe("HOME");
    expect(resolveSelectionPosition("Empate", "POHANG", "GIMCHEON")?.position).toBe("DRAW");
    expect(resolveSelectionPosition("Gimcheon Sangmu", "POHANG", "GIMCHEON SANGMU FC")?.position).toBe("AWAY");
  });

  it("não chuta quando não reconhece", () => {
    expect(resolveSelectionPosition("Over 2.5", "POHANG", "GIMCHEON")).toBeNull();
  });
});

describe("eventTimeResolution", () => {
  it("separa início do evento do horário de registro", () => {
    const r = resolveEventTimes([
      { value: "2026-09-09T07:30", label: "Início" },
      { value: "2026-09-09T01:57", label: "Aposta feita em" },
    ]);
    expect(r.eventStartsAt).toBe("2026-09-09T07:30");
    expect(r.betPlacedAt).toBe("2026-09-09T01:57");
  });

  it("não inventa horário quando não há nenhum", () => {
    const r = resolveEventTimes([{ value: null, label: null }]);
    expect(r.eventStartsAt).toBeNull();
  });
});
