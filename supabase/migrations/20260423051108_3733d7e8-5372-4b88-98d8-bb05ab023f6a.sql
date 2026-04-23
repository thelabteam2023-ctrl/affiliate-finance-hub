-- =========================================================================
-- MIGRATION 1 / Parte A: Restauração pontual Diego/EVERYGAME no Fênix
-- =========================================================================

-- 1) Criar registro órfão em project_bookmaker_link_bonuses
INSERT INTO public.project_bookmaker_link_bonuses (
  workspace_id,
  project_id,
  bookmaker_id,
  title,
  bonus_amount,
  currency,
  status,
  credited_at,
  expires_at,
  notes,
  created_by,
  user_id,
  source,
  rollover_multiplier,
  rollover_base,
  rollover_target_amount,
  rollover_progress,
  deposit_amount,
  min_odds,
  deadline_days,
  saldo_atual,
  valor_creditado_no_saldo,
  tipo_bonus,
  created_at,
  updated_at
) VALUES (
  'feee9758-a7f4-474c-b2b1-679b66ec1cd9',                 -- workspace_id
  '438cef89-4a9a-4e72-8bc9-b1c3d7dc9693',                 -- project_id (Fênix)
  '8de2ba2c-011b-49f4-970e-be8637a9b05e',                 -- bookmaker_id (EVERYGAME Diego)
  'Boas-vindas 50%',                                       -- title
  200,                                                     -- bonus_amount
  'USD',                                                   -- currency
  'credited',                                              -- status
  '2026-03-16 19:41:27.28099+00',                          -- credited_at (preservado)
  NULL,                                                    -- expires_at
  'Restauração órfão: bônus criado originalmente no projeto LUIZ FELIPE II (8d836024) e perdido na migração para FÊNIX em 22/04/2026. Ledger original BONUS_CREDITADO id=243deb31-2a3a-4188-88b3-9f5ef485bcd8.',
  '27d899b5-8f91-46b7-a71d-a22deb48c31d',                 -- created_by
  '27d899b5-8f91-46b7-a71d-a22deb48c31d',                 -- user_id
  'manual',                                                -- source
  1,                                                       -- rollover_multiplier (placeholder)
  'bonus_amount',
  200,
  0,
  400,                                                     -- deposit_amount (depósito original)
  NULL,
  NULL,
  200,                                                     -- saldo_atual
  200,                                                     -- valor_creditado_no_saldo
  'BONUS',
  '2026-03-16 19:41:27.28099+00',                          -- created_at preservado
  NOW()
);

-- 2) Cancelar o BONUS_ESTORNO indevido (id 1ca6f54f) sem deletar
UPDATE public.cash_ledger
SET 
  status = 'CANCELADO',
  auditoria_metadata = COALESCE(auditoria_metadata, '{}'::jsonb) || jsonb_build_object(
    'cancelled_at', NOW(),
    'cancelled_reason', 'orphan_bonus_remediation_no_record_to_revert',
    'cancelled_by_rpc', 'manual_remediation_orphan_bonus_diego_everygame',
    'note', 'Estorno gerado por tentativa de exclusão de bônus que não tinha registro em project_bookmaker_link_bonuses no projeto destino. Registro de bônus restaurado nesta mesma migração.'
  )
WHERE id = '1ca6f54f-5c96-44e0-8762-6703bad8795d'
  AND tipo_transacao = 'BONUS_ESTORNO';