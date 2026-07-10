-- Remove obsolete trigger that references extinct enum value 'perda'
-- The enum ocorrencia_resultado_financeiro now uses: sem_impacto | perda_confirmada | perda_parcial.
-- The trigger's condition `NEW.resultado_financeiro = 'perda'` raises
-- "invalid input value for enum" on every UPDATE, blocking resolution of ocorrências.
-- Financial impact (débito de saldo + projeto_perdas) is handled application-side
-- via registrarPerdaOperacionalViaLedger, so this trigger is redundant.

DROP TRIGGER IF EXISTS tr_ocorrencia_finance ON public.ocorrencias;
DROP FUNCTION IF EXISTS public.handle_ocorrencia_financial_impact();