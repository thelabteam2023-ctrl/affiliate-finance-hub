-- Corrigir saldo materializado para refletir a soma real dos financial_events (R$500)
UPDATE bookmakers SET saldo_atual = 500.00 WHERE id = '53b2e61c-8c90-4033-83b6-9eafa85c6db9';