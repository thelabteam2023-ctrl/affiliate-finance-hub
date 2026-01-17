
-- ============================================
-- REFACTOR: Normalização de pernas de apostas
-- Elimina dependência de JSONB para cálculos financeiros
-- ============================================

-- 1. Criar tabela normalizada para pernas
CREATE TABLE public.apostas_pernas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aposta_id UUID NOT NULL REFERENCES public.apostas_unificada(id) ON DELETE CASCADE,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id),
  ordem INT NOT NULL DEFAULT 0,
  
  -- Dados da posição
  selecao TEXT NOT NULL,
  selecao_livre TEXT,
  odd NUMERIC NOT NULL,
  stake NUMERIC NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  
  -- Snapshot de conversão para BRL
  stake_brl_referencia NUMERIC,
  cotacao_snapshot NUMERIC,
  cotacao_snapshot_at TIMESTAMPTZ,
  
  -- Resultado
  resultado TEXT CHECK (resultado IN ('PENDENTE', 'GREEN', 'RED', 'MEIO_GREEN', 'MEIO_RED', 'VOID')),
  lucro_prejuizo NUMERIC,
  lucro_prejuizo_brl_referencia NUMERIC,
  
  -- FreeBet
  gerou_freebet BOOLEAN DEFAULT FALSE,
  valor_freebet_gerada NUMERIC,
  
  -- Metadados
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint de unicidade
  UNIQUE(aposta_id, ordem)
);

-- 2. Índices para performance em queries financeiras
CREATE INDEX idx_apostas_pernas_bookmaker ON public.apostas_pernas(bookmaker_id);
CREATE INDEX idx_apostas_pernas_aposta ON public.apostas_pernas(aposta_id);
CREATE INDEX idx_apostas_pernas_resultado ON public.apostas_pernas(resultado) WHERE resultado IS NOT NULL;

-- 3. Habilitar RLS
ALTER TABLE public.apostas_pernas ENABLE ROW LEVEL SECURITY;

-- 4. Políticas RLS (herdam da aposta pai via join)
CREATE POLICY "Usuários podem ver pernas de suas apostas"
ON public.apostas_pernas
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.apostas_unificada au
    WHERE au.id = apostas_pernas.aposta_id
    AND au.user_id = auth.uid()
  )
);

CREATE POLICY "Usuários podem inserir pernas em suas apostas"
ON public.apostas_pernas
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.apostas_unificada au
    WHERE au.id = apostas_pernas.aposta_id
    AND au.user_id = auth.uid()
  )
);

CREATE POLICY "Usuários podem atualizar pernas de suas apostas"
ON public.apostas_pernas
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.apostas_unificada au
    WHERE au.id = apostas_pernas.aposta_id
    AND au.user_id = auth.uid()
  )
);

CREATE POLICY "Usuários podem deletar pernas de suas apostas"
ON public.apostas_pernas
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.apostas_unificada au
    WHERE au.id = apostas_pernas.aposta_id
    AND au.user_id = auth.uid()
  )
);

-- 5. Trigger para updated_at
CREATE TRIGGER update_apostas_pernas_updated_at
BEFORE UPDATE ON public.apostas_pernas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Comentários para documentação
COMMENT ON TABLE public.apostas_pernas IS 'Tabela normalizada para pernas de apostas multi-bookmaker (SUREBET, ARBITRAGEM, EXTRACAO_BONUS, etc). Substitui o campo JSONB pernas da apostas_unificada.';
COMMENT ON COLUMN public.apostas_pernas.ordem IS 'Ordem da perna dentro da aposta (0, 1, 2...)';
COMMENT ON COLUMN public.apostas_pernas.stake_brl_referencia IS 'Valor em BRL no momento do registro (snapshot imutável)';
COMMENT ON COLUMN public.apostas_pernas.cotacao_snapshot IS 'Cotação USD/BRL usada no momento do registro';
