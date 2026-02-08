
-- BACKFILL from projeto_bookmaker_historico (desvinculadas limitadas)
INSERT INTO public.limitation_events (
  bookmaker_id, projeto_id, user_id, workspace_id,
  event_timestamp,
  total_bets_before_limitation,
  project_bets_before_limitation,
  limitation_type, observacoes
)
SELECT 
  h.bookmaker_id,
  h.projeto_id,
  h.user_id,
  h.workspace_id,
  COALESCE(h.data_desvinculacao, h.created_at),
  COALESCE((
    SELECT count(*) FROM apostas_unificada a 
    WHERE a.bookmaker_id = h.bookmaker_id 
      AND a.workspace_id = h.workspace_id
      AND a.data_aposta::date <= COALESCE(h.data_desvinculacao, h.created_at)::date
  ), 0),
  COALESCE((
    SELECT count(*) FROM apostas_unificada a 
    WHERE a.bookmaker_id = h.bookmaker_id 
      AND a.projeto_id = h.projeto_id
      AND a.data_aposta::date <= COALESCE(h.data_desvinculacao, h.created_at)::date
  ), 0),
  'full_limit',
  'Auto-importado do histórico de desvinculação'
FROM projeto_bookmaker_historico h
WHERE h.status_final IN ('limitada', 'LIMITADA')
  AND h.projeto_id IS NOT NULL
  AND h.workspace_id IS NOT NULL;

-- BACKFILL from currently limited bookmakers (still linked)
INSERT INTO public.limitation_events (
  bookmaker_id, projeto_id, user_id, workspace_id,
  event_timestamp,
  total_bets_before_limitation,
  project_bets_before_limitation,
  limitation_type, observacoes
)
SELECT 
  b.id,
  b.projeto_id,
  b.user_id,
  b.workspace_id,
  b.updated_at,
  COALESCE((
    SELECT count(*) FROM apostas_unificada a 
    WHERE a.bookmaker_id = b.id AND a.workspace_id = b.workspace_id
  ), 0),
  COALESCE((
    SELECT count(*) FROM apostas_unificada a 
    WHERE a.bookmaker_id = b.id AND a.projeto_id = b.projeto_id
  ), 0),
  'full_limit',
  'Auto-importado de conta atualmente limitada'
FROM bookmakers b
WHERE b.status IN ('limitada', 'LIMITADA')
  AND b.projeto_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM limitation_events le 
    WHERE le.bookmaker_id = b.id AND le.projeto_id = b.projeto_id
  );

-- TRIGGER: Auto-create limitation_event when bookmaker → limitada
CREATE OR REPLACE FUNCTION public.fn_auto_create_limitation_event()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('limitada', 'LIMITADA') 
     AND (OLD.status IS NULL OR OLD.status NOT IN ('limitada', 'LIMITADA'))
     AND NEW.projeto_id IS NOT NULL THEN
    
    INSERT INTO public.limitation_events (
      bookmaker_id, projeto_id, user_id, workspace_id,
      event_timestamp,
      total_bets_before_limitation,
      project_bets_before_limitation,
      limitation_type, observacoes
    ) VALUES (
      NEW.id, NEW.projeto_id, NEW.user_id, NEW.workspace_id,
      now(),
      COALESCE((SELECT count(*) FROM apostas_unificada a WHERE a.bookmaker_id = NEW.id AND a.workspace_id = NEW.workspace_id), 0),
      COALESCE((SELECT count(*) FROM apostas_unificada a WHERE a.bookmaker_id = NEW.id AND a.projeto_id = NEW.projeto_id), 0),
      'full_limit',
      'Registrado automaticamente ao limitar conta'
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_auto_limitation_event ON public.bookmakers;
CREATE TRIGGER trg_auto_limitation_event
  AFTER UPDATE ON public.bookmakers
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_auto_create_limitation_event();
