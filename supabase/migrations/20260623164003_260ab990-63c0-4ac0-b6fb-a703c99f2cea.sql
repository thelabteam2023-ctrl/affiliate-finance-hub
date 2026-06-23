-- Alinha RLS de apostas_perna_entradas ao escopo de workspace
-- (paridade com apostas_unificada e apostas_pernas)

DROP POLICY IF EXISTS "Usuários podem ver entradas de suas pernas" ON public.apostas_perna_entradas;
DROP POLICY IF EXISTS "Usuários podem gerenciar entradas de suas pernas" ON public.apostas_perna_entradas;

CREATE POLICY "Membros do workspace podem ver entradas de pernas"
ON public.apostas_perna_entradas
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.apostas_pernas ap
    JOIN public.apostas_unificada au ON au.id = ap.aposta_id
    WHERE ap.id = apostas_perna_entradas.perna_id
      AND au.workspace_id = public.get_current_workspace()
  )
);

CREATE POLICY "Membros do workspace podem gerenciar entradas de pernas"
ON public.apostas_perna_entradas
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM public.apostas_pernas ap
    JOIN public.apostas_unificada au ON au.id = ap.aposta_id
    WHERE ap.id = apostas_perna_entradas.perna_id
      AND au.workspace_id = public.get_current_workspace()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.apostas_pernas ap
    JOIN public.apostas_unificada au ON au.id = ap.aposta_id
    WHERE ap.id = apostas_perna_entradas.perna_id
      AND au.workspace_id = public.get_current_workspace()
  )
);