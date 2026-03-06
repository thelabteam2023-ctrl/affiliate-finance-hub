-- CORREÇÃO: Remover financial_events fantasma gerados em 2026-03-06 05:20:36
-- que re-creditaram saldos de bookmakers já sacadas/encerradas.

-- 1. Deletar os 4 financial_events fantasma
DELETE FROM financial_events 
WHERE id IN (
  '27f88a23-cc03-467e-939e-e12bb5788f92',
  'b6f4522d-9546-4c94-8897-18ce2d42ad99',
  '0d19bf90-db81-4273-82fa-9f943ba96936',
  '7c939610-c49a-4f36-9a52-e307a351ab2f'
);

-- 2. Corrigir saldo_atual para 0 e limpar aguardando_saque_at
UPDATE bookmakers 
SET 
  saldo_atual = 0,
  aguardando_saque_at = NULL,
  status_pre_bloqueio = NULL,
  updated_at = NOW()
WHERE id IN (
  '80bff40c-b626-4c32-be15-63457bcb93ed',
  '932ba9fb-f20c-420c-8fec-752522ed4e1a',
  '81042e68-7867-4954-918f-0ea2b6352ebe',
  'e4ff4cfa-8111-4190-bb9d-5df3208f92be'
);

-- 3. Limpar registros de auditoria fantasma
DELETE FROM bookmaker_balance_audit
WHERE bookmaker_id IN (
  '80bff40c-b626-4c32-be15-63457bcb93ed',
  '932ba9fb-f20c-420c-8fec-752522ed4e1a',
  '81042e68-7867-4954-918f-0ea2b6352ebe',
  'e4ff4cfa-8111-4190-bb9d-5df3208f92be'
)
AND created_at >= '2026-03-06 05:20:36'
AND created_at <= '2026-03-06 05:20:37';