
ALTER TABLE cash_ledger DROP CONSTRAINT cash_ledger_origem_tipo_check;
ALTER TABLE cash_ledger ADD CONSTRAINT cash_ledger_origem_tipo_check 
  CHECK (origem_tipo = ANY (ARRAY['CAIXA_OPERACIONAL','PARCEIRO_CONTA','PARCEIRO_WALLET','BOOKMAKER','INVESTIDOR','AJUSTE']));

ALTER TABLE cash_ledger DROP CONSTRAINT cash_ledger_destino_tipo_check;
ALTER TABLE cash_ledger ADD CONSTRAINT cash_ledger_destino_tipo_check 
  CHECK ((destino_tipo IS NULL) OR (destino_tipo = ANY (ARRAY['CAIXA_OPERACIONAL','PARCEIRO','PARCEIRO_CONTA','PARCEIRO_WALLET','BOOKMAKER','INVESTIDOR','FORNECEDOR','INDICADOR','OPERADOR','AJUSTE'])));
