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

const buildStakeSplitResult = (
  stakeRealValue: number,
  stakeFreebetValue: number,
  stakeTotalValue: number
): StakeSplitResult => {
  const stakeReal = roundMoney(Math.max(0, stakeRealValue));
  const stakeFreebet = roundMoney(Math.max(0, stakeFreebetValue));
  const stakeTotal = roundMoney(Math.max(stakeTotalValue, stakeReal + stakeFreebet));

  return {
    stakeReal,
    stakeFreebet,
    stakeTotal,
    usesFreebet: stakeFreebet > 0,
  };
};

/**
 * Hidrata o split APENAS a partir dos campos persistidos da aposta.
 * Não usa `usar_freebet`/`fonte_saldo` como inferência para evitar falso positivo em edição.
 */
export const derivePersistedStakeSplit = (source: StakeSplitSource): StakeSplitResult => {
  const totalFromDb = toFiniteNumber(source.stake_total) ?? toFiniteNumber(source.stake) ?? 0;
  const explicitReal = toFiniteNumber(source.stake_real);
  const explicitFreebet = toFiniteNumber(source.stake_freebet);

  if (explicitReal !== null && explicitFreebet !== null) {
    return buildStakeSplitResult(explicitReal, explicitFreebet, Math.max(totalFromDb, explicitReal + explicitFreebet));
  }

  if (explicitReal !== null) {
    const inferredFreebet = Math.max(totalFromDb - explicitReal, 0);
    return buildStakeSplitResult(explicitReal, inferredFreebet, Math.max(totalFromDb, explicitReal + inferredFreebet));
  }

  if (explicitFreebet !== null) {
    const inferredReal = Math.max(totalFromDb - explicitFreebet, 0);
    return buildStakeSplitResult(inferredReal, explicitFreebet, Math.max(totalFromDb, inferredReal + explicitFreebet));
  }

  return buildStakeSplitResult(totalFromDb, 0, totalFromDb);
};

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

  return buildStakeSplitResult(stakeReal, stakeFreebet, stakeTotal);
};