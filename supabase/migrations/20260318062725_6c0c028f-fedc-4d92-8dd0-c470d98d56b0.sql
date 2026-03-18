
-- ============================================================
-- CLEANUP: Neutralize duplicate DEPOSITO_VIRTUAL entries
-- where real deposits already existed at the time of creation.
-- 
-- Strategy: For each bookmaker+project combo that has BOTH
-- real deposits AND virtual deposits, recalculate the correct
-- virtual amount = MAX(0, saldo_at_link_time - real_deposits_before_link).
-- Since we can't reliably know saldo_at_link_time vs current saldo,
-- we'll set the virtual deposit to MAX(0, saldo_atual - real_deposits)
-- for cases where saldo has not changed much, OR delete the excess.
--
-- Safest approach: UPDATE the virtual deposit value to the correct
-- gap amount, or set to 0.01 if no gap (can't delete due to ledger 
-- immutability rule, but can UPDATE status to CANCELADO).
-- ============================================================

-- Cancel virtual deposits that are fully redundant (real deposits >= virtual)
-- For SUPER ODDS project specifically (the user's active project)
UPDATE public.cash_ledger
SET status = 'CANCELADO',
    descricao = descricao || ' [CANCELADO: duplicava depósitos reais já existentes]'
WHERE id IN (
  -- BETNACIONAL João (554ccf58): real=660, virtual=660 → 100% duplicate
  '5abbb7fa-7461-43c4-920a-dd25f61e4315',
  -- JOGODEOURO João (27dd3e5d): real=200, virtual=200 → 100% duplicate  
  '31a2baec-1039-4468-8d2c-d4df589ae28a'
);

-- For backfill entries, adjust the virtual deposit value to the correct gap
-- BETNACIONAL Ariane (fe173de0): real=300, saldo=113 → virtual should be 0 (saldo < deposits, losses explain it)
UPDATE public.cash_ledger
SET status = 'CANCELADO',
    descricao = descricao || ' [CANCELADO: saldo já coberto por depósitos reais]'
WHERE id = 'c207979f-48ba-444f-a678-57e4bdc9f2e8';

-- MCGAMES Ariane (6d9bde0a): real=150, saldo=131 → virtual should be 0
UPDATE public.cash_ledger
SET status = 'CANCELADO',
    descricao = descricao || ' [CANCELADO: saldo já coberto por depósitos reais]'
WHERE id = 'fe935dbd-1bda-4844-9664-3fe6b2ffd670';

-- BETPONTOBET Ariane (a0467c5b): real=500, saldo=572.26 → gap=72.26, virtual was 552.20
-- The correct virtual should be 72.26 (saldo_atual at link time minus real deposits)
-- But since saldo has changed since then due to bets, we should set virtual = 0
-- because real deposit of 500 was made BEFORE the link, so virtual should only cover
-- the gap that existed at link time. Since we can't know exact link-time saldo,
-- and real deposit already > original deposit, cancel it.
UPDATE public.cash_ledger
SET status = 'CANCELADO',
    descricao = descricao || ' [CANCELADO: saldo já coberto por depósitos reais]'
WHERE id = '9ac5a48e-4b8c-4d34-ae76-f66dfa9555cc';
