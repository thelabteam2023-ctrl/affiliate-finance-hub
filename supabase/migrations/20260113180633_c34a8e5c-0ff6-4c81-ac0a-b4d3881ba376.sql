-- Recria a view para mostrar todos usuários com vínculo em projetos (via operador_projetos)
-- Independente do role no workspace (owner, admin, operator, etc.)
DROP VIEW IF EXISTS v_operadores_workspace;

CREATE OR REPLACE VIEW v_operadores_workspace AS
SELECT 
    wm.id AS workspace_member_id,
    wm.workspace_id,
    wm.user_id,
    wm.role,
    wm.is_active,
    wm.joined_at,
    p.id AS profile_id,
    p.email,
    p.full_name AS nome,
    p.cpf,
    p.telefone,
    p.data_nascimento,
    p.tipo_contrato,
    p.data_admissao,
    p.data_desligamento,
    p.observacoes_operador AS observacoes,
    o.id AS operador_id,
    ( SELECT count(*) 
      FROM operador_projetos op 
      WHERE op.operador_id = o.id AND op.status = 'ATIVO') AS projetos_ativos,
    ( SELECT COALESCE(sum(po.valor), 0) 
      FROM pagamentos_operador po 
      WHERE po.operador_id = o.id AND po.status = 'CONFIRMADO') AS total_pago,
    ( SELECT COALESCE(sum(po.valor), 0) 
      FROM pagamentos_operador po 
      WHERE po.operador_id = o.id AND po.status = 'PENDENTE') AS total_pendente
FROM workspace_members wm
JOIN profiles p ON wm.user_id = p.id
JOIN operadores o ON o.auth_user_id = wm.user_id AND o.workspace_id = wm.workspace_id
WHERE wm.is_active = true
  AND EXISTS (
    SELECT 1 FROM operador_projetos op 
    WHERE op.operador_id = o.id AND op.status = 'ATIVO'
  );