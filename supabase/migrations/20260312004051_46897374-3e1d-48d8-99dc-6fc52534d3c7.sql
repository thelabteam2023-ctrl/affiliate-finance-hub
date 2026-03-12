
-- =====================================================
-- TRIGGER: Garantir registro automático no histórico
-- quando bookmakers.projeto_id muda
-- =====================================================

-- Função do trigger
CREATE OR REPLACE FUNCTION fn_ensure_historico_on_projeto_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caso 1: projeto_id mudou de um valor para NULL (desvinculação)
  -- Já tratado pela RPC desvincular_bookmaker_atomico, mas como safety net:
  IF OLD.projeto_id IS NOT NULL AND NEW.projeto_id IS NULL THEN
    UPDATE projeto_bookmaker_historico
    SET data_desvinculacao = COALESCE(data_desvinculacao, NOW()),
        status_final = COALESCE(status_final, NEW.status)
    WHERE bookmaker_id = NEW.id
      AND projeto_id = OLD.projeto_id
      AND data_desvinculacao IS NULL;
  END IF;

  -- Caso 2: projeto_id mudou de NULL para um valor (vinculação)
  -- OU mudou de um projeto para outro (re-vinculação direta)
  IF NEW.projeto_id IS NOT NULL AND (OLD.projeto_id IS NULL OR OLD.projeto_id != NEW.projeto_id) THEN
    -- Se está saindo de um projeto antigo, fechar o registro anterior
    IF OLD.projeto_id IS NOT NULL AND OLD.projeto_id != NEW.projeto_id THEN
      UPDATE projeto_bookmaker_historico
      SET data_desvinculacao = COALESCE(data_desvinculacao, NOW()),
          status_final = COALESCE(status_final, NEW.status)
      WHERE bookmaker_id = NEW.id
        AND projeto_id = OLD.projeto_id
        AND data_desvinculacao IS NULL;
    END IF;

    -- Verificar se já existe registro ativo para este par (evitar duplicata)
    IF NOT EXISTS (
      SELECT 1 FROM projeto_bookmaker_historico
      WHERE bookmaker_id = NEW.id
        AND projeto_id = NEW.projeto_id
        AND data_desvinculacao IS NULL
    ) THEN
      -- Buscar dados do parceiro para preencher o registro
      INSERT INTO projeto_bookmaker_historico (
        bookmaker_id, projeto_id, bookmaker_nome, parceiro_id, parceiro_nome,
        user_id, workspace_id, data_vinculacao, tipo_projeto_snapshot
      )
      SELECT
        NEW.id,
        NEW.projeto_id,
        NEW.nome,
        NEW.parceiro_id,
        parc.nome,
        NEW.user_id,
        NEW.workspace_id,
        NOW(),
        proj.tipo_projeto
      FROM projetos proj
      LEFT JOIN parceiros parc ON parc.id = NEW.parceiro_id
      WHERE proj.id = NEW.projeto_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Criar o trigger (após o trigger de DEPOSITO_VIRTUAL para manter ordem)
DROP TRIGGER IF EXISTS tr_ensure_historico_on_projeto_change ON bookmakers;
CREATE TRIGGER tr_ensure_historico_on_projeto_change
  AFTER UPDATE OF projeto_id ON bookmakers
  FOR EACH ROW
  WHEN (OLD.projeto_id IS DISTINCT FROM NEW.projeto_id)
  EXECUTE FUNCTION fn_ensure_historico_on_projeto_change();

-- =====================================================
-- CORREÇÃO: Inserir histórico retroativo para os 3 
-- bookmakers órfãos (com projeto_id mas sem histórico)
-- =====================================================
INSERT INTO projeto_bookmaker_historico (
  bookmaker_id, projeto_id, bookmaker_nome, parceiro_id, parceiro_nome,
  user_id, workspace_id, data_vinculacao, tipo_projeto_snapshot
)
SELECT
  b.id,
  b.projeto_id,
  b.nome,
  b.parceiro_id,
  parc.nome,
  b.user_id,
  b.workspace_id,
  b.created_at,
  proj.tipo_projeto
FROM bookmakers b
LEFT JOIN projetos proj ON proj.id = b.projeto_id
LEFT JOIN parceiros parc ON parc.id = b.parceiro_id
WHERE b.projeto_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM projeto_bookmaker_historico h
  WHERE h.bookmaker_id = b.id AND h.projeto_id = b.projeto_id
);
