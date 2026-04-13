DROP FUNCTION IF EXISTS public.criar_surebet_atomica(
  p_workspace_id uuid, 
  p_user_id uuid, 
  p_projeto_id uuid, 
  p_estrategia text, 
  p_contexto_operacional text, 
  p_evento text, 
  p_esporte text, 
  p_mercado text, 
  p_modelo text, 
  p_pernas jsonb, 
  p_data_aposta text
);