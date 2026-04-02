
-- Remove despesas_administrativas duplicadas criadas pela migration anterior
-- para transações PAGTO_OPERADOR que já existem no cash_ledger
DELETE FROM despesas_administrativas 
WHERE id IN (
  '0e50103c-4764-4267-9f36-a81bd209ec47',  -- Daniel Marcos 02/04 R$3392
  'eb2244ac-b36a-4a29-8877-0b924e31eb8e'   -- Daniel Marcos 03/03 R$2697.60
);

-- Remove despesas de comissão de indicação duplicadas
DELETE FROM despesas_administrativas 
WHERE descricao ILIKE 'Comissão por indicação%'
  AND grupo = 'RECURSOS_HUMANOS'
  AND data_despesa IN ('2026-01-23', '2026-01-16');
