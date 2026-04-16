
-- Drop the old 6-arg version to prevent PostgREST ambiguity
DROP FUNCTION IF EXISTS public.liquidar_perna_surebet_v1(uuid, uuid, text, text, text, uuid);
