-- Fix: v_painel_operacional must display correct monetary value for multi-currency bookmakers
-- Need to DROP and RECREATE because Postgres doesn't allow changing column data type in view

DROP VIEW IF EXISTS public.v_painel_operacional;

CREATE VIEW public.v_painel_operacional AS
SELECT
  b.id AS entidade_id,
  b.user_id,
  'BOOKMAKER_SAQUE'::text AS tipo_alerta,
  'BOOKMAKER'::text AS entidade_tipo,
  b.nome AS titulo,
  'Aguardando confirmação de saque'::text AS descricao,
  (
    CASE
      WHEN b.moeda = ANY (ARRAY['USD'::text, 'USDT'::text, 'BTC'::text, 'ETH'::text, 'USDC'::text])
        THEN b.saldo_usd
      ELSE b.saldo_atual
    END
  )::numeric(15,2) AS valor,
  b.moeda,
  'MEDIO'::text AS nivel_urgencia,
  2 AS ordem_urgencia,
  NULL::date AS data_limite,
  b.created_at,
  b.parceiro_id,
  (
    SELECT p.nome
    FROM parceiros p
    WHERE p.id = b.parceiro_id
  ) AS parceiro_nome,
  b.projeto_id,
  (
    SELECT pr.nome
    FROM projetos pr
    WHERE pr.id = b.projeto_id
  ) AS projeto_nome,
  b.status AS status_anterior
FROM public.bookmakers b
WHERE
  b.status = 'AGUARDANDO_SAQUE'::text
  AND b.workspace_id = get_current_workspace()
  AND (
    (b.moeda = ANY (ARRAY['USD'::text, 'USDT'::text, 'BTC'::text, 'ETH'::text, 'USDC'::text]) AND b.saldo_usd > 0.5)
    OR
    (b.moeda <> ALL (ARRAY['USD'::text, 'USDT'::text, 'BTC'::text, 'ETH'::text, 'USDC'::text]) AND b.saldo_atual > 0.5)
  )

UNION ALL

SELECT
  b.id AS entidade_id,
  b.user_id,
  'BOOKMAKER_LIMITADA'::text AS tipo_alerta,
  'BOOKMAKER'::text AS entidade_tipo,
  b.nome AS titulo,
  'Casa limitada - necessário sacar saldo ou realocar'::text AS descricao,
  (
    CASE
      WHEN b.moeda = ANY (ARRAY['USD'::text, 'USDT'::text, 'BTC'::text, 'ETH'::text, 'USDC'::text])
        THEN b.saldo_usd
      ELSE b.saldo_atual
    END
  )::numeric(15,2) AS valor,
  b.moeda,
  (
    CASE
      WHEN (
        CASE
          WHEN b.moeda = ANY (ARRAY['USD'::text, 'USDT'::text, 'BTC'::text, 'ETH'::text, 'USDC'::text])
            THEN b.saldo_usd
          ELSE b.saldo_atual
        END
      ) > 1000::numeric
        THEN 'ALTO'::text
      ELSE 'MEDIO'::text
    END
  ) AS nivel_urgencia,
  (
    CASE
      WHEN (
        CASE
          WHEN b.moeda = ANY (ARRAY['USD'::text, 'USDT'::text, 'BTC'::text, 'ETH'::text, 'USDC'::text])
            THEN b.saldo_usd
          ELSE b.saldo_atual
        END
      ) > 1000::numeric
        THEN 1
      ELSE 2
    END
  ) AS ordem_urgencia,
  NULL::date AS data_limite,
  b.created_at,
  b.parceiro_id,
  (
    SELECT p.nome
    FROM parceiros p
    WHERE p.id = b.parceiro_id
  ) AS parceiro_nome,
  b.projeto_id,
  (
    SELECT pr.nome
    FROM projetos pr
    WHERE pr.id = b.projeto_id
  ) AS projeto_nome,
  b.status AS status_anterior
FROM public.bookmakers b
WHERE
  b.status = 'limitada'::text
  AND b.workspace_id = get_current_workspace()
  AND (
    (b.moeda = ANY (ARRAY['USD'::text, 'USDT'::text, 'BTC'::text, 'ETH'::text, 'USDC'::text]) AND b.saldo_usd > 0.5)
    OR
    (b.moeda <> ALL (ARRAY['USD'::text, 'USDT'::text, 'BTC'::text, 'ETH'::text, 'USDC'::text]) AND b.saldo_atual > 0.5)
  );