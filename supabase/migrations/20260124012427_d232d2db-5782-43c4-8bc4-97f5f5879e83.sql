-- ============================================================
-- CORREÇÃO: SEPARAR STATUS REAL DE BLOQUEIO ADMINISTRATIVO
-- Princípio: bookmakers.status reflete o estado REAL da conta
--            bloqueio por parceiro inativo é LÓGICO, não físico
-- ============================================================

-- 1. Adicionar campo para preservar estado original (se não existir)
ALTER TABLE bookmakers 
ADD COLUMN IF NOT EXISTS status_pre_bloqueio text;

COMMENT ON COLUMN bookmakers.status_pre_bloqueio IS 
'Armazena o status original da bookmaker antes de um bloqueio administrativo. 
Usado para restaurar o estado correto ao desbloquear.';

-- 2. Corrigir dados existentes: restaurar status original onde possível
-- Contas marcadas como 'parceiro_inativo' que eram bloqueadas devem voltar ao estado original
UPDATE bookmakers
SET 
  status_pre_bloqueio = 'limitada', -- Assumir limitada como mais provável (conservador)
  updated_at = NOW()
WHERE status = 'bloqueada' 
  AND estado_conta = 'parceiro_inativo'
  AND status_pre_bloqueio IS NULL;

-- 3. Criar novo trigger que PRESERVA o status original
CREATE OR REPLACE FUNCTION public.cascade_parceiro_inativo_bookmakers()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Se parceiro está sendo inativado
  IF OLD.status = 'ativo' AND NEW.status = 'inativo' THEN
    -- PRESERVAR o status original antes de bloquear
    UPDATE bookmakers
    SET 
      status_pre_bloqueio = CASE 
        WHEN status_pre_bloqueio IS NULL THEN status  -- Guarda estado atual
        ELSE status_pre_bloqueio                       -- Mantém se já havia um
      END,
      status = 'bloqueada',
      estado_conta = 'parceiro_inativo',
      updated_at = NOW()
    WHERE parceiro_id = NEW.id
      AND status NOT IN ('encerrada');  -- Encerrada nunca muda
    
    RAISE NOTICE 'Parceiro % inativado. Bookmakers bloqueadas (status original preservado).', NEW.nome;
  END IF;
  
  -- Se parceiro está sendo reativado
  IF OLD.status = 'inativo' AND NEW.status = 'ativo' THEN
    -- RESTAURAR o status original
    UPDATE bookmakers
    SET 
      status = COALESCE(status_pre_bloqueio, 'ativo'),  -- Restaura ou default 'ativo'
      estado_conta = CASE 
        WHEN status_pre_bloqueio = 'limitada' THEN 'limitada'  -- Mantém contexto se era limitada
        ELSE NULL
      END,
      status_pre_bloqueio = NULL,  -- Limpa o backup
      updated_at = NOW()
    WHERE parceiro_id = NEW.id
      AND status = 'bloqueada'
      AND estado_conta = 'parceiro_inativo';
    
    RAISE NOTICE 'Parceiro % reativado. Bookmakers restauradas ao status original.', NEW.nome;
  END IF;
  
  RETURN NEW;
END;
$$;

-- 4. Criar VIEW para status operacional computado
-- (Combina status real + bloqueio lógico de parceiro)
CREATE OR REPLACE VIEW v_bookmaker_status_operacional AS
SELECT 
  b.id,
  b.nome,
  b.status AS status_real,
  b.estado_conta,
  b.status_pre_bloqueio,
  b.parceiro_id,
  p.status AS parceiro_status,
  p.nome AS parceiro_nome,
  -- Status operacional computado
  CASE 
    -- Se parceiro inativo, sempre bloqueada operacionalmente
    WHEN p.status = 'inativo' THEN 'bloqueada_parceiro'
    -- Se conta encerrada, sempre encerrada
    WHEN b.status = 'encerrada' THEN 'encerrada'
    -- Se bloqueada por outro motivo
    WHEN b.status = 'bloqueada' THEN 'bloqueada'
    -- Caso contrário, usa status real
    ELSE b.status
  END AS status_operacional,
  -- Flag simples: pode operar?
  (p.status = 'ativo' AND b.status NOT IN ('encerrada', 'bloqueada')) AS pode_operar
FROM bookmakers b
LEFT JOIN parceiros p ON p.id = b.parceiro_id;

COMMENT ON VIEW v_bookmaker_status_operacional IS 
'View que combina status real da bookmaker com status administrativo do parceiro.
status_operacional: visão unificada para UI
pode_operar: flag booleano para queries rápidas';

-- 5. Criar função helper para queries
CREATE OR REPLACE FUNCTION public.bookmaker_pode_operar(p_bookmaker_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT 
    p.status = 'ativo' 
    AND b.status NOT IN ('encerrada', 'bloqueada')
  FROM bookmakers b
  LEFT JOIN parceiros p ON p.id = b.parceiro_id
  WHERE b.id = p_bookmaker_id;
$$;

COMMENT ON FUNCTION bookmaker_pode_operar IS 
'Retorna TRUE se a bookmaker pode realizar operações financeiras.
Considera tanto o status da conta quanto do parceiro dono.';

-- 6. Documentar a nova arquitetura
COMMENT ON COLUMN bookmakers.status IS 
'Status REAL da conta na casa de apostas:
- ativo: conta operacional
- limitada: conta com restrições impostas pela casa
- encerrada: conta permanentemente fechada
- bloqueada: conta temporariamente bloqueada (ver estado_conta para motivo)
IMPORTANTE: Este campo representa o estado real, não bloqueio administrativo.';

COMMENT ON COLUMN bookmakers.estado_conta IS 
'Contexto ou motivo do estado atual:
- parceiro_inativo: bloqueada porque o parceiro foi inativado
- limitada: marcada como limitada pela casa
- aguardando_saque: em processo de saque final
- encerrada: conta permanentemente fechada
Este campo preserva o MOTIVO, não substitui o status real.';