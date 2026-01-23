-- Trigger para auto-preencher tipo_projeto_snapshot ao inserir no histórico
CREATE OR REPLACE FUNCTION fn_set_tipo_projeto_snapshot()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Se tipo_projeto_snapshot não foi informado, buscar do projeto
  IF NEW.tipo_projeto_snapshot IS NULL AND NEW.projeto_id IS NOT NULL THEN
    SELECT tipo_projeto INTO NEW.tipo_projeto_snapshot
    FROM projetos
    WHERE id = NEW.projeto_id;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Remover trigger anterior se existir
DROP TRIGGER IF EXISTS trg_set_tipo_projeto_snapshot ON projeto_bookmaker_historico;

-- Criar trigger BEFORE INSERT
CREATE TRIGGER trg_set_tipo_projeto_snapshot
  BEFORE INSERT ON projeto_bookmaker_historico
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_tipo_projeto_snapshot();

-- Atualizar registros existentes que não têm tipo_projeto_snapshot
UPDATE projeto_bookmaker_historico h
SET tipo_projeto_snapshot = p.tipo_projeto
FROM projetos p
WHERE h.projeto_id = p.id 
  AND h.tipo_projeto_snapshot IS NULL;