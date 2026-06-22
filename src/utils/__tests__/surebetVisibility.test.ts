import { describe, expect, it } from "vitest";
import {
  isArbitrageOperation,
  shouldLoadInSurebetOperations,
  surebetMatchesEstrategiaFilter,
} from "../surebetVisibility";

describe("surebetVisibility", () => {
  it("carrega histórico e abertas pela forma técnica ARBITRAGEM, não pela estratégia", () => {
    const fixture = [
      { id: "pendente-bonus", forma_registro: "ARBITRAGEM", estrategia: "EXTRACAO_BONUS", status: "PENDENTE" },
      { id: "historico-bonus", forma_registro: "ARBITRAGEM", estrategia: "EXTRACAO_BONUS", status: "LIQUIDADA" },
      { id: "historico-punter", forma_registro: "ARBITRAGEM", estrategia: "PUNTER", status: "LIQUIDADA" },
      { id: "simples-surebet", forma_registro: "SIMPLES", estrategia: "SUREBET", status: "PENDENTE" },
    ];

    const loadedIds = fixture.filter(shouldLoadInSurebetOperations).map((row) => row.id);

    expect(loadedIds).toEqual(["pendente-bonus", "historico-bonus", "historico-punter"]);
    expect(isArbitrageOperation(fixture[3])).toBe(false);
  });

  it("mantém arbitragens visíveis em Todas Apostas quando o filtro Surebet está ativo", () => {
    const bonusArbitrage = { forma_registro: "ARBITRAGEM", estrategia: "EXTRACAO_BONUS" };

    expect(surebetMatchesEstrategiaFilter(bonusArbitrage, ["SUREBET"])).toBe(true);
    expect(surebetMatchesEstrategiaFilter(bonusArbitrage, ["EXTRACAO_BONUS"])).toBe(true);
    expect(surebetMatchesEstrategiaFilter(bonusArbitrage, ["VALUEBET"])).toBe(false);
  });
});