
-- =====================================================
-- MIGRAÇÃO: Suporte a Múltiplas Contas por Parceiro
-- =====================================================
-- 
-- OBJETIVO: Permitir que um parceiro tenha múltiplas instâncias
-- da mesma bookmaker (ex: 3 contas Bet365 diferentes)
--
-- PRINCÍPIO: bookmakers.id = CONTA (instância operacional)
--            bookmaker_catalogo_id = TIPO de casa
--
-- GARANTIAS PRESERVADAS:
-- - Todas as transações (cash_ledger) referenciam bookmaker_id
-- - Todas as apostas referenciam bookmaker_id  
-- - KPIs somam por bookmaker_id
-- - Histórico nunca é movido
-- - Saldo nunca é zerado ou reaproveitado
-- =====================================================

-- 1️⃣ REMOVER CONSTRAINT QUE IMPÕE 1:1 (A MUDANÇA PRINCIPAL)
-- Esta constraint era: UNIQUE (user_id, parceiro_id, bookmaker_catalogo_id)
-- Ela impedia múltiplas contas da mesma casa para o mesmo parceiro
ALTER TABLE public.bookmakers 
DROP CONSTRAINT IF EXISTS bookmakers_user_parceiro_bookmaker_unique;

-- 2️⃣ ADICIONAR IDENTIFICADOR DE INSTÂNCIA (UX)
-- Permite diferenciar: "Conta Principal", "Backup", "Email João", "#1", "#2"
ALTER TABLE public.bookmakers
ADD COLUMN IF NOT EXISTS instance_identifier TEXT DEFAULT NULL;

-- 3️⃣ ADICIONAR COMENTÁRIO EXPLICATIVO NA TABELA
COMMENT ON TABLE public.bookmakers IS 
'Representa uma CONTA operacional (instância), não um contrato. 
Um parceiro pode ter múltiplas contas da mesma bookmaker.
Cada instância tem seu próprio saldo, credenciais, histórico e status.
NUNCA reutilizar uma instância - sempre criar nova.';

COMMENT ON COLUMN public.bookmakers.instance_identifier IS 
'Identificador amigável da conta para diferenciar múltiplas instâncias 
da mesma casa para o mesmo parceiro. Ex: "Principal", "Backup", "#1"';

-- 4️⃣ CRIAR ÍNDICE PARA PERFORMANCE (múltiplas contas por parceiro/catálogo)
CREATE INDEX IF NOT EXISTS idx_bookmakers_parceiro_catalogo 
ON public.bookmakers (parceiro_id, bookmaker_catalogo_id)
WHERE parceiro_id IS NOT NULL;

-- 5️⃣ ADICIONAR CONSTRAINT DE PROTEÇÃO CONTRA RECICLAGEM
-- Impede que uma conta encerrada seja reativada (força criar nova)
CREATE OR REPLACE FUNCTION public.protect_bookmaker_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
  -- Se estava encerrada e tentou voltar para ativo, bloqueia
  IF OLD.estado_conta = 'encerrada' AND NEW.estado_conta IN ('ativo', 'limitada') THEN
    RAISE EXCEPTION 'Conta encerrada não pode ser reativada. Crie uma nova conta.';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_bookmaker_lifecycle ON public.bookmakers;
CREATE TRIGGER trg_protect_bookmaker_lifecycle
BEFORE UPDATE ON public.bookmakers
FOR EACH ROW
EXECUTE FUNCTION public.protect_bookmaker_lifecycle();

-- 6️⃣ LOG DA MIGRAÇÃO
DO $$
BEGIN
  RAISE NOTICE 'Migração Multi-Conta concluída:';
  RAISE NOTICE '- Constraint 1:1 removida';
  RAISE NOTICE '- Campo instance_identifier adicionado';
  RAISE NOTICE '- Proteção contra reciclagem ativada';
  RAISE NOTICE '- Índice de performance criado';
END $$;
