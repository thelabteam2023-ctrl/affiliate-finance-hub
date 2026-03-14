
-- Drop the old overload (without p_is_investor_account) that causes ambiguity
DROP FUNCTION IF EXISTS public.desvincular_bookmaker_atomico(uuid, uuid, uuid, uuid, text, numeric, text, boolean);
