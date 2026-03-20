DROP FUNCTION IF EXISTS public.criar_surebet_atomica(
  p_workspace_id uuid,
  p_user_id uuid,
  p_projeto_id uuid,
  p_evento text,
  p_esporte text,
  p_mercado text,
  p_modelo text,
  p_estrategia text,
  p_contexto_operacional text,
  p_data_aposta timestamp with time zone,
  p_pernas jsonb
);