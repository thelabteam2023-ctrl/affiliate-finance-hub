-- =====================================================
-- FASE 1: REFATORAÇÃO CONCEITUAL - APOSTAS UNIFICADAS
-- =====================================================
-- Conceito: Formulário ≠ Estratégia ≠ Aba
-- forma_registro: Como os dados foram capturados (SIMPLES, MULTIPLA, ARBITRAGEM)
-- estrategia: Classificação lógica que define a ABA (SUREBET, DUPLO_GREEN, VALUEBET, etc.)
-- contexto_operacional: Contexto financeiro (NORMAL, FREEBET, BONUS)

-- 1. Criar tabela unificada
CREATE TABLE public.apostas_unificada (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  projeto_id UUID NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.workspaces(id),
  
  -- ========== CLASSIFICAÇÃO CONCEITUAL (O NÚCLEO DA REFATORAÇÃO) ==========
  forma_registro TEXT NOT NULL DEFAULT 'SIMPLES',        -- 'SIMPLES' | 'MULTIPLA' | 'ARBITRAGEM'
  estrategia TEXT NOT NULL DEFAULT 'PUNTER',             -- Define a ABA de visualização
  contexto_operacional TEXT NOT NULL DEFAULT 'NORMAL',   -- 'NORMAL' | 'FREEBET' | 'BONUS'
  
  -- ========== STATUS E RESULTADO ==========
  data_aposta TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'PENDENTE',               -- 'PENDENTE' | 'LIQUIDADA'
  resultado TEXT,                                         -- 'GREEN' | 'RED' | 'MEIO_GREEN' | 'MEIO_RED' | 'VOID' | 'PENDENTE'
  
  -- ========== DADOS DA APOSTA SIMPLES (forma_registro = 'SIMPLES') ==========
  bookmaker_id UUID REFERENCES public.bookmakers(id),
  esporte TEXT,
  evento TEXT,
  mercado TEXT,
  selecao TEXT,
  odd NUMERIC,
  stake NUMERIC,
  
  -- ========== DADOS PARA MÚLTIPLAS (forma_registro = 'MULTIPLA') ==========
  selecoes JSONB DEFAULT '[]'::jsonb,                    -- Array de seleções [{esporte, evento, mercado, selecao, odd}]
  odd_final NUMERIC,                                      -- Odd combinada
  tipo_multipla TEXT,                                     -- 'DUPLA' | 'TRIPLA' | 'QUADRUPLA' | etc.
  retorno_potencial NUMERIC,
  
  -- ========== DADOS PARA ARBITRAGEM (forma_registro = 'ARBITRAGEM') ==========
  pernas JSONB DEFAULT '[]'::jsonb,                      -- Array de pernas [{bookmaker_id, odd, stake, selecao, is_reference}]
  modelo TEXT,                                            -- '1-2' | '1-X-2' | '1-X-2-DNB' | etc.
  spread_calculado NUMERIC,
  roi_esperado NUMERIC,
  lucro_esperado NUMERIC,
  stake_total NUMERIC,                                    -- Stake total da arbitragem
  
  -- ========== CAMPOS DE COBERTURA (LAY) ==========
  lay_exchange TEXT,
  lay_odd NUMERIC,
  lay_stake NUMERIC,
  lay_liability NUMERIC,
  lay_comissao NUMERIC DEFAULT 5,
  back_em_exchange BOOLEAN DEFAULT false,
  back_comissao NUMERIC DEFAULT 0,
  lado_aposta TEXT,                                       -- 'BACK' | 'LAY'
  
  -- ========== RESULTADOS FINANCEIROS ==========
  valor_retorno NUMERIC,
  lucro_prejuizo NUMERIC,
  roi_real NUMERIC,
  
  -- ========== FREEBETS E BÔNUS ==========
  is_bonus_bet BOOLEAN DEFAULT false,
  tipo_freebet TEXT,                                      -- 'STAKE_RETURNED' | 'STAKE_NOT_RETURNED'
  gerou_freebet BOOLEAN DEFAULT false,
  valor_freebet_gerada NUMERIC DEFAULT 0,
  
  -- ========== METADADOS ==========
  modo_entrada TEXT DEFAULT 'PADRAO',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  cancel_reason TEXT,
  
  -- ========== RELACIONAMENTOS ==========
  aposta_relacionada_id UUID REFERENCES public.apostas_unificada(id),
  surebet_legado_id UUID,                                 -- Referência para surebets migradas
  
  -- ========== MIGRAÇÃO (para rastreabilidade) ==========
  legacy_table TEXT,                                      -- 'apostas' | 'apostas_multiplas' | 'surebets'
  legacy_id UUID
);

-- 2. Criar índices para performance
CREATE INDEX idx_apostas_unificada_projeto ON public.apostas_unificada(projeto_id);
CREATE INDEX idx_apostas_unificada_workspace ON public.apostas_unificada(workspace_id);
CREATE INDEX idx_apostas_unificada_estrategia ON public.apostas_unificada(estrategia);
CREATE INDEX idx_apostas_unificada_forma_registro ON public.apostas_unificada(forma_registro);
CREATE INDEX idx_apostas_unificada_status ON public.apostas_unificada(status);
CREATE INDEX idx_apostas_unificada_data ON public.apostas_unificada(data_aposta);
CREATE INDEX idx_apostas_unificada_bookmaker ON public.apostas_unificada(bookmaker_id);

-- 3. Habilitar RLS
ALTER TABLE public.apostas_unificada ENABLE ROW LEVEL SECURITY;

-- 4. Criar RLS policies (mesmo padrão das outras tabelas)
CREATE POLICY "Workspace isolation apostas_unificada SELECT"
ON public.apostas_unificada FOR SELECT
USING (
  (workspace_id = get_current_workspace()) 
  OR ((workspace_id IS NULL) AND (user_id = auth.uid()))
);

CREATE POLICY "Workspace isolation apostas_unificada INSERT"
ON public.apostas_unificada FOR INSERT
WITH CHECK (
  (workspace_id = get_current_workspace()) 
  AND (user_id = auth.uid())
);

CREATE POLICY "Workspace isolation apostas_unificada UPDATE"
ON public.apostas_unificada FOR UPDATE
USING (
  (workspace_id = get_current_workspace()) 
  OR ((workspace_id IS NULL) AND (user_id = auth.uid()))
);

CREATE POLICY "Workspace isolation apostas_unificada DELETE"
ON public.apostas_unificada FOR DELETE
USING (
  (workspace_id = get_current_workspace()) 
  OR ((workspace_id IS NULL) AND (user_id = auth.uid()))
);

-- 5. Trigger para atualizar updated_at
CREATE TRIGGER update_apostas_unificada_updated_at
BEFORE UPDATE ON public.apostas_unificada
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Migrar registros existentes de surebets (usando colunas corretas)
INSERT INTO public.apostas_unificada (
  user_id,
  projeto_id,
  workspace_id,
  forma_registro,
  estrategia,
  contexto_operacional,
  data_aposta,
  status,
  resultado,
  esporte,
  evento,
  mercado,
  modelo,
  pernas,
  spread_calculado,
  roi_esperado,
  lucro_esperado,
  stake_total,
  lucro_prejuizo,
  roi_real,
  observacoes,
  created_at,
  updated_at,
  legacy_table,
  legacy_id
)
SELECT
  s.user_id,
  s.projeto_id,
  s.workspace_id,
  COALESCE(s.forma_registro, 'ARBITRAGEM') as forma_registro,
  COALESCE(s.estrategia, 'SUREBET') as estrategia,
  COALESCE(s.contexto_operacional, 'NORMAL') as contexto_operacional,
  s.data_operacao as data_aposta,
  s.status,
  s.resultado,
  s.esporte,
  s.evento,
  s.mercado,
  s.modelo,
  s.pernas,
  s.spread_calculado,
  s.roi_esperado,
  s.lucro_esperado,
  s.stake_total,
  s.lucro_real as lucro_prejuizo,
  s.roi_real,
  s.observacoes,
  s.created_at,
  s.updated_at,
  'surebets' as legacy_table,
  s.id as legacy_id
FROM public.surebets s;

-- 7. Criar view de compatibilidade para código legado que lê 'apostas'
CREATE OR REPLACE VIEW public.v_apostas_compat AS
SELECT 
  id,
  user_id,
  projeto_id,
  bookmaker_id,
  data_aposta,
  odd,
  stake,
  aposta_relacionada_id,
  valor_retorno,
  lucro_prejuizo,
  created_at,
  updated_at,
  lay_odd,
  lay_stake,
  lay_liability,
  lay_comissao,
  back_em_exchange,
  back_comissao,
  gerou_freebet,
  valor_freebet_gerada,
  NULL::uuid as surebet_id,
  cancelled_at,
  cancelled_by,
  workspace_id,
  is_bonus_bet,
  esporte,
  evento,
  mercado,
  selecao,
  estrategia,
  status,
  resultado,
  observacoes,
  modo_entrada,
  lay_exchange,
  tipo_freebet,
  cancel_reason,
  forma_registro,
  contexto_operacional
FROM public.apostas_unificada
WHERE forma_registro = 'SIMPLES';

-- 8. Criar view de compatibilidade para 'apostas_multiplas'
CREATE OR REPLACE VIEW public.v_apostas_multiplas_compat AS
SELECT
  id,
  user_id,
  projeto_id,
  bookmaker_id,
  stake,
  odd_final,
  retorno_potencial,
  lucro_prejuizo,
  valor_retorno,
  selecoes,
  gerou_freebet,
  valor_freebet_gerada,
  data_aposta,
  created_at,
  updated_at,
  cancelled_at,
  cancelled_by,
  workspace_id,
  is_bonus_bet,
  status,
  resultado,
  tipo_freebet,
  observacoes,
  cancel_reason,
  estrategia,
  forma_registro,
  contexto_operacional,
  tipo_multipla
FROM public.apostas_unificada
WHERE forma_registro = 'MULTIPLA';

-- 9. Criar view de compatibilidade para 'surebets'
CREATE OR REPLACE VIEW public.v_surebets_compat AS
SELECT
  id,
  user_id,
  projeto_id,
  workspace_id,
  esporte,
  evento,
  mercado,
  modelo,
  pernas,
  stake_total,
  spread_calculado as spread,
  roi_esperado,
  lucro_esperado,
  lucro_prejuizo as lucro_real,
  roi_real,
  data_aposta as data_operacao,
  status,
  resultado,
  observacoes,
  created_at,
  updated_at,
  estrategia,
  contexto_operacional,
  forma_registro
FROM public.apostas_unificada
WHERE forma_registro = 'ARBITRAGEM';

-- 10. Habilitar Realtime para a nova tabela
ALTER PUBLICATION supabase_realtime ADD TABLE public.apostas_unificada;