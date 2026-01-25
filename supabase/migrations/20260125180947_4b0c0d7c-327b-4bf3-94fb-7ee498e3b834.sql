-- =====================================================
-- MIGRAÇÃO: Modelo de Atribuição Temporal de Projeto
-- =====================================================
-- Objetivo: Gravar projeto_id no momento da transação
-- para garantir imutabilidade histórica
-- =====================================================

-- 1. Adicionar coluna snapshot de projeto no cash_ledger
ALTER TABLE cash_ledger 
ADD COLUMN IF NOT EXISTS projeto_id_snapshot UUID REFERENCES projetos(id);

-- Comentário explicativo
COMMENT ON COLUMN cash_ledger.projeto_id_snapshot IS 
  'Projeto que era dono da bookmaker no momento da transação. Imutável após gravação.';

-- 2. Index para performance nos filtros por projeto
CREATE INDEX IF NOT EXISTS idx_cash_ledger_projeto_snapshot 
ON cash_ledger(projeto_id_snapshot);

-- 3. Trigger para capturar projeto automaticamente ao inserir
CREATE OR REPLACE FUNCTION fn_cash_ledger_projeto_snapshot()
RETURNS TRIGGER AS $$
BEGIN
  -- Só preenche se não foi informado explicitamente
  IF NEW.projeto_id_snapshot IS NULL THEN
    -- Captura projeto da bookmaker origem ou destino
    NEW.projeto_id_snapshot := COALESCE(
      (SELECT projeto_id FROM bookmakers WHERE id = NEW.origem_bookmaker_id),
      (SELECT projeto_id FROM bookmakers WHERE id = NEW.destino_bookmaker_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS tr_cash_ledger_projeto_snapshot ON cash_ledger;

-- Criar trigger BEFORE INSERT
CREATE TRIGGER tr_cash_ledger_projeto_snapshot
BEFORE INSERT ON cash_ledger
FOR EACH ROW
EXECUTE FUNCTION fn_cash_ledger_projeto_snapshot();

-- 4. Migração de dados históricos usando projeto_bookmaker_historico
-- Preencher projeto_id_snapshot para transações existentes
UPDATE cash_ledger cl
SET projeto_id_snapshot = sub.projeto_id
FROM (
  SELECT 
    cl2.id as ledger_id,
    h.projeto_id
  FROM cash_ledger cl2
  LEFT JOIN projeto_bookmaker_historico h ON (
    h.bookmaker_id = COALESCE(cl2.origem_bookmaker_id, cl2.destino_bookmaker_id)
    AND cl2.data_transacao >= h.data_vinculacao
    AND (cl2.data_transacao < h.data_desvinculacao OR h.data_desvinculacao IS NULL)
  )
  WHERE cl2.projeto_id_snapshot IS NULL
    AND COALESCE(cl2.origem_bookmaker_id, cl2.destino_bookmaker_id) IS NOT NULL
) sub
WHERE cl.id = sub.ledger_id
  AND cl.projeto_id_snapshot IS NULL;

-- 5. Para transações sem histórico registrado, usar projeto atual da bookmaker
UPDATE cash_ledger cl
SET projeto_id_snapshot = COALESCE(
  (SELECT projeto_id FROM bookmakers WHERE id = cl.origem_bookmaker_id),
  (SELECT projeto_id FROM bookmakers WHERE id = cl.destino_bookmaker_id)
)
WHERE cl.projeto_id_snapshot IS NULL
  AND COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id) IS NOT NULL;