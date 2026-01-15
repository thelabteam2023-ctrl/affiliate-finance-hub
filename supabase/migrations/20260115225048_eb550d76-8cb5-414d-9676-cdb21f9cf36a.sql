
-- Criar RPC para sincronizar rollover de todos os bônus ativos
CREATE OR REPLACE FUNCTION public.sync_all_bonus_rollovers()
RETURNS TABLE(bonus_id uuid, bookmaker_nome text, old_progress numeric, new_progress numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bonus RECORD;
  v_new_progress numeric;
BEGIN
  -- Iterar sobre todos os bônus ativos (status = 'credited')
  FOR v_bonus IN 
    SELECT 
      b.id,
      b.rollover_progress,
      bk.nome as bookmaker_nome
    FROM public.project_bookmaker_link_bonuses b
    JOIN public.bookmakers bk ON b.bookmaker_id = bk.id
    WHERE b.status = 'credited'
  LOOP
    -- Calcular o progresso correto
    v_new_progress := calculate_bonus_rollover(v_bonus.id);
    
    -- Se diferente, atualizar
    IF v_new_progress != COALESCE(v_bonus.rollover_progress, 0) THEN
      UPDATE public.project_bookmaker_link_bonuses
      SET rollover_progress = v_new_progress,
          updated_at = now()
      WHERE id = v_bonus.id;
      
      -- Retornar a correção feita
      bonus_id := v_bonus.id;
      bookmaker_nome := v_bonus.bookmaker_nome;
      old_progress := v_bonus.rollover_progress;
      new_progress := v_new_progress;
      RETURN NEXT;
    END IF;
  END LOOP;
  
  RETURN;
END;
$$;

-- Criar RPC para sincronizar rollover de um bônus específico
CREATE OR REPLACE FUNCTION public.sync_bonus_rollover(p_bonus_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_new_progress numeric;
BEGIN
  v_new_progress := calculate_bonus_rollover(p_bonus_id);
  
  UPDATE public.project_bookmaker_link_bonuses
  SET rollover_progress = v_new_progress,
      updated_at = now()
  WHERE id = p_bonus_id;
  
  RETURN v_new_progress;
END;
$$;

COMMENT ON FUNCTION public.sync_all_bonus_rollovers() IS 
'Recalcula e sincroniza o rollover de todos os bônus ativos. Retorna lista de bônus que foram corrigidos.';

COMMENT ON FUNCTION public.sync_bonus_rollover(uuid) IS 
'Recalcula e sincroniza o rollover de um bônus específico. Retorna o novo valor do progresso.';
