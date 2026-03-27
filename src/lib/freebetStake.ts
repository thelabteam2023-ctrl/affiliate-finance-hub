const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export interface StakeSplitSource {
  stake?: number | null;
  stake_total?: number | null;
  stake_real?: number | null;
  usar_freebet?: boolean | null;
  fonte_saldo?: string | null;
}

export interface StakeSplitResult {
  stakeReal: number;
  stakeFreebet: number;
  stakeTotal: number;
  usesFreebet: boolean;
}

export const deriveStakeSplit = (source: StakeSplitSource): StakeSplitResult => {
  const totalFromDb = toFiniteNumber(source.stake_total) ?? toFiniteNumber(source.stake) ?? 0;
  const explicitReal = toFiniteNumber(source.stake_real);
  const usesFreebetFlag = source.fonte_saldo === "FREEBET" || source.usar_freebet === true;

  const stakeReal = Math.max(0, explicitReal ?? (usesFreebetFlag ? 0 : totalFromDb));
  const stakeFreebet = Math.max(0, usesFreebetFlag ? totalFromDb - stakeReal : 0);
  const stakeTotal = Math.max(totalFromDb, stakeReal + stakeFreebet);

  return {
    stakeReal: roundMoney(stakeReal),
    stakeFreebet: roundMoney(stakeFreebet),
    stakeTotal: roundMoney(stakeTotal),
    usesFreebet: roundMoney(stakeFreebet) > 0,
  };
};