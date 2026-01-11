
-- Atualizar view v_painel_operacional para incluir verificação de saldo > 0 
-- para saques pendentes de processamento (evitar mostrar casas com saldo zerado)
CREATE OR REPLACE VIEW public.v_painel_operacional AS
SELECT b.id AS entidade_id,
    b.user_id,
    'BOOKMAKER_SAQUE'::text AS tipo_alerta,
    'BOOKMAKER'::text AS entidade_tipo,
    b.nome AS titulo,
    'Aguardando confirmação de saque'::text AS descricao,
    b.saldo_atual AS valor,
    b.moeda,
    'MEDIO'::text AS nivel_urgencia,
    2 AS ordem_urgencia,
    NULL::date AS data_limite,
    b.created_at,
    b.parceiro_id,
    ( SELECT parceiros.nome
           FROM parceiros
          WHERE parceiros.id = b.parceiro_id) AS parceiro_nome,
    b.projeto_id,
    ( SELECT projetos.nome
           FROM projetos
          WHERE projetos.id = b.projeto_id) AS projeto_nome,
    b.status AS status_anterior
   FROM bookmakers b
  WHERE b.status = 'AGUARDANDO_SAQUE'::text 
    AND b.workspace_id = get_current_workspace()
    -- Nova condição: só mostrar se tiver saldo efetivo > 0
    AND (
      (b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_usd > 0.5) 
      OR 
      (b.moeda NOT IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_atual > 0.5)
    )
UNION ALL
 SELECT b.id AS entidade_id,
    b.user_id,
    'BOOKMAKER_LIMITADA'::text AS tipo_alerta,
    'BOOKMAKER'::text AS entidade_tipo,
    b.nome AS titulo,
    'Casa limitada - necessário sacar saldo ou realocar'::text AS descricao,
    b.saldo_atual AS valor,
    b.moeda,
        CASE
            WHEN b.saldo_atual > 1000::numeric THEN 'ALTO'::text
            ELSE 'MEDIO'::text
        END AS nivel_urgencia,
        CASE
            WHEN b.saldo_atual > 1000::numeric THEN 1
            ELSE 2
        END AS ordem_urgencia,
    NULL::date AS data_limite,
    b.created_at,
    b.parceiro_id,
    ( SELECT parceiros.nome
           FROM parceiros
          WHERE parceiros.id = b.parceiro_id) AS parceiro_nome,
    b.projeto_id,
    ( SELECT projetos.nome
           FROM projetos
          WHERE projetos.id = b.projeto_id) AS projeto_nome,
    b.status AS status_anterior
   FROM bookmakers b
  WHERE b.status = 'limitada'::text 
    AND b.workspace_id = get_current_workspace()
    -- Nova condição: só mostrar se tiver saldo efetivo > 0
    AND (
      (b.moeda IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_usd > 0.5) 
      OR 
      (b.moeda NOT IN ('USD', 'USDT', 'BTC', 'ETH', 'USDC') AND b.saldo_atual > 0.5)
    );
