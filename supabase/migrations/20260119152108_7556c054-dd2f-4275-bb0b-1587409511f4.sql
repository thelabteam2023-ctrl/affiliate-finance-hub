-- Adicionar coluna subcategoria_rh para categorizar tipos de pagamento de RH
ALTER TABLE despesas_administrativas 
ADD COLUMN subcategoria_rh TEXT CHECK (subcategoria_rh IN ('SALARIO_MENSAL', 'COMISSAO', 'ADIANTAMENTO', 'BONIFICACAO'));

-- Criar índice para consultas por subcategoria
CREATE INDEX idx_despesas_admin_subcategoria_rh ON despesas_administrativas(subcategoria_rh) WHERE subcategoria_rh IS NOT NULL;

-- Comentário explicativo
COMMENT ON COLUMN despesas_administrativas.subcategoria_rh IS 'Subcategoria para despesas de RH: SALARIO_MENSAL, COMISSAO, ADIANTAMENTO, BONIFICACAO';