-- =====================================================
-- ARQUITETURA UNIFICADA DE CICLOS FINANCEIROS
-- =====================================================

-- 1. ADICIONAR CAMPOS DE CONFIGURAÇÃO DE GATILHO EM operador_projetos
ALTER TABLE public.operador_projetos
ADD COLUMN IF NOT EXISTS tipo_gatilho text NOT NULL DEFAULT 'TEMPO',
ADD COLUMN IF NOT EXISTS meta_volume numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS periodo_maximo_dias integer DEFAULT 30,
ADD COLUMN IF NOT EXISTS periodo_minimo_dias integer DEFAULT 7,
ADD COLUMN IF NOT EXISTS metrica_acumuladora text NOT NULL DEFAULT 'LUCRO';

-- 2. EXPANDIR TABELA projeto_ciclos PARA SUPORTAR VOLUME
ALTER TABLE public.projeto_ciclos
ADD COLUMN IF NOT EXISTS operador_projeto_id uuid REFERENCES public.operador_projetos(id),
ADD COLUMN IF NOT EXISTS tipo_gatilho text NOT NULL DEFAULT 'TEMPO',
ADD COLUMN IF NOT EXISTS meta_volume numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS metrica_acumuladora text DEFAULT 'LUCRO',
ADD COLUMN IF NOT EXISTS valor_acumulado numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS excedente_anterior numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS excedente_proximo numeric NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS gatilho_fechamento text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS data_fechamento timestamp with time zone DEFAULT NULL,
ADD COLUMN IF NOT EXISTS valor_pagamento_calculado numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS pagamento_aprovado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS data_aprovacao timestamp with time zone DEFAULT NULL;

-- 3. ATUALIZAR pagamentos_propostos
ALTER TABLE public.pagamentos_propostos
ADD COLUMN IF NOT EXISTS tipo_gatilho text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS meta_volume_atingida numeric DEFAULT NULL,
ADD COLUMN IF NOT EXISTS metrica_acumuladora text DEFAULT NULL;