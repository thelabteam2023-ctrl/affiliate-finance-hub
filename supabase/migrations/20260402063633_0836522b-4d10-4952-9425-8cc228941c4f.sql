CREATE POLICY "No direct access to financial debug log"
ON public.financial_debug_log
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);