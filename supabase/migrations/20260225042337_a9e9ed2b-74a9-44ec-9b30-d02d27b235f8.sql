
-- Add categoria column and make bookmaker_catalogo_id nullable in community_topics
-- This supports the new topic-centric community hub model

-- 1. Make bookmaker_catalogo_id nullable (casa becomes optional tag)
ALTER TABLE public.community_topics 
  ALTER COLUMN bookmaker_catalogo_id DROP NOT NULL;

-- 2. Add categoria column (required for all topics)
ALTER TABLE public.community_topics 
  ADD COLUMN categoria text NOT NULL DEFAULT 'casas_de_aposta';

-- 3. Add comment to document valid categories
COMMENT ON COLUMN public.community_topics.categoria IS 'Valid categories: casas_de_aposta, bancos, bonus_e_promocoes, pagamentos_e_saques, estrategias, alertas';

-- 4. Update the view to include categoria and comment counts
CREATE OR REPLACE VIEW public.v_community_bookmaker_stats AS
SELECT 
    bc.id AS bookmaker_catalogo_id,
    bc.nome,
    bc.logo_url,
    bc.status AS regulamentacao_status,
    bc.visibility,
    count(DISTINCT ce.id) AS total_avaliacoes,
    round(avg(ce.nota_media), 1) AS nota_media_geral,
    round(avg(ce.velocidade_pagamento), 1) AS media_velocidade_pagamento,
    round(avg(ce.facilidade_verificacao), 1) AS media_facilidade_verificacao,
    round(avg(ce.estabilidade_conta), 1) AS media_estabilidade_conta,
    round(avg(ce.qualidade_suporte), 1) AS media_qualidade_suporte,
    round(avg(ce.confiabilidade_geral), 1) AS media_confiabilidade_geral,
    count(ce.id) FILTER (WHERE ce.status_bloqueio = 'BLOQUEOU_APOS_GANHOS') AS bloqueios_apos_ganhos,
    count(ce.id) FILTER (WHERE ce.status_bloqueio = 'BLOQUEIO_RECORRENTE') AS bloqueios_recorrentes,
    count(DISTINCT ct.id) FILTER (WHERE ct.status = 'ATIVO') AS total_topicos,
    max(ct.created_at) FILTER (WHERE ct.status = 'ATIVO') AS ultimo_topico_data
FROM bookmakers_catalogo bc
    LEFT JOIN community_evaluations ce ON ce.bookmaker_catalogo_id = bc.id
    LEFT JOIN community_topics ct ON ct.bookmaker_catalogo_id = bc.id
WHERE bc.visibility = 'GLOBAL_REGULATED'::bookmaker_visibility
GROUP BY bc.id, bc.nome, bc.logo_url, bc.status, bc.visibility;
