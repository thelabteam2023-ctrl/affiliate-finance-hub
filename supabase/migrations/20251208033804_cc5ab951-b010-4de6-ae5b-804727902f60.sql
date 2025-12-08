-- Atualizar view v_parceiro_lucro_total para incluir apostas múltiplas no lucro do parceiro
DROP VIEW IF EXISTS public.v_parceiro_lucro_total;
CREATE VIEW public.v_parceiro_lucro_total
WITH (security_invoker = on)
AS
SELECT 
  p.id AS parceiro_id,
  p.user_id,
  p.nome,
  p.cpf,
  p.status,
  -- Lucro de depósitos/saques (fluxo de caixa)
  COALESCE((
    SELECT SUM(CASE 
      WHEN cl.tipo_transacao = 'SAQUE' AND cl.destino_parceiro_id = p.id THEN cl.valor
      WHEN cl.tipo_transacao = 'DEPOSITO' AND cl.origem_parceiro_id = p.id THEN -cl.valor
      ELSE 0
    END)
    FROM public.cash_ledger cl
    WHERE (cl.destino_parceiro_id = p.id OR cl.origem_parceiro_id = p.id)
    AND cl.status = 'CONFIRMADO'
    AND cl.tipo_transacao IN ('DEPOSITO', 'SAQUE')
  ), 0) AS lucro_fluxo_caixa,
  -- Lucro de apostas em projetos vinculados ao parceiro (via bookmakers)
  -- Agora inclui APOSTAS SIMPLES + APOSTAS MÚLTIPLAS
  COALESCE((
    SELECT SUM(a.lucro_prejuizo)
    FROM public.apostas a
    JOIN public.bookmakers b ON a.bookmaker_id = b.id
    WHERE b.parceiro_id = p.id
    AND a.resultado IS NOT NULL
    AND a.resultado NOT IN ('PENDENTE', 'VOID')
  ), 0) + COALESCE((
    SELECT SUM(am.lucro_prejuizo)
    FROM public.apostas_multiplas am
    JOIN public.bookmakers b ON am.bookmaker_id = b.id
    WHERE b.parceiro_id = p.id
    AND am.resultado IS NOT NULL
    AND am.resultado NOT IN ('PENDENTE', 'VOID')
  ), 0) AS lucro_projetos,
  -- Saldo atual em bookmakers
  COALESCE((
    SELECT SUM(b.saldo_atual)
    FROM public.bookmakers b
    WHERE b.parceiro_id = p.id
  ), 0) AS saldo_bookmakers,
  -- Total depositado via parceiro
  COALESCE((
    SELECT SUM(cl.valor)
    FROM public.cash_ledger cl
    WHERE cl.origem_parceiro_id = p.id
    AND cl.tipo_transacao = 'DEPOSITO'
    AND cl.status = 'CONFIRMADO'
  ), 0) AS total_depositado,
  -- Total sacado para parceiro
  COALESCE((
    SELECT SUM(cl.valor)
    FROM public.cash_ledger cl
    WHERE cl.destino_parceiro_id = p.id
    AND cl.tipo_transacao = 'SAQUE'
    AND cl.status = 'CONFIRMADO'
  ), 0) AS total_sacado
FROM public.parceiros p
WHERE p.user_id = auth.uid();

-- Também atualizar v_operador_comparativo para incluir apostas múltiplas (manter colunas na mesma ordem)
DROP VIEW IF EXISTS public.v_operador_comparativo;
CREATE VIEW public.v_operador_comparativo
WITH (security_invoker = on)
AS
SELECT 
  o.id AS operador_id,
  o.user_id,
  o.nome,
  o.cpf,
  o.status,
  o.tipo_contrato,
  -- Projetos ativos
  (SELECT COUNT(*) FROM public.operador_projetos op WHERE op.operador_id = o.id AND op.status = 'ATIVO') AS projetos_ativos,
  -- Lucro total gerado em todos os projetos (apostas simples + múltiplas)
  COALESCE((
    SELECT SUM(a.lucro_prejuizo)
    FROM public.apostas a
    JOIN public.bookmakers b ON a.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE a.resultado IS NOT NULL
    AND a.resultado NOT IN ('PENDENTE', 'VOID')
  ), 0) + COALESCE((
    SELECT SUM(am.lucro_prejuizo)
    FROM public.apostas_multiplas am
    JOIN public.bookmakers b ON am.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE am.resultado IS NOT NULL
    AND am.resultado NOT IN ('PENDENTE', 'VOID')
  ), 0) AS lucro_total_gerado,
  -- Total apostas (simples + múltiplas)
  COALESCE((
    SELECT COUNT(*)
    FROM public.apostas a
    JOIN public.bookmakers b ON a.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE a.resultado IS NOT NULL
    AND a.resultado NOT IN ('PENDENTE')
  ), 0) + COALESCE((
    SELECT COUNT(*)
    FROM public.apostas_multiplas am
    JOIN public.bookmakers b ON am.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE am.resultado IS NOT NULL
    AND am.resultado NOT IN ('PENDENTE')
  ), 0) AS total_apostas,
  -- Apostas ganhas (simples + múltiplas)
  COALESCE((
    SELECT COUNT(*)
    FROM public.apostas a
    JOIN public.bookmakers b ON a.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE a.resultado IN ('GREEN', 'MEIO_GREEN', 'GREEN_BOOKMAKER')
  ), 0) + COALESCE((
    SELECT COUNT(*)
    FROM public.apostas_multiplas am
    JOIN public.bookmakers b ON am.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE am.resultado IN ('GREEN', 'MEIO_GREEN')
  ), 0) AS apostas_ganhas,
  -- Total volume apostado (simples + múltiplas)
  COALESCE((
    SELECT SUM(a.stake)
    FROM public.apostas a
    JOIN public.bookmakers b ON a.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE a.resultado IS NOT NULL
    AND a.resultado NOT IN ('PENDENTE')
  ), 0) + COALESCE((
    SELECT SUM(am.stake)
    FROM public.apostas_multiplas am
    JOIN public.bookmakers b ON am.bookmaker_id = b.id
    JOIN public.operador_projetos op ON b.projeto_id = op.projeto_id AND op.operador_id = o.id
    WHERE am.resultado IS NOT NULL
    AND am.resultado NOT IN ('PENDENTE')
  ), 0) AS volume_total,
  -- Total pago ao operador
  (SELECT COALESCE(SUM(valor), 0) FROM public.pagamentos_operador po WHERE po.operador_id = o.id AND po.status = 'CONFIRMADO') AS total_pago,
  -- Total pendente
  (SELECT COALESCE(SUM(valor), 0) FROM public.pagamentos_operador po WHERE po.operador_id = o.id AND po.status = 'PENDENTE') AS total_pendente
FROM public.operadores o
WHERE o.user_id = auth.uid();