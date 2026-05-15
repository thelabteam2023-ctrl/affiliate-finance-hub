-- 1. Drop the version with 17 args where p_data_aposta is text
DROP FUNCTION IF EXISTS public.editar_surebet_completa_v1(
    uuid, jsonb, text, text, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, numeric, text, text
);

-- 2. Drop the short version (13 args) if it exists
DROP FUNCTION IF EXISTS public.editar_surebet_completa_v1(
    uuid, jsonb, text, text, text, text, text, text, timestamp with time zone, numeric, numeric, numeric, text
);
