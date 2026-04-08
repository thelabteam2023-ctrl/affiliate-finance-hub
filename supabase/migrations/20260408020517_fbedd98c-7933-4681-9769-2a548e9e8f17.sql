DROP FUNCTION IF EXISTS public.criar_aposta_atomica_v2(uuid, uuid, uuid, uuid, numeric, numeric, boolean, text, text, text, text, timestamptz, text, text);
DROP FUNCTION IF EXISTS public.reliquidar_aposta_v5(uuid, text, numeric);
DROP FUNCTION IF EXISTS public.atualizar_aposta_liquidada_atomica(uuid, text, numeric);
DROP FUNCTION IF EXISTS public.atualizar_aposta_liquidada_atomica_v2(uuid, text, numeric, numeric);