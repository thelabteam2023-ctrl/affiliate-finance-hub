-- 1. Adicionar novo modelo de pagamento PROPORCIONAL_LUCRO (o schema já aceita qualquer string no campo modelo_pagamento)

-- 2. Criar view para calcular lucro de projetos baseado em apostas
CREATE OR REPLACE VIEW public.v_projeto_lucro_operador
WITH (security_invoker = on)
AS
SELECT 
  op.id AS operador_projeto_id,
  op.operador_id,
  op.projeto_id,
  op.user_id,
  op.modelo_pagamento,
  op.valor_fixo,
  op.percentual,
  op.base_calculo,
  op.frequencia_entrega,
  op.meta_valor,
  op.meta_percentual,
  op.tipo_meta,
  op.faixas_escalonadas,
  op.status,
  o.nome AS operador_nome,
  p.nome AS projeto_nome,
  -- Calcular lucro do projeto baseado em apostas finalizadas
  COALESCE((
    SELECT SUM(a.lucro_prejuizo)
    FROM public.apostas a
    WHERE a.projeto_id = op.projeto_id
    AND a.resultado IS NOT NULL
    AND a.resultado NOT IN ('PENDENTE', 'VOID')
  ), 0) AS lucro_projeto,
  -- Calcular faturamento (volume apostado)
  COALESCE((
    SELECT SUM(a.stake)
    FROM public.apostas a
    WHERE a.projeto_id = op.projeto_id
    AND a.resultado IS NOT NULL
    AND a.resultado NOT IN ('PENDENTE')
  ), 0) AS faturamento_projeto,
  -- Calcular total apostas
  COALESCE((
    SELECT COUNT(*)
    FROM public.apostas a
    WHERE a.projeto_id = op.projeto_id
    AND a.resultado IS NOT NULL
    AND a.resultado NOT IN ('PENDENTE')
  ), 0) AS total_apostas,
  -- Calcular apostas ganhas
  COALESCE((
    SELECT COUNT(*)
    FROM public.apostas a
    WHERE a.projeto_id = op.projeto_id
    AND a.resultado IN ('GREEN', 'MEIO_GREEN', 'GREEN_BOOKMAKER')
  ), 0) AS apostas_ganhas,
  -- Total depositado no projeto
  COALESCE((
    SELECT SUM(cl.valor)
    FROM public.cash_ledger cl
    JOIN public.bookmakers b ON cl.destino_bookmaker_id = b.id
    WHERE b.projeto_id = op.projeto_id
    AND cl.tipo_transacao = 'DEPOSITO'
    AND cl.status = 'CONFIRMADO'
  ), 0) AS total_depositado,
  -- Total sacado do projeto
  COALESCE((
    SELECT SUM(cl.valor)
    FROM public.cash_ledger cl
    JOIN public.bookmakers b ON cl.origem_bookmaker_id = b.id
    WHERE b.projeto_id = op.projeto_id
    AND cl.tipo_transacao = 'SAQUE'
    AND cl.status = 'CONFIRMADO'
  ), 0) AS total_sacado
FROM public.operador_projetos op
JOIN public.operadores o ON op.operador_id = o.id
JOIN public.projetos p ON op.projeto_id = p.id
WHERE op.user_id = auth.uid();

-- 3. Criar tabela para alertas de marcos de lucro de parceiros
CREATE TABLE IF NOT EXISTS public.parceiro_lucro_alertas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  parceiro_id UUID NOT NULL REFERENCES public.parceiros(id) ON DELETE CASCADE,
  marco_valor NUMERIC NOT NULL,
  lucro_atual NUMERIC NOT NULL,
  data_atingido TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  notificado BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.parceiro_lucro_alertas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own alertas" ON public.parceiro_lucro_alertas
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own alertas" ON public.parceiro_lucro_alertas
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own alertas" ON public.parceiro_lucro_alertas
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own alertas" ON public.parceiro_lucro_alertas
FOR DELETE USING (auth.uid() = user_id);

-- 4. Criar view para calcular lucro total de parceiros (incluindo projetos)
CREATE OR REPLACE VIEW public.v_parceiro_lucro_total
WITH (security_invoker = on)
AS
SELECT 
  p.id AS parceiro_id,
  p.user_id,
  p.nome,
  p.cpf,
  p.status,
  -- Lucro de depósitos/saques (fluxo de caixa)
  COALESCE((
    SELECT SUM(CASE 
      WHEN cl.tipo_transacao = 'SAQUE' AND cl.destino_parceiro_id = p.id THEN cl.valor
      WHEN cl.tipo_transacao = 'DEPOSITO' AND cl.origem_parceiro_id = p.id THEN -cl.valor
      ELSE 0
    END)
    FROM public.cash_ledger cl
    WHERE (cl.destino_parceiro_id = p.id OR cl.origem_parceiro_id = p.id)
    AND cl.status = 'CONFIRMADO'
    AND cl.tipo_transacao IN ('DEPOSITO', 'SAQUE')
  ), 0) AS lucro_fluxo_caixa,
  -- Lucro de apostas em projetos vinculados ao parceiro (via bookmakers)
  COALESCE((
    SELECT SUM(a.lucro_prejuizo)
    FROM public.apostas a
    JOIN public.bookmakers b ON a.bookmaker_id = b.id
    WHERE b.parceiro_id = p.id
    AND a.resultado IS NOT NULL
    AND a.resultado NOT IN ('PENDENTE', 'VOID')
  ), 0) AS lucro_projetos,
  -- Saldo atual em bookmakers
  COALESCE((
    SELECT SUM(b.saldo_atual)
    FROM public.bookmakers b
    WHERE b.parceiro_id = p.id
  ), 0) AS saldo_bookmakers,
  -- Total depositado via parceiro
  COALESCE((
    SELECT SUM(cl.valor)
    FROM public.cash_ledger cl
    WHERE cl.origem_parceiro_id = p.id
    AND cl.tipo_transacao = 'DEPOSITO'
    AND cl.status = 'CONFIRMADO'
  ), 0) AS total_depositado,
  -- Total sacado para parceiro
  COALESCE((
    SELECT SUM(cl.valor)
    FROM public.cash_ledger cl
    WHERE cl.destino_parceiro_id = p.id
    AND cl.tipo_transacao = 'SAQUE'
    AND cl.status = 'CONFIRMADO'
  ), 0) AS total_sacado
FROM public.parceiros p
WHERE p.user_id = auth.uid();

-- 5. View para dashboard de comparação de operadores
CREATE OR REPLACE VIEW public.v_operador_comparativo
WITH (security_invoker = on)
AS
SELECT 
  o.id AS operador_id,
  o.user_id,
  o.nome,
  o.cpf,
  o.status,
  o.tipo_contrato,
  -- Projetos ativos
  (SELECT COUNT(*) FROM public.operador_projetos op WHERE op.operador_id = o.id AND op.status = 'ATIVO') AS projetos_ativos,
  -- Lucro total gerado em todos os projetos
  COALESCE((
    SELECT SUM(a.lucro_prejuizo)
    FROM public.apostas a
    JOIN public.bookmakers b ON a.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE a.resultado IS NOT NULL
    AND a.resultado NOT IN ('PENDENTE', 'VOID')
  ), 0) AS lucro_total_gerado,
  -- Total apostas
  COALESCE((
    SELECT COUNT(*)
    FROM public.apostas a
    JOIN public.bookmakers b ON a.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE a.resultado IS NOT NULL
    AND a.resultado NOT IN ('PENDENTE')
  ), 0) AS total_apostas,
  -- Apostas ganhas
  COALESCE((
    SELECT COUNT(*)
    FROM public.apostas a
    JOIN public.bookmakers b ON a.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE a.resultado IN ('GREEN', 'MEIO_GREEN', 'GREEN_BOOKMAKER')
  ), 0) AS apostas_ganhas,
  -- Total volume apostado
  COALESCE((
    SELECT SUM(a.stake)
    FROM public.apostas a
    JOIN public.bookmakers b ON a.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE a.resultado IS NOT NULL
    AND a.resultado NOT IN ('PENDENTE')
  ), 0) AS volume_total,
  -- Total pago ao operador
  (SELECT COALESCE(SUM(valor), 0) FROM public.pagamentos_operador po WHERE po.operador_id = o.id AND po.status = 'CONFIRMADO') AS total_pago,
  -- Total pendente
  (SELECT COALESCE(SUM(valor), 0) FROM public.pagamentos_operador po WHERE po.operador_id = o.id AND po.status = 'PENDENTE') AS total_pendente
FROM public.operadores o
WHERE o.user_id = auth.uid();