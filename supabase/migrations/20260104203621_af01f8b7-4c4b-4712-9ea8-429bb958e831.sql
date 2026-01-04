
-- Tabela para registrar acknowledgments de casas desvinculadas
-- Quando usuário clica em "Estou ciente", registra aqui e o alerta não aparece mais
CREATE TABLE public.bookmaker_unlinked_acks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  acknowledged_by UUID NOT NULL,
  acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reason TEXT, -- Motivo opcional
  UNIQUE(bookmaker_id, workspace_id)
);

-- Enable RLS
ALTER TABLE public.bookmaker_unlinked_acks ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view acks in their workspace"
ON public.bookmaker_unlinked_acks
FOR SELECT
USING (workspace_id = get_current_workspace());

CREATE POLICY "Users can insert acks in their workspace"
ON public.bookmaker_unlinked_acks
FOR INSERT
WITH CHECK (workspace_id = get_current_workspace());

CREATE POLICY "Users can delete acks in their workspace"
ON public.bookmaker_unlinked_acks
FOR DELETE
USING (workspace_id = get_current_workspace());

-- View para casas desvinculadas com saldo pendente (sem acknowledge)
CREATE OR REPLACE VIEW public.v_bookmakers_desvinculados AS
SELECT 
  b.id,
  b.nome,
  b.status,
  b.saldo_atual,
  b.saldo_usd,
  b.saldo_freebet,
  b.moeda,
  b.workspace_id,
  b.parceiro_id,
  p.nome as parceiro_nome,
  CASE 
    WHEN b.moeda IN ('USD', 'USDT') THEN b.saldo_usd
    ELSE b.saldo_atual
  END as saldo_efetivo,
  COALESCE(b.saldo_atual, 0) + COALESCE(b.saldo_usd, 0) + COALESCE(b.saldo_freebet, 0) as saldo_total
FROM bookmakers b
LEFT JOIN parceiros p ON b.parceiro_id = p.id
LEFT JOIN bookmaker_unlinked_acks ack ON ack.bookmaker_id = b.id AND ack.workspace_id = b.workspace_id
WHERE b.projeto_id IS NULL 
  AND b.status = 'ATIVO'
  AND (b.saldo_atual > 0 OR b.saldo_usd > 0 OR b.saldo_freebet > 0)
  AND ack.id IS NULL -- Não foi acknowledged
  AND b.workspace_id = get_current_workspace();

COMMENT ON VIEW public.v_bookmakers_desvinculados IS 'Casas de apostas desvinculadas de projetos que possuem saldo pendente e não foram reconhecidas (acknowledged)';
