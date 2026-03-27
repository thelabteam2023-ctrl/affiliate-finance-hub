const toFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const roundMoney = (value: number): number => Math.round(value * 100) / 100;

export interface StakeSplitSource {
  stake?: number | null;
  stake_total?: number | null;
  stake_real?: number | null;
  stake_freebet?: number | null;
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
  const totalFromDb = toFiniteNumber(source.stake_total) ?? toFiniteNumber(source.stake);
  const explicitReal = toFiniteNumber(source.stake_real);
  const explicitFreebet = toFiniteNumber(source.stake_freebet);
  const usesFreebetFlag =
    (explicitFreebet ?? 0) > 0 || source.fonte_saldo === "FREEBET" || source.usar_freebet === true;

  const fallbackTotal = (explicitReal ?? 0) + (explicitFreebet ?? 0);
  const canonicalTotal = Math.max(0, totalFromDb ?? fallbackTotal);
  const stakeReal = Math.max(
    0,
    explicitReal ?? (usesFreebetFlag ? Math.max(canonicalTotal - (explicitFreebet ?? canonicalTotal), 0) : canonicalTotal)
  );
  const stakeFreebet = Math.max(0, explicitFreebet ?? (usesFreebetFlag ? canonicalTotal - stakeReal : 0));
  const stakeTotal = Math.max(canonicalTotal, stakeReal + stakeFreebet);

  return {
    stakeReal: roundMoney(stakeReal),
    stakeFreebet: roundMoney(stakeFreebet),
    stakeTotal: roundMoney(stakeTotal),
    usesFreebet: roundMoney(stakeFreebet) > 0,
  };
};