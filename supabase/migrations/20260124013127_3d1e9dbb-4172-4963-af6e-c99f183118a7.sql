-- ============================================================
-- ARQUITETURA CORRETA: BLOQUEIO 100% LÓGICO
-- bookmakers.status = estado REAL da conta (ativo/limitada/encerrada)
-- Bloqueio por parceiro inativo = regra de negócio, NÃO físico
-- ============================================================

-- 1. RESTAURAR DADOS CONTAMINADOS
-- Reverter bookmakers que foram bloqueadas por parceiro inativo ao seu status original
UPDATE bookmakers
SET 
  status = COALESCE(status_pre_bloqueio, 'ativo'),
  estado_conta = CASE 
    WHEN status_pre_bloqueio = 'limitada' THEN 'limitada'
    ELSE NULL
  END,
  status_pre_bloqueio = NULL,
  updated_at = NOW()
WHERE estado_conta = 'parceiro_inativo'
  AND status = 'bloqueada';

-- 2. REMOVER O TRIGGER DE CASCATA (não deve mais existir)
DROP TRIGGER IF EXISTS trg_cascade_parceiro_inativo ON parceiros;

-- 3. RECRIAR FUNÇÃO VAZIA (para não quebrar referências)
-- Esta função agora NÃO faz nada - o bloqueio é 100% lógico
CREATE OR REPLACE FUNCTION public.cascade_parceiro_inativo_bookmakers()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- ARQUITETURA CORRETA: Não alteramos mais bookmakers.status
  -- O bloqueio por parceiro inativo é LÓGICO (via queries e views)
  -- 
  -- Apenas logamos para auditoria
  IF OLD.status = 'ativo' AND NEW.status = 'inativo' THEN
    RAISE NOTICE 'Parceiro % inativado. Bookmakers bloqueadas LOGICAMENTE (status real preservado).', NEW.nome;
  END IF;
  
  IF OLD.status = 'inativo' AND NEW.status = 'ativo' THEN
    RAISE NOTICE 'Parceiro % reativado. Bookmakers liberadas.', NEW.nome;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Recriar trigger apenas para logging (opcional, pode remover se não quiser logs)
CREATE TRIGGER trg_cascade_parceiro_inativo
  AFTER UPDATE OF status ON parceiros
  FOR EACH ROW
  EXECUTE FUNCTION cascade_parceiro_inativo_bookmakers();

-- 4. ATUALIZAR VIEW COM LÓGICA CORRETA
DROP VIEW IF EXISTS v_bookmaker_status_operacional;

CREATE VIEW v_bookmaker_status_operacional AS
SELECT 
  b.id,
  b.nome,
  b.moeda,
  b.saldo_atual,
  b.status AS status_real,  -- Estado REAL da conta (ativo/limitada/encerrada)
  b.estado_conta,
  b.parceiro_id,
  b.workspace_id,
  b.bookmaker_catalogo_id,
  p.status AS parceiro_status,
  p.nome AS parceiro_nome,
  -- Status para exibição na UI (combina estado real + bloqueio lógico)
  CASE 
    -- Se conta encerrada, sempre encerrada
    WHEN b.status = 'encerrada' THEN 'encerrada'
    -- Se conta limitada, mostra limitada
    WHEN b.status = 'limitada' THEN 'limitada'
    -- Se parceiro inativo E conta ativa, mostra bloqueada_parceiro
    WHEN p.status = 'inativo' AND b.status = 'ativo' THEN 'bloqueada_parceiro'
    -- Se bloqueada por outro motivo, mostra bloqueada
    WHEN b.status = 'bloqueada' THEN 'bloqueada'
    -- Caso contrário, usa status real
    ELSE b.status
  END AS status_display,
  -- Flag: pode realizar operações financeiras?
  (p.status = 'ativo' AND b.status NOT IN ('encerrada', 'bloqueada')) AS pode_operar,
  -- Flag: está bloqueada por parceiro inativo? (para UI mostrar badge especial)
  (p.status = 'inativo') AS bloqueada_por_parceiro
FROM bookmakers b
LEFT JOIN parceiros p ON p.id = b.parceiro_id;

COMMENT ON VIEW v_bookmaker_status_operacional IS 
'View que combina status REAL da bookmaker com status do parceiro.
- status_real: estado verdadeiro da conta (ativo/limitada/encerrada)
- status_display: para UI, considera bloqueio lógico por parceiro
- pode_operar: flag para validações de transação
- bloqueada_por_parceiro: flag para badge especial na UI';

-- 5. Remover coluna status_pre_bloqueio que não é mais necessária
-- (mantemos por histórico, mas pode ser removida em migração futura)
COMMENT ON COLUMN bookmakers.status_pre_bloqueio IS 
'DEPRECADO: Era usado para guardar status original antes de bloqueio por parceiro.
Com a nova arquitetura de bloqueio lógico, este campo não é mais necessário.
Pode ser removido em migração futura.';