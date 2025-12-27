-- Update v_roi_investidores to filter by workspace instead of user_id
DROP VIEW IF EXISTS public.v_roi_investidores;

CREATE VIEW public.v_roi_investidores AS
SELECT 
  i.id AS investidor_id,
  i.user_id,
  i.workspace_id,
  i.nome,
  i.cpf,
  i.status,
  COALESCE(sum(
    CASE
      WHEN ((cl.tipo_transacao = 'APORTE_FINANCEIRO'::text) AND (cl.origem_tipo = 'INVESTIDOR'::text) AND (cl.tipo_moeda = 'FIAT'::text) AND (cl.moeda = 'BRL'::text) AND (cl.status = 'CONFIRMADO'::text)) THEN cl.valor
      ELSE (0)::numeric
    END), (0)::numeric) AS aportes_fiat_brl,
  COALESCE(sum(
    CASE
      WHEN ((cl.tipo_transacao = 'APORTE_FINANCEIRO'::text) AND (cl.origem_tipo = 'INVESTIDOR'::text) AND (cl.tipo_moeda = 'FIAT'::text) AND (cl.moeda = 'USD'::text) AND (cl.status = 'CONFIRMADO'::text)) THEN cl.valor
      ELSE (0)::numeric
    END), (0)::numeric) AS aportes_fiat_usd,
  COALESCE(sum(
    CASE
      WHEN ((cl.tipo_transacao = 'APORTE_FINANCEIRO'::text) AND (cl.origem_tipo = 'INVESTIDOR'::text) AND (cl.tipo_moeda = 'CRYPTO'::text) AND (cl.status = 'CONFIRMADO'::text)) THEN cl.valor_usd
      ELSE (0)::numeric
    END), (0)::numeric) AS aportes_crypto_usd,
  COALESCE(sum(
    CASE
      WHEN ((cl.tipo_transacao = 'APORTE_FINANCEIRO'::text) AND (cl.destino_tipo = 'INVESTIDOR'::text) AND (cl.tipo_moeda = 'FIAT'::text) AND (cl.moeda = 'BRL'::text) AND (cl.status = 'CONFIRMADO'::text)) THEN cl.valor
      ELSE (0)::numeric
    END), (0)::numeric) AS liquidacoes_fiat_brl,
  COALESCE(sum(
    CASE
      WHEN ((cl.tipo_transacao = 'APORTE_FINANCEIRO'::text) AND (cl.destino_tipo = 'INVESTIDOR'::text) AND (cl.tipo_moeda = 'FIAT'::text) AND (cl.moeda = 'USD'::text) AND (cl.status = 'CONFIRMADO'::text)) THEN cl.valor
      ELSE (0)::numeric
    END), (0)::numeric) AS liquidacoes_fiat_usd,
  COALESCE(sum(
    CASE
      WHEN ((cl.tipo_transacao = 'APORTE_FINANCEIRO'::text) AND (cl.destino_tipo = 'INVESTIDOR'::text) AND (cl.tipo_moeda = 'CRYPTO'::text) AND (cl.status = 'CONFIRMADO'::text)) THEN cl.valor_usd
      ELSE (0)::numeric
    END), (0)::numeric) AS liquidacoes_crypto_usd
FROM investidores i
LEFT JOIN cash_ledger cl ON cl.investidor_id = i.id
WHERE i.workspace_id = get_current_workspace()
GROUP BY i.id, i.user_id, i.workspace_id, i.nome, i.cpf, i.status;

-- Update v_operador_performance to filter by workspace
DROP VIEW IF EXISTS public.v_operador_performance;

CREATE VIEW public.v_operador_performance AS
SELECT 
  id AS operador_id,
  user_id,
  workspace_id,
  nome,
  cpf,
  status,
  tipo_contrato,
  data_admissao,
  (SELECT count(*) FROM operador_projetos op WHERE op.operador_id = o.id AND op.status = 'ATIVO') AS projetos_ativos,
  (SELECT count(*) FROM operador_projetos op WHERE op.operador_id = o.id) AS total_projetos,
  (SELECT COALESCE(sum(p.valor), 0) FROM pagamentos_operador p WHERE p.operador_id = o.id AND p.status = 'CONFIRMADO') AS total_pago,
  (SELECT COALESCE(sum(p.valor), 0) FROM pagamentos_operador p WHERE p.operador_id = o.id AND p.status = 'PENDENTE') AS total_pendente
FROM operadores o
WHERE o.workspace_id = get_current_workspace();