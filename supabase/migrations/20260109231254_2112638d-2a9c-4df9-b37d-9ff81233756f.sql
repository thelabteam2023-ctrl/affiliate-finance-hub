-- Recriar o trigger que estava faltando na tabela giros_gratis
-- O trigger deve disparar BEFORE INSERT OR UPDATE para poder modificar NEW.cash_ledger_id

DROP TRIGGER IF EXISTS trg_giro_gratis_lancamento ON public.giros_gratis;

CREATE TRIGGER trg_giro_gratis_lancamento
  BEFORE INSERT OR UPDATE ON public.giros_gratis
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_giro_gratis_gerar_lancamento();

-- Também garantir que o trigger de cashback existe
DROP TRIGGER IF EXISTS trg_cashback_lancamento ON public.cashback_registros;

CREATE TRIGGER trg_cashback_lancamento
  BEFORE INSERT OR UPDATE ON public.cashback_registros
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_cashback_gerar_lancamento();