
-- Atualizar constraint de status para incluir AGUARDANDO_CICLO
ALTER TABLE participacao_ciclos DROP CONSTRAINT chk_participacao_status;

ALTER TABLE participacao_ciclos ADD CONSTRAINT chk_participacao_status 
CHECK (status IN ('AGUARDANDO_CICLO', 'A_PAGAR', 'PAGO'));

-- Atualizar constraint de tipo_participacao para incluir LUCRO_CICLO
ALTER TABLE participacao_ciclos DROP CONSTRAINT chk_tipo_participacao;

ALTER TABLE participacao_ciclos ADD CONSTRAINT chk_tipo_participacao 
CHECK (tipo_participacao IN ('REGULAR', 'LUCRO_CICLO', 'AJUSTE_POSITIVO', 'BONUS'));
