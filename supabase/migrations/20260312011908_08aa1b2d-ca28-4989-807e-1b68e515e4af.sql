
-- Reconstruct historico for 14 bookmakers that have ledger operations but no historico
-- and no projeto_id_snapshot. These operated in workspace feee9758 during Jan 2026,
-- which corresponds to the LUIZ FELIPE project (fc388df7).
-- Inferred from timeline: all transactions Jan 15-28, LUIZ FELIPE created Jan 11.

INSERT INTO projeto_bookmaker_historico (
  bookmaker_id, projeto_id, user_id, workspace_id, 
  bookmaker_nome, parceiro_id, parceiro_nome, 
  data_vinculacao, data_desvinculacao, 
  tipo_projeto_snapshot, status_final
)
SELECT 
  b.id,
  'fc388df7-df10-4b6a-b37d-8607bf718bf6'::uuid, -- LUIZ FELIPE
  b.user_id,
  b.workspace_id,
  b.nome,
  b.parceiro_id,
  par.nome,
  MIN(cl.data_transacao), -- first operation as vinculacao date
  MAX(cl.data_transacao), -- last operation as desvinculacao date
  'BONUS', -- LUIZ FELIPE is tipo BONUS
  'ENCERRADA'
FROM bookmakers b
LEFT JOIN parceiros par ON par.id = b.parceiro_id
JOIN cash_ledger cl ON (cl.origem_bookmaker_id = b.id OR cl.destino_bookmaker_id = b.id)
WHERE NOT EXISTS (
  SELECT 1 FROM projeto_bookmaker_historico pbh WHERE pbh.bookmaker_id = b.id
)
AND b.projeto_id IS NULL
AND b.workspace_id = 'feee9758-a7f4-474c-b2b1-679b66ec1cd9'
GROUP BY b.id, b.nome, b.user_id, b.workspace_id, b.parceiro_id, par.nome
ON CONFLICT DO NOTHING;
