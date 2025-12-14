-- Add conciliation tracking fields to operador_projetos
ALTER TABLE public.operador_projetos
ADD COLUMN IF NOT EXISTS proxima_conciliacao DATE,
ADD COLUMN IF NOT EXISTS ultima_conciliacao DATE,
ADD COLUMN IF NOT EXISTS dias_intervalo_conciliacao INTEGER DEFAULT 15;

-- Update frequencia_conciliacao to allow CUSTOMIZADO
-- First, update any existing QUINZENAL to CUSTOMIZADO with 15 days interval
UPDATE public.operador_projetos 
SET dias_intervalo_conciliacao = 15,
    frequencia_conciliacao = 'CUSTOMIZADO'
WHERE frequencia_conciliacao = 'QUINZENAL';

-- Create function to calculate next conciliation date
CREATE OR REPLACE FUNCTION public.calcular_proxima_conciliacao(
  p_frequencia TEXT,
  p_data_entrada DATE,
  p_ultima_conciliacao DATE,
  p_dias_intervalo INTEGER DEFAULT 15
)
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_hoje DATE := CURRENT_DATE;
  v_base_calculo DATE;
  v_proxima DATE;
BEGIN
  CASE p_frequencia
    -- SEMANAL: próxima segunda-feira
    WHEN 'SEMANAL' THEN
      -- 1=Monday in ISO format (date_part('isodow', ...))
      v_proxima := v_hoje + (8 - EXTRACT(ISODOW FROM v_hoje)::INTEGER) % 7;
      -- Se hoje é segunda, próxima é a próxima segunda (7 dias)
      IF v_proxima = v_hoje THEN
        v_proxima := v_hoje + 7;
      END IF;
      
    -- MENSAL: próximo dia 1º do mês
    WHEN 'MENSAL' THEN
      v_proxima := DATE_TRUNC('month', v_hoje) + INTERVAL '1 month';
      
    -- CUSTOMIZADO: a cada X dias a partir da data de entrada ou última conciliação
    WHEN 'CUSTOMIZADO' THEN
      v_base_calculo := COALESCE(p_ultima_conciliacao, p_data_entrada);
      -- Calcular próximo intervalo
      v_proxima := v_base_calculo + (p_dias_intervalo * INTERVAL '1 day');
      -- Se já passou, calcular o próximo ciclo
      WHILE v_proxima < v_hoje LOOP
        v_proxima := v_proxima + (p_dias_intervalo * INTERVAL '1 day');
      END LOOP;
      
    ELSE
      -- Default: 30 dias
      v_proxima := v_hoje + INTERVAL '30 days';
  END CASE;
  
  RETURN v_proxima;
END;
$function$;

-- Create trigger function to auto-calculate proxima_conciliacao on insert/update
CREATE OR REPLACE FUNCTION public.trigger_calcular_proxima_conciliacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only calculate if frequencia_conciliacao is set
  IF NEW.frequencia_conciliacao IS NOT NULL THEN
    NEW.proxima_conciliacao := public.calcular_proxima_conciliacao(
      NEW.frequencia_conciliacao,
      NEW.data_entrada,
      NEW.ultima_conciliacao,
      COALESCE(NEW.dias_intervalo_conciliacao, 15)
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger
DROP TRIGGER IF EXISTS tr_calcular_proxima_conciliacao ON public.operador_projetos;
CREATE TRIGGER tr_calcular_proxima_conciliacao
BEFORE INSERT OR UPDATE OF frequencia_conciliacao, data_entrada, ultima_conciliacao, dias_intervalo_conciliacao
ON public.operador_projetos
FOR EACH ROW
EXECUTE FUNCTION public.trigger_calcular_proxima_conciliacao();

-- Update existing records to calculate proxima_conciliacao
UPDATE public.operador_projetos
SET proxima_conciliacao = public.calcular_proxima_conciliacao(
  frequencia_conciliacao,
  data_entrada,
  ultima_conciliacao,
  COALESCE(dias_intervalo_conciliacao, 15)
)
WHERE frequencia_conciliacao IS NOT NULL AND status = 'ATIVO';