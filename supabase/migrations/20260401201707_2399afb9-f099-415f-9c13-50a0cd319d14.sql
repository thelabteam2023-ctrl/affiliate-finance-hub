
-- 1. Corrigir tipo_uso nos financial_events (leg2 e leg3 da aposta f9cf13a3)
UPDATE financial_events 
SET tipo_uso = 'FREEBET'
WHERE id IN (
  '16a9665f-e30c-4163-8898-194daeddfc57',  -- leg2 (stake -4)
  '05182ef1-0d14-47b8-9996-346bb738dcf0'   -- leg3 (stake -8)
);

-- 2. Corrigir saldos da bookmaker BET365 Juliana (80969003-314a-4631-8da5-6be6be48efb4)
-- saldo_atual foi debitado indevidamente em 12 (4+8), devolver
-- saldo_freebet não foi debitado, debitar agora
UPDATE bookmakers 
SET saldo_atual = saldo_atual + 12,
    saldo_freebet = saldo_freebet - 12,
    updated_at = now()
WHERE id = '80969003-314a-4631-8da5-6be6be48efb4';
