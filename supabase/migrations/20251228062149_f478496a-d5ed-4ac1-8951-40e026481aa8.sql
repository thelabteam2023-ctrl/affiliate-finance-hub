
-- FASE 4: Tornar workspace_id NOT NULL nas tabelas de dados de negócio
-- Excluindo tabelas de sistema que podem ter workspace_id NULL legítimo

-- Tabelas core de operação
ALTER TABLE apostas_unificada ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE bookmakers ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE cash_ledger ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE entregas ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE fornecedores ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE freebets_recebidas ALTER COLUMN workspace_id SET NOT NULL;

-- Tabelas de indicação
ALTER TABLE indicacoes ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE indicador_acordos ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE indicadores_referral ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE movimentacoes_indicacao ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE promocao_participantes ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE promocoes_indicacao ALTER COLUMN workspace_id SET NOT NULL;

-- Tabelas de operadores
ALTER TABLE operador_projetos ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE pagamentos_operador ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE pagamentos_propostos ALTER COLUMN workspace_id SET NOT NULL;

-- Tabelas de parceiros
ALTER TABLE parceiro_lucro_alertas ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE parcerias ALTER COLUMN workspace_id SET NOT NULL;

-- Tabelas de projetos
ALTER TABLE participacao_ciclos ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE project_bookmaker_link_bonuses ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE projeto_bookmaker_historico ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE projeto_ciclos ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE projeto_conciliacoes ALTER COLUMN workspace_id SET NOT NULL;
ALTER TABLE projeto_perdas ALTER COLUMN workspace_id SET NOT NULL;

-- Tabelas de transações
ALTER TABLE transacoes_bookmakers ALTER COLUMN workspace_id SET NOT NULL;
