-- View para histórico e análise de bônus (modelo unificado)
CREATE OR REPLACE VIEW v_bonus_historico AS
SELECT 
  b.id,
  b.bookmaker_id,
  b.project_id,
  b.workspace_id,
  b.title,
  b.source,
  b.status,
  b.bonus_amount,
  b.currency,
  b.valor_creditado_no_saldo,
  b.saldo_atual as saldo_residual,
  b.rollover_multiplier,
  b.rollover_base,
  b.rollover_target_amount,
  b.rollover_progress,
  b.min_odds,
  b.deposit_amount,
  b.deadline_days,
  b.expires_at,
  b.credited_at,
  b.finalized_at,
  b.finalize_reason,
  b.notes,
  b.created_at,
  b.updated_at,
  b.migrado_para_saldo_unificado,
  b.cotacao_credito_snapshot,
  b.valor_brl_referencia,
  bk.nome as bookmaker_nome,
  bk.moeda as bookmaker_moeda,
  bc.nome as bookmaker_catalogo_nome,
  bc.logo_url as bookmaker_logo,
  p.nome as projeto_nome,
  -- Cálculos úteis
  CASE 
    WHEN b.rollover_target_amount > 0 THEN 
      ROUND((b.rollover_progress / b.rollover_target_amount * 100)::numeric, 2)
    ELSE 100
  END as rollover_percentual,
  CASE 
    WHEN b.expires_at IS NOT NULL AND b.expires_at < NOW() THEN true
    ELSE false
  END as expirado,
  CASE 
    WHEN b.rollover_target_amount > 0 AND b.rollover_progress >= b.rollover_target_amount THEN true
    ELSE false
  END as rollover_completo
FROM project_bookmaker_link_bonuses b
JOIN bookmakers bk ON bk.id = b.bookmaker_id
LEFT JOIN bookmakers_catalogo bc ON bc.id = bk.bookmaker_catalogo_id
LEFT JOIN projetos p ON p.id = b.project_id;

-- Comentário explicativo
COMMENT ON VIEW v_bonus_historico IS 'View para consulta histórica e análise de bônus. Após migração para saldo unificado, bonus_amount representa o valor original e valor_creditado_no_saldo o que foi creditado no saldo do bookmaker.';