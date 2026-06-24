-- 1. Backfill histórico para 4 casas que passaram pelo FILIPE PROMO sem rastro
INSERT INTO public.projeto_bookmaker_historico (
  user_id, workspace_id, projeto_id, bookmaker_id, parceiro_id,
  bookmaker_nome, parceiro_nome, data_vinculacao, data_desvinculacao, status_final
)
SELECT
  '27d899b5-8f91-46b7-a71d-a22deb48c31d'::uuid,
  b.workspace_id,
  'a55c6329-d75e-400d-a549-7abea71f68e1'::uuid,
  b.id,
  b.parceiro_id,
  b.nome,
  p.nome,
  b.created_at,
  '2026-04-07 17:18:05.193592+00'::timestamptz,
  b.status
FROM public.bookmakers b
LEFT JOIN public.parceiros p ON p.id = b.parceiro_id
WHERE b.id IN (
  'db0f3229-bd41-4cb7-ae8c-9cd5b86e1d3a',
  '2c3cb3cf-f747-4011-8006-7a0201179839',
  '3ee6c43f-14f7-431d-b4c1-bc08f043927b',
  'd5c62d03-59fc-4130-8c87-051501abb705'
)
AND NOT EXISTS (
  SELECT 1 FROM public.projeto_bookmaker_historico h
  WHERE h.bookmaker_id = b.id
    AND h.projeto_id = 'a55c6329-d75e-400d-a549-7abea71f68e1'::uuid
);

-- 2. Patch trigger: ao desvincular sem registro aberto, inserir retroativo
CREATE OR REPLACE FUNCTION public.fn_ensure_historico_on_projeto_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_updated INT;
BEGIN
  -- Caso 1: desvinculação (projeto -> NULL)
  IF OLD.projeto_id IS NOT NULL AND NEW.projeto_id IS NULL THEN
    UPDATE projeto_bookmaker_historico
    SET data_desvinculacao = COALESCE(data_desvinculacao, NOW()),
        status_final = COALESCE(status_final, NEW.status)
    WHERE bookmaker_id = NEW.id
      AND projeto_id = OLD.projeto_id
      AND data_desvinculacao IS NULL;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    -- Sem registro aberto: inserir retroativo para não perder a trilha
    IF v_updated = 0 AND NOT EXISTS (
      SELECT 1 FROM projeto_bookmaker_historico
      WHERE bookmaker_id = NEW.id AND projeto_id = OLD.projeto_id
    ) THEN
      INSERT INTO projeto_bookmaker_historico (
        bookmaker_id, projeto_id, bookmaker_nome, parceiro_id, parceiro_nome,
        user_id, workspace_id, data_vinculacao, data_desvinculacao, status_final
      )
      SELECT NEW.id, OLD.projeto_id, NEW.nome, NEW.parceiro_id, parc.nome,
             NEW.user_id, NEW.workspace_id, COALESCE(NEW.updated_at, NOW()), NOW(), NEW.status
      FROM (SELECT 1) _
      LEFT JOIN parceiros parc ON parc.id = NEW.parceiro_id;
    END IF;
  END IF;

  -- Caso 2: vinculação ou re-vinculação
  IF NEW.projeto_id IS NOT NULL AND (OLD.projeto_id IS NULL OR OLD.projeto_id != NEW.projeto_id) THEN
    IF OLD.projeto_id IS NOT NULL AND OLD.projeto_id != NEW.projeto_id THEN
      UPDATE projeto_bookmaker_historico
      SET data_desvinculacao = COALESCE(data_desvinculacao, NOW()),
          status_final = COALESCE(status_final, NEW.status)
      WHERE bookmaker_id = NEW.id
        AND projeto_id = OLD.projeto_id
        AND data_desvinculacao IS NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM projeto_bookmaker_historico
      WHERE bookmaker_id = NEW.id
        AND projeto_id = NEW.projeto_id
        AND data_desvinculacao IS NULL
    ) THEN
      INSERT INTO projeto_bookmaker_historico (
        bookmaker_id, projeto_id, bookmaker_nome, parceiro_id, parceiro_nome,
        user_id, workspace_id, data_vinculacao, tipo_projeto_snapshot
      )
      SELECT NEW.id, NEW.projeto_id, NEW.nome, NEW.parceiro_id, parc.nome,
             NEW.user_id, NEW.workspace_id, NOW(), proj.tipo_projeto
      FROM projetos proj
      LEFT JOIN parceiros parc ON parc.id = NEW.parceiro_id
      WHERE proj.id = NEW.projeto_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;