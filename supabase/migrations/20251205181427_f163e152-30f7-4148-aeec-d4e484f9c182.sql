-- Update function to use Brazil timezone
CREATE OR REPLACE FUNCTION public.update_parcerias_em_encerramento()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.parcerias
  SET status = 'EM_ENCERRAMENTO', updated_at = now()
  WHERE status = 'ATIVA'
    AND (data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) <= 10
    AND (data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) > 0;
END;
$function$;