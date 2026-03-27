import { describe, expect, it } from "vitest";
import { deriveStakeSplit } from "@/lib/freebetStake";

describe("deriveStakeSplit", () => {
  it("mantém aposta só com saldo real", () => {
    expect(
      deriveStakeSplit({
        stake: 60,
        stake_real: 60,
        usar_freebet: false,
        fonte_saldo: "REAL",
      })
    ).toEqual({
      stakeReal: 60,
      stakeFreebet: 0,
      stakeTotal: 60,
      usesFreebet: false,
    });
  });

  it("mantém aposta só com freebet", () => {
    expect(
      deriveStakeSplit({
        stake: 40,
        stake_real: 0,
        usar_freebet: true,
        fonte_saldo: "FREEBET",
      })
    ).toEqual({
      stakeReal: 0,
      stakeFreebet: 40,
      stakeTotal: 40,
      usesFreebet: true,
    });
  });

  it("recompõe aposta mista a partir de stake total e stake real persistidos", () => {
    expect(
      deriveStakeSplit({
        stake: 100,
        stake_total: 100,
        stake_real: 60,
        usar_freebet: true,
        fonte_saldo: "FREEBET",
      })
    ).toEqual({
      stakeReal: 60,
      stakeFreebet: 40,
      stakeTotal: 100,
      usesFreebet: true,
    });
  });

  it("não joga tudo em freebet quando stake_real estiver salvo", () => {
    const result = deriveStakeSplit({
      stake: 165,
      stake_real: 125,
      usar_freebet: true,
      fonte_saldo: "FREEBET",
    });

    expect(result.stakeReal).toBe(125);
    expect(result.stakeFreebet).toBe(40);
    expect(result.stakeTotal).toBe(165);
  });
});