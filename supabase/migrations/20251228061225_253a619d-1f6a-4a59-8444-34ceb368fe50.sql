
-- FASE 1: Backfill de dados órfãos em indicadores_referral
-- Registros identificados:
-- 1. id: 177fc324-b1d0-48ca-b6c2-396cc2ddafa4 (MARCELO ALVES JUNIOR)
-- 2. id: 19854f0a-ae4e-4ce2-bfdc-80dd323a5f67 (VANESSA SANTOS OLIVEIRA)
-- Ambos pertencem ao user_id: b75d8d25-44fc-4bbb-8cf9-e9ae9e5b23b7
-- Workspace inferido via workspace_members: f8b6f7ce-92b9-4d26-899a-0f0eeb1324cd

UPDATE indicadores_referral
SET workspace_id = 'f8b6f7ce-92b9-4d26-899a-0f0eeb1324cd'
WHERE id IN (
  '177fc324-b1d0-48ca-b6c2-396cc2ddafa4',
  '19854f0a-ae4e-4ce2-bfdc-80dd323a5f67'
)
AND workspace_id IS NULL;
