-- Forçar sincronização de todas as bookmakers para garantir que o saldo mostrado reflita o ledger
SELECT public.force_sync_all_balances();

-- Adicionar um log para confirmar que a aposta citada está com saldos corretos agora
DO $$
DECLARE
    v_aposta_id UUID := 'c192159e-d7b3-46d7-a9ae-c69d01a87713';
    v_bk_id UUID := '8de2ba2c-011b-49f4-970e-be8637a9b05e';
    v_saldo NUMERIC;
BEGIN
    SELECT saldo_atual INTO v_saldo FROM public.bookmakers WHERE id = v_bk_id;
    RAISE NOTICE 'Saldo final da Everygame após sync: %', v_saldo;
END $$;
