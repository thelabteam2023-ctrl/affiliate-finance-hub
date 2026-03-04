DO $$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['cash_ledger', 'parcerias', 'pagamentos_operador', 'movimentacoes_indicacao', 'parceiro_lucro_alertas'])
  LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tbl);
    EXCEPTION WHEN duplicate_object THEN
      -- already added, skip
    END;
  END LOOP;
END $$;