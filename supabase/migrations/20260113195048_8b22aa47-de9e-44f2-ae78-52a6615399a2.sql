-- ============================================
-- MIGRAÇÃO: Cashback Manual Operacional
-- ============================================

-- Criar nova tabela simplificada para cashback manual
CREATE TABLE public.cashback_manual (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id) ON DELETE RESTRICT,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  
  -- Dados do lançamento
  valor NUMERIC NOT NULL,
  data_credito DATE NOT NULL DEFAULT CURRENT_DATE,
  observacoes TEXT,
  
  -- Integração financeira
  cash_ledger_id UUID REFERENCES public.cash_ledger(id),
  
  -- Snapshot de moeda para auditoria
  moeda_operacao VARCHAR(10) NOT NULL DEFAULT 'BRL',
  cotacao_snapshot NUMERIC,
  cotacao_snapshot_at TIMESTAMPTZ,
  valor_brl_referencia NUMERIC,
  
  -- Metadados
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_cashback_manual_projeto ON public.cashback_manual(projeto_id);
CREATE INDEX idx_cashback_manual_bookmaker ON public.cashback_manual(bookmaker_id);
CREATE INDEX idx_cashback_manual_workspace ON public.cashback_manual(workspace_id);
CREATE INDEX idx_cashback_manual_data ON public.cashback_manual(data_credito);

-- Enable RLS
ALTER TABLE public.cashback_manual ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários podem ver cashback do próprio workspace"
  ON public.cashback_manual FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem criar cashback no próprio workspace"
  ON public.cashback_manual FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem atualizar cashback do próprio workspace"
  ON public.cashback_manual FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Usuários podem deletar cashback do próprio workspace"
  ON public.cashback_manual FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Trigger para updated_at
CREATE TRIGGER update_cashback_manual_updated_at
  BEFORE UPDATE ON public.cashback_manual
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários
COMMENT ON TABLE public.cashback_manual IS 'Lançamentos manuais de cashback já recebidos';
COMMENT ON COLUMN public.cashback_manual.valor IS 'Valor do cashback já creditado na casa';
COMMENT ON COLUMN public.cashback_manual.data_credito IS 'Data em que o cashback foi creditado';
COMMENT ON COLUMN public.cashback_manual.cash_ledger_id IS 'Referência ao lançamento financeiro que impactou o saldo';