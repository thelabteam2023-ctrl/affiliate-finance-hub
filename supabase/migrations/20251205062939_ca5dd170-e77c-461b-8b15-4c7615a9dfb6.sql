-- Criar tabela de entregas
CREATE TABLE public.entregas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  operador_projeto_id UUID NOT NULL REFERENCES operador_projetos(id) ON DELETE CASCADE,
  
  -- Identificação do ciclo
  numero_entrega INTEGER NOT NULL DEFAULT 1,
  descricao TEXT,
  
  -- Período/Meta
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim_prevista DATE,
  data_fim_real DATE,
  
  -- Gatilho de conciliação
  tipo_gatilho TEXT NOT NULL DEFAULT 'PERIODO',
  
  -- Meta (para POR_ENTREGA)
  tipo_meta TEXT,
  meta_valor NUMERIC,
  meta_percentual NUMERIC,
  base_calculo TEXT,
  
  -- Saldo inicial (excedente da entrega anterior)
  saldo_inicial NUMERIC DEFAULT 0,
  
  -- Resultado
  resultado_nominal NUMERIC DEFAULT 0,
  resultado_real NUMERIC,
  
  -- Conciliação
  conciliado BOOLEAN DEFAULT FALSE,
  data_conciliacao TIMESTAMP WITH TIME ZONE,
  ajuste NUMERIC DEFAULT 0,
  tipo_ajuste TEXT,
  observacoes_conciliacao TEXT,
  
  -- Pagamento ao operador
  valor_pagamento_operador NUMERIC DEFAULT 0,
  pagamento_realizado BOOLEAN DEFAULT FALSE,
  data_pagamento TIMESTAMP WITH TIME ZONE,
  
  -- Excedente para próxima entrega
  excedente_proximo NUMERIC DEFAULT 0,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'EM_ANDAMENTO',
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Adicionar colunas em operador_projetos
ALTER TABLE public.operador_projetos
ADD COLUMN IF NOT EXISTS frequencia_entrega TEXT DEFAULT 'MENSAL',
ADD COLUMN IF NOT EXISTS faixas_escalonadas JSONB,
ADD COLUMN IF NOT EXISTS tipo_meta TEXT,
ADD COLUMN IF NOT EXISTS meta_valor NUMERIC,
ADD COLUMN IF NOT EXISTS meta_percentual NUMERIC;

-- Enable RLS
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own entregas"
ON public.entregas FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entregas"
ON public.entregas FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entregas"
ON public.entregas FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own entregas"
ON public.entregas FOR DELETE
USING (auth.uid() = user_id);

-- Trigger para updated_at
CREATE TRIGGER update_entregas_updated_at
BEFORE UPDATE ON public.entregas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- View para entregas pendentes de conciliação
CREATE OR REPLACE VIEW public.v_entregas_pendentes AS
SELECT 
  e.id,
  e.user_id,
  e.operador_projeto_id,
  e.numero_entrega,
  e.descricao,
  e.data_inicio,
  e.data_fim_prevista,
  e.tipo_gatilho,
  e.tipo_meta,
  e.meta_valor,
  e.meta_percentual,
  e.base_calculo,
  e.saldo_inicial,
  e.resultado_nominal,
  e.status,
  e.created_at,
  op.operador_id,
  op.projeto_id,
  op.modelo_pagamento,
  op.valor_fixo,
  op.percentual,
  o.nome as operador_nome,
  p.nome as projeto_nome,
  CASE 
    WHEN e.tipo_gatilho = 'META_ATINGIDA' AND e.resultado_nominal >= COALESCE(e.meta_valor, 0) THEN 'PRONTA'
    WHEN e.tipo_gatilho = 'PERIODO' AND e.data_fim_prevista <= CURRENT_DATE THEN 'PRONTA'
    ELSE 'EM_ANDAMENTO'
  END as status_conciliacao,
  CASE 
    WHEN e.tipo_gatilho = 'META_ATINGIDA' AND e.resultado_nominal >= COALESCE(e.meta_valor, 0) THEN 'CRITICA'
    WHEN e.tipo_gatilho = 'PERIODO' AND e.data_fim_prevista <= CURRENT_DATE THEN 'ALTA'
    WHEN e.tipo_gatilho = 'PERIODO' AND e.data_fim_prevista <= CURRENT_DATE + INTERVAL '3 days' THEN 'NORMAL'
    ELSE 'BAIXA'
  END as nivel_urgencia
FROM public.entregas e
JOIN public.operador_projetos op ON e.operador_projeto_id = op.id
JOIN public.operadores o ON op.operador_id = o.id
JOIN public.projetos p ON op.projeto_id = p.id
WHERE e.status = 'EM_ANDAMENTO'
  AND e.conciliado = FALSE;

-- View para operadores sem entrega ativa
CREATE OR REPLACE VIEW public.v_operadores_sem_entrega AS
SELECT 
  op.id as operador_projeto_id,
  op.operador_id,
  op.projeto_id,
  op.modelo_pagamento,
  op.status,
  op.user_id,
  o.nome as operador_nome,
  p.nome as projeto_nome
FROM public.operador_projetos op
JOIN public.operadores o ON op.operador_id = o.id
JOIN public.projetos p ON op.projeto_id = p.id
WHERE op.status = 'ATIVO'
  AND NOT EXISTS (
    SELECT 1 FROM public.entregas e 
    WHERE e.operador_projeto_id = op.id 
    AND e.status = 'EM_ANDAMENTO'
  );