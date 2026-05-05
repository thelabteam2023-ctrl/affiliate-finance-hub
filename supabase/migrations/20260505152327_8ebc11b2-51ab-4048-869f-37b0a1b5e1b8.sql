-- 1. Criar tabela de entradas (execução real das apostas)
CREATE TABLE public.apostas_perna_entradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perna_id UUID NOT NULL REFERENCES public.apostas_pernas(id) ON DELETE CASCADE,
  bookmaker_id UUID NOT NULL REFERENCES public.bookmakers(id),
  
  -- Dados da execução
  stake NUMERIC NOT NULL,
  odd NUMERIC NOT NULL,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  stake_real NUMERIC NOT NULL DEFAULT 0,
  stake_freebet NUMERIC NOT NULL DEFAULT 0,
  
  -- Snapshot financeiro
  stake_brl_referencia NUMERIC,
  cotacao_snapshot NUMERIC,
  cotacao_snapshot_at TIMESTAMPTZ DEFAULT NOW(),
  fonte_saldo TEXT DEFAULT 'REAL',
  
  -- Metadados
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Índices de performance
CREATE INDEX idx_apostas_perna_entradas_perna ON public.apostas_perna_entradas(perna_id);
CREATE INDEX idx_apostas_perna_entradas_bookmaker ON public.apostas_perna_entradas(bookmaker_id);

-- 3. Migrar dados existentes (cada perna atual vira uma entrada dela mesma)
INSERT INTO public.apostas_perna_entradas (
  perna_id, bookmaker_id, stake, odd, moeda, 
  stake_real, stake_freebet, stake_brl_referencia, 
  cotacao_snapshot, cotacao_snapshot_at, fonte_saldo,
  created_at, updated_at
)
SELECT 
  id, bookmaker_id, stake, odd, moeda, 
  COALESCE(stake_real, 0), COALESCE(stake_freebet, 0), stake_brl_referencia, 
  cotacao_snapshot, cotacao_snapshot_at, COALESCE(fonte_saldo, 'REAL'),
  created_at, updated_at
FROM public.apostas_pernas;

-- 4. Ajustar RLS para a nova tabela
ALTER TABLE public.apostas_perna_entradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários podem ver entradas de suas pernas"
ON public.apostas_perna_entradas FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.apostas_pernas ap
    JOIN public.apostas_unificada au ON au.id = ap.aposta_id
    WHERE ap.id = apostas_perna_entradas.perna_id
    AND au.user_id = auth.uid()
  )
);

CREATE POLICY "Usuários podem gerenciar entradas de suas pernas"
ON public.apostas_perna_entradas FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.apostas_pernas ap
    JOIN public.apostas_unificada au ON au.id = ap.aposta_id
    WHERE ap.id = apostas_perna_entradas.perna_id
    AND au.user_id = auth.uid()
  )
);

-- 5. Trigger para updated_at
CREATE TRIGGER update_apostas_perna_entradas_updated_at
BEFORE UPDATE ON public.apostas_perna_entradas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Comentários
COMMENT ON TABLE public.apostas_perna_entradas IS 'Execuções individuais de uma perna de aposta. Suporta múltiplas entradas (multi-casas/moedas) para o mesmo cenário lógico.';
