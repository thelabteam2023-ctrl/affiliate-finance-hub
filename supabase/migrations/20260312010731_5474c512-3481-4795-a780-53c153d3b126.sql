
-- Retroactive historico reconstruction from operations data
-- Step 1: From apostas_unificada
INSERT INTO projeto_bookmaker_historico (bookmaker_id, projeto_id, user_id, workspace_id, bookmaker_nome, parceiro_id, parceiro_nome, data_vinculacao, data_desvinculacao, tipo_projeto_snapshot, status_final)
SELECT 
  sub.bookmaker_id,
  sub.projeto_id,
  sub.user_id,
  sub.workspace_id,
  sub.bookmaker_nome,
  sub.parceiro_id,
  sub.parceiro_nome,
  sub.primeira_data,
  sub.ultima_data,
  sub.tipo_projeto,
  CASE WHEN sub.bm_status = 'limitada' THEN 'LIMITADA' ELSE 'ENCERRADA' END
FROM (
  SELECT 
    a.bookmaker_id,
    a.projeto_id,
    b.user_id,
    b.workspace_id,
    b.nome as bookmaker_nome,
    b.parceiro_id,
    par.nome as parceiro_nome,
    b.status as bm_status,
    MIN(a.data_aposta) as primeira_data,
    MAX(a.data_aposta) as ultima_data,
    p.tipo_projeto
  FROM apostas_unificada a
  JOIN bookmakers b ON b.id = a.bookmaker_id
  JOIN projetos p ON p.id = a.projeto_id
  LEFT JOIN parceiros par ON par.id = b.parceiro_id
  WHERE NOT EXISTS (
    SELECT 1 FROM projeto_bookmaker_historico pbh WHERE pbh.bookmaker_id = a.bookmaker_id
  )
  AND b.projeto_id IS NULL
  GROUP BY a.bookmaker_id, a.projeto_id, b.user_id, b.workspace_id, b.nome, b.parceiro_id, par.nome, b.status, p.tipo_projeto
) sub
ON CONFLICT DO NOTHING;

-- Step 2: From cash_ledger (only for bookmakers still without historico)
INSERT INTO projeto_bookmaker_historico (bookmaker_id, projeto_id, user_id, workspace_id, bookmaker_nome, parceiro_id, parceiro_nome, data_vinculacao, data_desvinculacao, tipo_projeto_snapshot, status_final)
SELECT 
  sub.bm_id,
  sub.projeto_id_snapshot,
  sub.user_id,
  sub.workspace_id,
  sub.bookmaker_nome,
  sub.parceiro_id,
  sub.parceiro_nome,
  sub.primeira_data,
  sub.ultima_data,
  sub.tipo_projeto,
  CASE WHEN sub.bm_status = 'limitada' THEN 'LIMITADA' ELSE 'ENCERRADA' END
FROM (
  SELECT 
    COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id) as bm_id,
    cl.projeto_id_snapshot,
    b.user_id,
    b.workspace_id,
    b.nome as bookmaker_nome,
    b.parceiro_id,
    par.nome as parceiro_nome,
    b.status as bm_status,
    MIN(cl.data_transacao) as primeira_data,
    MAX(cl.data_transacao) as ultima_data,
    p.tipo_projeto
  FROM cash_ledger cl
  JOIN projetos p ON p.id = cl.projeto_id_snapshot
  JOIN bookmakers b ON b.id = COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id)
  LEFT JOIN parceiros par ON par.id = b.parceiro_id
  WHERE cl.projeto_id_snapshot IS NOT NULL
  AND (cl.origem_bookmaker_id IS NOT NULL OR cl.destino_bookmaker_id IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM projeto_bookmaker_historico pbh WHERE pbh.bookmaker_id = COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id)
  )
  AND b.projeto_id IS NULL
  GROUP BY bm_id, cl.projeto_id_snapshot, b.user_id, b.workspace_id, b.nome, b.parceiro_id, par.nome, b.status, p.tipo_projeto
) sub
ON CONFLICT DO NOTHING;
