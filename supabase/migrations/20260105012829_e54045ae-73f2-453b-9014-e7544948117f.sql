-- ============================================
-- CORREÇÃO CRÍTICA: Remover filtros user_id das views
-- Problema: Views filtram por user_id = auth.uid() impedindo que 
-- membros do mesmo workspace vejam dados uns dos outros
-- Solução: Filtrar apenas por workspace_id
-- ============================================

-- 1. Corrigir v_parcerias_alerta (problema principal reportado)
DROP VIEW IF EXISTS v_parcerias_alerta;
CREATE VIEW v_parcerias_alerta AS
SELECT 
  p.id,
  p.user_id,
  p.parceiro_id,
  p.indicacao_id,
  p.data_inicio,
  p.duracao_dias,
  p.data_fim_prevista,
  p.data_fim_real,
  p.valor_comissao_indicador,
  p.comissao_paga,
  p.status,
  p.elegivel_renovacao,
  p.observacoes,
  par.nome AS parceiro_nome,
  par.cpf AS parceiro_cpf,
  i.nome AS indicador_nome,
  (p.data_fim_prevista - CURRENT_DATE) AS dias_restantes,
  CASE
    WHEN (p.data_fim_prevista - CURRENT_DATE) <= 0 THEN 'VENCIDA'
    WHEN (p.data_fim_prevista - CURRENT_DATE) <= 10 THEN 'ALERTA'
    WHEN (p.data_fim_prevista - CURRENT_DATE) <= 20 THEN 'ATENCAO'
    ELSE 'OK'
  END AS nivel_alerta
FROM parcerias p
JOIN parceiros par ON p.parceiro_id = par.id
LEFT JOIN indicacoes ind ON p.indicacao_id = ind.id
LEFT JOIN indicadores_referral i ON ind.indicador_id = i.id
WHERE p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
  AND p.workspace_id = get_current_workspace();

-- 2. Corrigir v_ciclos_proximos_fechamento
DROP VIEW IF EXISTS v_ciclos_proximos_fechamento;
CREATE VIEW v_ciclos_proximos_fechamento AS
SELECT 
  pc.id AS ciclo_id,
  pc.projeto_id,
  pc.operador_projeto_id,
  op.operador_id,
  o.nome AS operador_nome,
  p.nome AS projeto_nome,
  pc.tipo_gatilho,
  pc.meta_volume,
  pc.valor_acumulado,
  pc.excedente_anterior,
  pc.data_inicio,
  pc.data_fim_prevista,
  pc.data_fim_real,
  CASE
    WHEN pc.tipo_gatilho IN ('VOLUME', 'HIBRIDO') AND pc.meta_volume > 0 
    THEN round((pc.valor_acumulado / pc.meta_volume) * 100, 2)
    ELSE NULL
  END AS percentual_volume_atingido,
  CASE
    WHEN pc.tipo_gatilho IN ('TEMPO', 'HIBRIDO') AND pc.data_fim_prevista IS NOT NULL 
    THEN GREATEST(0, pc.data_fim_prevista - CURRENT_DATE)
    ELSE NULL
  END AS dias_restantes,
  CASE
    WHEN pc.tipo_gatilho IN ('VOLUME', 'HIBRIDO') AND pc.meta_volume > 0 AND (pc.valor_acumulado / pc.meta_volume) >= 0.9 THEN 'VOLUME_PROXIMO'
    WHEN pc.tipo_gatilho IN ('TEMPO', 'HIBRIDO') AND pc.data_fim_prevista IS NOT NULL AND (pc.data_fim_prevista - CURRENT_DATE) <= 3 THEN 'TEMPO_PROXIMO'
    ELSE 'NORMAL'
  END AS alerta,
  pc.status,
  pc.user_id
FROM projeto_ciclos pc
LEFT JOIN operador_projetos op ON pc.operador_projeto_id = op.id
LEFT JOIN operadores o ON op.operador_id = o.id
LEFT JOIN projetos p ON pc.projeto_id = p.id
WHERE pc.status = 'ABERTO'
  AND pc.workspace_id = get_current_workspace();

-- 3. Corrigir v_entregas_pendentes
DROP VIEW IF EXISTS v_entregas_pendentes;
CREATE VIEW v_entregas_pendentes AS
SELECT 
  e.id,
  e.user_id,
  e.operador_projeto_id,
  e.numero_entrega,
  e.descricao,
  e.data_inicio,
  e.data_fim_prevista,
  e.tipo_gatilho,
  e.tipo_meta,
  e.meta_valor,
  e.meta_percentual,
  e.base_calculo,
  e.saldo_inicial,
  e.resultado_nominal,
  e.status,
  e.created_at,
  op.operador_id,
  op.projeto_id,
  op.modelo_pagamento,
  op.valor_fixo,
  op.percentual,
  o.nome AS operador_nome,
  p.nome AS projeto_nome,
  CASE
    WHEN e.tipo_gatilho = 'META_ATINGIDA' AND e.resultado_nominal >= COALESCE(e.meta_valor, 0) THEN 'PRONTA'
    WHEN e.tipo_gatilho = 'PERIODO' AND e.data_fim_prevista <= CURRENT_DATE THEN 'PRONTA'
    ELSE 'EM_ANDAMENTO'
  END AS status_conciliacao,
  CASE
    WHEN e.tipo_gatilho = 'META_ATINGIDA' AND e.resultado_nominal >= COALESCE(e.meta_valor, 0) THEN 'CRITICA'
    WHEN e.tipo_gatilho = 'PERIODO' AND e.data_fim_prevista <= CURRENT_DATE THEN 'ALTA'
    WHEN e.tipo_gatilho = 'PERIODO' AND e.data_fim_prevista <= (CURRENT_DATE + INTERVAL '3 days') THEN 'NORMAL'
    ELSE 'BAIXA'
  END AS nivel_urgencia
FROM entregas e
JOIN operador_projetos op ON e.operador_projeto_id = op.id
JOIN operadores o ON op.operador_id = o.id
JOIN projetos p ON op.projeto_id = p.id
WHERE e.status = 'EM_ANDAMENTO'
  AND e.conciliado = false
  AND e.workspace_id = get_current_workspace();

-- 4. Corrigir v_operadores_sem_entrega
DROP VIEW IF EXISTS v_operadores_sem_entrega;
CREATE VIEW v_operadores_sem_entrega AS
SELECT 
  op.id AS operador_projeto_id,
  op.operador_id,
  op.projeto_id,
  op.modelo_pagamento,
  op.status,
  op.user_id,
  o.nome AS operador_nome,
  p.nome AS projeto_nome
FROM operador_projetos op
JOIN operadores o ON op.operador_id = o.id
JOIN projetos p ON op.projeto_id = p.id
WHERE op.status = 'ATIVO'
  AND op.workspace_id = get_current_workspace()
  AND NOT EXISTS (
    SELECT 1 FROM entregas e 
    WHERE e.operador_projeto_id = op.id AND e.status = 'EM_ANDAMENTO'
  );

-- 5. Corrigir v_indicador_performance
DROP VIEW IF EXISTS v_indicador_performance;
CREATE VIEW v_indicador_performance AS
SELECT 
  id AS indicador_id,
  user_id,
  nome,
  cpf,
  status,
  telefone,
  email,
  COALESCE((
    SELECT count(DISTINCT ind.parceiro_id)
    FROM indicacoes ind
    JOIN parceiros par ON par.id = ind.parceiro_id
    WHERE ind.indicador_id = i.id 
      AND par.workspace_id = get_current_workspace()
  ), 0) AS total_parceiros_indicados,
  COALESCE((
    SELECT count(DISTINCT p.id)
    FROM indicacoes ind
    JOIN parcerias p ON ind.id = p.indicacao_id
    WHERE ind.indicador_id = i.id 
      AND p.status = 'ATIVA'
      AND p.workspace_id = get_current_workspace()
  ), 0) AS parcerias_ativas,
  COALESCE((
    SELECT count(DISTINCT p.id)
    FROM indicacoes ind
    JOIN parcerias p ON ind.id = p.indicacao_id
    WHERE ind.indicador_id = i.id 
      AND p.status = 'ENCERRADA'
      AND p.workspace_id = get_current_workspace()
  ), 0) AS parcerias_encerradas,
  COALESCE((
    SELECT sum(m.valor)
    FROM v_movimentacoes_indicacao_workspace m
    WHERE m.indicador_id = i.id 
      AND m.tipo = 'COMISSAO_INDICADOR'
      AND m.status = 'CONFIRMADO'
  ), 0) AS total_comissoes,
  COALESCE((
    SELECT sum(m.valor)
    FROM v_movimentacoes_indicacao_workspace m
    WHERE m.indicador_id = i.id 
      AND m.tipo = 'BONUS_INDICADOR'
      AND m.status = 'CONFIRMADO'
  ), 0) AS total_bonus
FROM indicadores_referral i
WHERE workspace_id = get_current_workspace();

-- 6. Corrigir v_alertas_parcerias (adicionando filtro de workspace)
DROP VIEW IF EXISTS v_alertas_parcerias;
CREATE VIEW v_alertas_parcerias AS
SELECT 
  p.id AS parceria_id,
  p.user_id,
  pa.nome AS parceiro_nome,
  p.data_inicio,
  p.data_fim_prevista,
  p.duracao_dias,
  (p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) AS dias_restantes,
  p.status,
  CASE
    WHEN (p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) <= 0 THEN 'VENCIDA'
    WHEN (p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) <= 3 THEN 'CRITICA'
    WHEN (p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) <= 7 THEN 'ALTA'
    WHEN (p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) <= 15 THEN 'NORMAL'
    WHEN (p.data_fim_prevista - (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date) <= 30 THEN 'BAIXA'
    ELSE 'OK'
  END AS nivel_urgencia
FROM parcerias p
JOIN parceiros pa ON p.parceiro_id = pa.id
WHERE p.status IN ('ATIVA', 'EM_ENCERRAMENTO')
  AND p.workspace_id = get_current_workspace();