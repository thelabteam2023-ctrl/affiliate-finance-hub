-- Corrigir v_parceiro_lucro_total para calcular lucro_projetos corretamente
-- O campo estava hardcoded como 0::numeric desde uma migração de workspace scoping

CREATE OR REPLACE VIEW public.v_parceiro_lucro_total AS
SELECT 
    p.id AS parceiro_id,
    p.user_id,
    p.nome,
    p.cpf,
    p.status,
    -- Fluxo de caixa do parceiro (entradas - saídas)
    COALESCE(( 
        SELECT sum(
            CASE 
                WHEN cl.destino_parceiro_id = p.id THEN cl.valor
                WHEN cl.origem_parceiro_id = p.id THEN -cl.valor
                ELSE 0
            END
        ) 
        FROM cash_ledger cl
        WHERE (cl.destino_parceiro_id = p.id OR cl.origem_parceiro_id = p.id)
          AND cl.status = 'CONFIRMADO'
          AND cl.workspace_id = p.workspace_id
    ), 0) AS lucro_fluxo_caixa,
    -- Saldo atual em todas as bookmakers do parceiro
    COALESCE((
        SELECT sum(b.saldo_atual) 
        FROM bookmakers b 
        WHERE b.parceiro_id = p.id
          AND b.workspace_id = p.workspace_id
    ), 0) AS saldo_bookmakers,
    -- Total depositado nas casas do parceiro
    COALESCE((
        SELECT sum(cl.valor_destino) 
        FROM cash_ledger cl
        JOIN bookmakers b ON cl.destino_bookmaker_id = b.id
        WHERE b.parceiro_id = p.id 
          AND cl.tipo_transacao = 'DEPOSITO'
          AND cl.status = 'CONFIRMADO'
          AND cl.workspace_id = p.workspace_id
    ), 0) AS total_depositado,
    -- Total sacado das casas do parceiro
    COALESCE((
        SELECT sum(cl.valor_origem) 
        FROM cash_ledger cl
        JOIN bookmakers b ON cl.origem_bookmaker_id = b.id
        WHERE b.parceiro_id = p.id 
          AND cl.tipo_transacao = 'SAQUE'
          AND cl.status = 'CONFIRMADO'
          AND cl.workspace_id = p.workspace_id
    ), 0) AS total_sacado,
    -- CORREÇÃO: Lucro operacional das apostas (não mais zerado!)
    -- Soma o lucro/prejuízo de todas as apostas em bookmakers vinculadas ao parceiro
    COALESCE((
        SELECT sum(
            CASE 
                -- Para apostas com bookmaker direto, usar lucro_prejuizo
                WHEN au.bookmaker_id IS NOT NULL AND b.parceiro_id = p.id THEN 
                    COALESCE(au.lucro_prejuizo, 0)
                ELSE 0
            END
        )
        FROM apostas_unificada au
        LEFT JOIN bookmakers b ON au.bookmaker_id = b.id
        WHERE b.parceiro_id = p.id
          AND au.resultado NOT IN ('PENDENTE', 'VOID')
          AND au.workspace_id = p.workspace_id
    ), 0) 
    +
    -- Adicionar lucro de apostas multi-leg (pernas em bookmakers do parceiro)
    COALESCE((
        SELECT sum(ap.lucro_prejuizo)
        FROM apostas_pernas ap
        JOIN bookmakers b ON ap.bookmaker_id = b.id
        JOIN apostas_unificada au ON ap.aposta_id = au.id
        WHERE b.parceiro_id = p.id
          AND ap.resultado IS NOT NULL
          AND ap.resultado NOT IN ('PENDENTE', 'VOID')
          AND au.workspace_id = p.workspace_id
    ), 0) AS lucro_projetos
FROM parceiros p
WHERE p.workspace_id = get_current_workspace();