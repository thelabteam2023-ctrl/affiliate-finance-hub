-- Remover campos não utilizados da tabela operador_projetos
-- Estes campos eram usados para lógica de gatilho de ciclo que foi removida da UI
ALTER TABLE public.operador_projetos 
  DROP COLUMN IF EXISTS tipo_gatilho,
  DROP COLUMN IF EXISTS periodo_minimo_dias,
  DROP COLUMN IF EXISTS periodo_maximo_dias,
  DROP COLUMN IF EXISTS metrica_acumuladora;