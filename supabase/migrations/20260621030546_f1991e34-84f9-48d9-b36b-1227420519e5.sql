
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.bookmakers WHERE nome IN ('__T_BK_A__','__T_BK_B__') LOOP
    DELETE FROM public.financial_events WHERE bookmaker_id = r.id;
    DELETE FROM public.apostas_perna_entradas WHERE perna_id IN (SELECT id FROM public.apostas_pernas WHERE bookmaker_id=r.id OR aposta_id IN (SELECT id FROM public.apostas_unificada WHERE bookmaker_id=r.id));
    DELETE FROM public.apostas_pernas WHERE bookmaker_id=r.id OR aposta_id IN (SELECT id FROM public.apostas_unificada WHERE bookmaker_id=r.id);
    DELETE FROM public.apostas_unificada WHERE bookmaker_id=r.id OR id IN (SELECT aposta_id FROM public.apostas_pernas WHERE bookmaker_id=r.id);
    DELETE FROM public.projeto_bookmaker_historico WHERE bookmaker_id=r.id;
    DELETE FROM public.bookmakers WHERE id=r.id;
  END LOOP;
END$$;

DROP TABLE IF EXISTS public.__phase3_test_report;
DROP TABLE IF EXISTS public.__phase3_evidence;
