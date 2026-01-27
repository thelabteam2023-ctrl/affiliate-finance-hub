
-- Corrige o trigger para disparar em qualquer UPDATE
-- e também em INSERT (para novas transações já CONFIRMADAS)

DROP TRIGGER IF EXISTS tr_cash_ledger_generate_financial_events ON cash_ledger;

-- Trigger que dispara em INSERT e UPDATE (não apenas UPDATE OF status)
CREATE TRIGGER tr_cash_ledger_generate_financial_events
    BEFORE INSERT OR UPDATE ON cash_ledger
    FOR EACH ROW
    EXECUTE FUNCTION fn_cash_ledger_generate_financial_events();
