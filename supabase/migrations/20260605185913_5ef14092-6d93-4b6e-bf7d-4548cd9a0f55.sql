DROP POLICY IF EXISTS "Members can view workspace indisponiveis" ON public.bookmaker_indisponiveis;
DROP POLICY IF EXISTS "Members can insert workspace indisponiveis" ON public.bookmaker_indisponiveis;
DROP POLICY IF EXISTS "Members can delete workspace indisponiveis" ON public.bookmaker_indisponiveis;

CREATE POLICY "Members can view workspace indisponiveis" 
ON public.bookmaker_indisponiveis FOR SELECT 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members 
    WHERE workspace_id = bookmaker_indisponiveis.workspace_id 
    AND user_id = auth.uid() 
    AND is_active = true
  )
);

CREATE POLICY "Members can insert workspace indisponiveis" 
ON public.bookmaker_indisponiveis FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.workspace_members 
    WHERE workspace_id = bookmaker_indisponiveis.workspace_id 
    AND user_id = auth.uid() 
    AND is_active = true
  )
);

CREATE POLICY "Members can delete workspace indisponiveis" 
ON public.bookmaker_indisponiveis FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM public.workspace_members 
    WHERE workspace_id = bookmaker_indisponiveis.workspace_id 
    AND user_id = auth.uid() 
    AND is_active = true
  )
);