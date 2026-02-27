
DROP VIEW IF EXISTS v_bookmaker_resultado_operacional;

CREATE VIEW v_bookmaker_resultado_operacional AS
SELECT 
    b.id AS bookmaker_id,
    b.nome AS bookmaker_nome,
    b.moeda,
    b.workspace_id,
    b.projeto_id,
    b.parceiro_id,
    COALESCE(( SELECT sum(COALESCE(a.pl_consolidado, a.lucro_prejuizo))
           FROM apostas_unificada a
          WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA' AND a.resultado IS NOT NULL), 0) AS resultado_apostas,
    COALESCE(( SELECT sum(ap.lucro_prejuizo)
           FROM apostas_pernas ap
          WHERE ap.bookmaker_id = b.id AND ap.resultado IS NOT NULL), 0) AS resultado_pernas,
    COALESCE(( SELECT sum(gg.valor_retorno)
           FROM giros_gratis gg
          WHERE gg.bookmaker_id = b.id AND gg.status = 'confirmado'), 0) AS resultado_giros,
    COALESCE(( SELECT sum(cm.valor)
           FROM cashback_manual cm
          WHERE cm.bookmaker_id = b.id), 0) AS resultado_cashback,
    COALESCE(( SELECT sum(cl.valor)
           FROM cash_ledger cl
          WHERE cl.destino_bookmaker_id = b.id AND cl.tipo_transacao = 'BONUS_CREDITADO'), 0)
    - COALESCE(( SELECT sum(cl.valor)
           FROM cash_ledger cl
          WHERE (cl.origem_bookmaker_id = b.id OR cl.destino_bookmaker_id = b.id)
            AND cl.tipo_transacao = 'AJUSTE_SALDO' AND cl.ajuste_motivo = 'BONUS_CANCELAMENTO'), 0) AS resultado_bonus,
    COALESCE(( SELECT sum(COALESCE(a.pl_consolidado, a.lucro_prejuizo))
           FROM apostas_unificada a
          WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA' AND a.resultado IS NOT NULL), 0)
    + COALESCE(( SELECT sum(gg.valor_retorno)
           FROM giros_gratis gg
          WHERE gg.bookmaker_id = b.id AND gg.status = 'confirmado'), 0)
    + COALESCE(( SELECT sum(cm.valor)
           FROM cashback_manual cm
          WHERE cm.bookmaker_id = b.id), 0)
    + COALESCE(( SELECT sum(cl.valor)
           FROM cash_ledger cl
          WHERE cl.destino_bookmaker_id = b.id AND cl.tipo_transacao = 'BONUS_CREDITADO'), 0)
    - COALESCE(( SELECT sum(cl.valor)
           FROM cash_ledger cl
          WHERE (cl.origem_bookmaker_id = b.id OR cl.destino_bookmaker_id = b.id)
            AND cl.tipo_transacao = 'AJUSTE_SALDO' AND cl.ajuste_motivo = 'BONUS_CANCELAMENTO'), 0) AS resultado_operacional_total,
    ( SELECT count(*)
           FROM apostas_unificada a
          WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA') AS qtd_apostas,
    ( SELECT count(*)
           FROM apostas_unificada a
          WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA' AND a.resultado IN ('GREEN', 'MEIO_GREEN')) AS qtd_greens,
    ( SELECT count(*)
           FROM apostas_unificada a
          WHERE a.bookmaker_id = b.id AND a.status = 'LIQUIDADA' AND a.resultado IN ('RED', 'MEIO_RED')) AS qtd_reds
FROM bookmakers b
WHERE b.status = ANY (ARRAY['ativo', 'limitada', 'bloqueada', 'pausada']);
