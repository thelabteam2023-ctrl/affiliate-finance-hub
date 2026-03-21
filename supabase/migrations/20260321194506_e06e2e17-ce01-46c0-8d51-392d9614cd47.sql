-- ============================================================
-- CORREÇÃO CIRÚRGICA: Casas que reapareceram com saldo após reprocessamento
-- ============================================================

-- CASO 1: BETANO Sebasthian (5f599383) — par DV/SV neutralizado
-- O depósito original (R$1500) de 2026-01-21 NÃO tem projeto_id_snapshot
-- O par DV+SV era do projeto a55c6329 e se anulam, mas o DEP original
-- ficou sem projeto e gerou evento financeiro na reprocessação
-- A casa está desvinculada (projeto_id IS NULL), logo o saldo de R$1500
-- está correto pelo DEP original. O problema é que o DEP original
-- NÃO deveria ter gerado evento se não há mais projeto vinculado.
-- SOLUÇÃO: O saldo É real (o dinheiro está lá), a casa precisa aparecer
-- como disponível para vínculo. Não há inflação aqui — é saldo real sem projeto.

-- CASO 2: BANKONBET Luiz Felipe (28a61306) — mesmo padrão
-- DEP R$200 + DV R$200 - SV R$200 = net R$200
-- Saldo real da casa é R$200. Correto.

-- CASO 3: BLAZE Alef (5ad0d7f1) — DV INFLOU o saldo
-- DEP R$2000 + DV R$1673.71 = R$3673.71 créditos
-- SAQ R$3673.71 = R$3673.71 débitos → NET deveria ser ZERO
-- Mas net_events = R$1673.71 (DV + DEP foram creditados, SAQ debitou tudo)
-- O DV é redundante pois o depósito real já cobria o saldo na época
-- SOLUÇÃO: Cancelar o DV e recalcular

-- Cancelar o DEPOSITO_VIRTUAL redundante da BLAZE Alef
UPDATE public.cash_ledger
SET status = 'CANCELADO',
    descricao = coalesce(descricao, '') || ' [CANCELADO: redundante com depósito real de R$2000 - auditoria 2026-03-21]'
WHERE id = '9ed58221-c5e0-4060-867d-2f00d153ecbd'
  AND tipo_transacao = 'DEPOSITO_VIRTUAL'
  AND status = 'CONFIRMADO';

-- Deletar o evento financeiro gerado pelo DV da BLAZE
DELETE FROM public.financial_events
WHERE idempotency_key = 'ledger_deposit_9ed58221-c5e0-4060-867d-2f00d153ecbd'
  AND bookmaker_id = '5ad0d7f1-60c1-4bdf-ab98-60afe130666f';

-- Recalcular saldo da BLAZE: sum de todos financial_events restantes
DO $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  SELECT coalesce(sum(valor), 0)
  INTO v_new_balance
  FROM public.financial_events
  WHERE bookmaker_id = '5ad0d7f1-60c1-4bdf-ab98-60afe130666f';
  
  UPDATE public.bookmakers
  SET saldo_atual = v_new_balance,
      updated_at = now()
  WHERE id = '5ad0d7f1-60c1-4bdf-ab98-60afe130666f';
  
  RAISE LOG '[audit-fix] BLAZE Alef: saldo recalculado para %', v_new_balance;
END;
$$;

-- ============================================================
-- CASO 4: BETANO Sebasthian — o depósito original de R$1500 
-- (id: 2ee7a9d9) não tem projeto_id_snapshot e está gerando evento
-- financeiro mesmo com a casa desvinculada. Isso é correto:
-- o dinheiro ESTÁ na casa. O problema relatado é que ela "voltou a aparecer"
-- porque o reprocessamento recriou o evento do DEP original.
-- A casa TEM R$1500 reais. Se o usuário quer que ela não apareça,
-- precisa registrar um SAQUE ou AJUSTE para zerar.
-- NÃO vamos mexer aqui — é saldo real.
-- ============================================================

-- CASO 5: Verificar BETANO Sebasthian — o par DV/SV se anula perfeitamente
-- mas o DEP original gera +1500 de evento. Vamos verificar se o DEP 
-- deveria ter sido adotado pelo par e neutralizado
-- O DEP (2ee7a9d9) foi criado em 2026-01-21, o DV em 2026-03-16
-- O DV foi criado DEPOIS do DEP, portanto o DV é redundante
-- SOLUÇÃO: O DV já foi neutralizado pelo SV no reprocessamento. 
-- O saldo de R$1500 vem exclusivamente do DEP original. CORRETO.

-- ============================================================
-- RESUMO FINAL DE CORREÇÕES APLICADAS:
-- ============================================================
-- BLAZE Alef: DV cancelado, saldo recalculado de R$1673.71 → ~R$0
-- BETANO Sebasthian: Saldo R$1500 é REAL (DEP original) — sem correção
-- BANKONBET Luiz Felipe: Saldo R$200 é REAL (DEP original) — sem correção
-- BETEUM/KIKOBET/FRUMZI/etc: Saldos legítimos de operações — sem correção
-- ============================================================