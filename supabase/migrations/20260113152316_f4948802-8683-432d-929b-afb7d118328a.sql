
-- Corrigir search_path das funções criadas
CREATE OR REPLACE FUNCTION marcar_para_saque(p_bookmaker_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE bookmakers 
  SET 
    aguardando_saque_at = NOW(),
    estado_conta = CASE 
      WHEN status = 'limitada' THEN 'limitada'
      WHEN estado_conta = 'limitada' THEN 'limitada'
      ELSE 'ativo'
    END
  WHERE id = p_bookmaker_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION confirmar_saque_concluido(p_bookmaker_id UUID)
RETURNS VOID AS $$
DECLARE
  v_estado_anterior TEXT;
BEGIN
  SELECT estado_conta INTO v_estado_anterior
  FROM bookmakers WHERE id = p_bookmaker_id;
  
  UPDATE bookmakers 
  SET 
    aguardando_saque_at = NULL,
    status = COALESCE(v_estado_anterior, 'ativo')
  WHERE id = p_bookmaker_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
