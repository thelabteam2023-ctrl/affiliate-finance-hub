
-- =====================================================================
-- FIX: Include apostas_pernas in bet counting for both views
-- Problem: Surebet secondary legs are only in apostas_pernas,
--          not in apostas_unificada.bookmaker_id, causing 0 count
-- Solution: Count BOTH apostas_unificada (direct) + apostas_pernas
-- =====================================================================

-- 1) Update v_bookmaker_resultado_financeiro to include qtd_apostas
CREATE OR REPLACE VIEW v_bookmaker_resultado_financeiro AS
SELECT 
  b.id AS bookmaker_id,
  b.nome AS bookmaker_nome,
  b.moeda,
  b.workspace_id,
  b.projeto_id,
  b.parceiro_id,
  b.saldo_atual,
  b.saldo_bonus,
  b.saldo_freebet,
  COALESCE(dep.total, 0::numeric) AS deposito_total,
  COALESCE(saq.total, 0::numeric) AS saque_total,
  (COALESCE(saq.total, 0::numeric) + b.saldo_atual - COALESCE(dep.total, 0::numeric)) AS resultado_financeiro_real,
  -- Combined bet count: direct apostas + pernas (secondary legs)
  (
    COALESCE((SELECT count(*) FROM apostas_unificada a 
              WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA'), 0)
    +
    COALESCE((SELECT count(*) FROM apostas_pernas ap 
              WHERE ap.bookmaker_id = b.id AND ap.resultado IS NOT NULL), 0)
  ) AS qtd_apostas
FROM bookmakers b
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(
    CASE WHEN cl.moeda_destino IS NOT NULL THEN COALESCE(cl.valor_destino, cl.valor)
         ELSE cl.valor END
  ), 0::numeric) AS total
  FROM cash_ledger cl
  WHERE cl.destino_bookmaker_id = b.id 
    AND cl.tipo_transacao = 'DEPOSITO' 
    AND cl.status = 'CONFIRMADO'
) dep ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(
    CASE WHEN cl.moeda_origem IS NOT NULL THEN COALESCE(cl.valor_origem, cl.valor)
         ELSE cl.valor END
  ), 0::numeric) AS total
  FROM cash_ledger cl
  WHERE cl.origem_bookmaker_id = b.id 
    AND cl.tipo_transacao = 'SAQUE' 
    AND cl.status = 'CONFIRMADO'
) saq ON true;

-- 2) Update v_bookmaker_resultado_operacional to also count pernas
CREATE OR REPLACE VIEW v_bookmaker_resultado_operacional AS
SELECT 
  b.id AS bookmaker_id,
  b.nome AS bookmaker_nome,
  b.moeda,
  b.workspace_id,
  b.projeto_id,
  b.parceiro_id,
  -- Resultado de apostas diretas
  COALESCE((SELECT sum(COALESCE(a.pl_consolidado, a.lucro_prejuizo))
            FROM apostas_unificada a
            WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA' AND a.resultado IS NOT NULL), 0) AS resultado_apostas,
  -- Resultado de pernas (secondary legs)
  COALESCE((SELECT sum(ap.lucro_prejuizo)
            FROM apostas_pernas ap
            WHERE ap.bookmaker_id = b.id AND ap.resultado IS NOT NULL), 0) AS resultado_pernas,
  -- Giros grátis
  COALESCE((SELECT sum(gg.valor_retorno)
            FROM giros_gratis gg
            WHERE gg.bookmaker_id = b.id AND gg.status = 'confirmado'), 0) AS resultado_giros,
  -- Cashback
  COALESCE((SELECT sum(cm.valor)
            FROM cashback_manual cm
            WHERE cm.bookmaker_id = b.id), 0) AS resultado_cashback,
  -- Bônus líquido
  COALESCE((SELECT sum(cl.valor) FROM cash_ledger cl
            WHERE cl.destino_bookmaker_id = b.id AND cl.tipo_transacao = 'BONUS_CREDITADO'), 0)
  - COALESCE((SELECT sum(cl.valor) FROM cash_ledger cl
              WHERE (cl.origem_bookmaker_id = b.id OR cl.destino_bookmaker_id = b.id)
                AND cl.tipo_transacao = 'AJUSTE_SALDO' AND cl.ajuste_motivo = 'BONUS_CANCELAMENTO'), 0)
  - COALESCE((SELECT sum(cl.valor) FROM cash_ledger cl
              WHERE (cl.origem_bookmaker_id = b.id OR cl.destino_bookmaker_id = b.id)
                AND cl.tipo_transacao = 'BONUS_ESTORNO'), 0)
  AS resultado_bonus,
  -- Total operacional
  COALESCE((SELECT sum(COALESCE(a.pl_consolidado, a.lucro_prejuizo))
            FROM apostas_unificada a
            WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA' AND a.resultado IS NOT NULL), 0)
  + COALESCE((SELECT sum(gg.valor_retorno) FROM giros_gratis gg
              WHERE gg.bookmaker_id = b.id AND gg.status = 'confirmado'), 0)
  + COALESCE((SELECT sum(cm.valor) FROM cashback_manual cm
              WHERE cm.bookmaker_id = b.id), 0)
  + COALESCE((SELECT sum(cl.valor) FROM cash_ledger cl
              WHERE cl.destino_bookmaker_id = b.id AND cl.tipo_transacao = 'BONUS_CREDITADO'), 0)
  - COALESCE((SELECT sum(cl.valor) FROM cash_ledger cl
              WHERE (cl.origem_bookmaker_id = b.id OR cl.destino_bookmaker_id = b.id)
                AND cl.tipo_transacao = 'AJUSTE_SALDO' AND cl.ajuste_motivo = 'BONUS_CANCELAMENTO'), 0)
  - COALESCE((SELECT sum(cl.valor) FROM cash_ledger cl
              WHERE (cl.origem_bookmaker_id = b.id OR cl.destino_bookmaker_id = b.id)
                AND cl.tipo_transacao = 'BONUS_ESTORNO'), 0)
  AS resultado_operacional_total,
  -- FIXED: Combined count including pernas
  (
    COALESCE((SELECT count(*) FROM apostas_unificada a 
              WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA'), 0)
    +
    COALESCE((SELECT count(*) FROM apostas_pernas ap 
              WHERE ap.bookmaker_id = b.id AND ap.resultado IS NOT NULL), 0)
  ) AS qtd_apostas,
  -- Greens/Reds also need to include pernas
  (
    COALESCE((SELECT count(*) FROM apostas_unificada a 
              WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA' 
                AND a.resultado IN ('GREEN', 'MEIO_GREEN')), 0)
    +
    COALESCE((SELECT count(*) FROM apostas_pernas ap 
              WHERE ap.bookmaker_id = b.id 
                AND ap.resultado IN ('GREEN', 'MEIO_GREEN')), 0)
  ) AS qtd_greens,
  (
    COALESCE((SELECT count(*) FROM apostas_unificada a 
              WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA' 
                AND a.resultado IN ('RED', 'MEIO_RED')), 0)
    +
    COALESCE((SELECT count(*) FROM apostas_pernas ap 
              WHERE ap.bookmaker_id = b.id 
                AND ap.resultado IN ('RED', 'MEIO_RED')), 0)
  ) AS qtd_reds
FROM bookmakers b
WHERE b.status IN ('ativo', 'limitada', 'bloqueada', 'pausada');
