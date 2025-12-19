-- =============================================
-- Ajustar public_id para iniciar em 0050 (reservar 0001-0049)
-- =============================================

-- 1) Atualizar IDs existentes para iniciar em 0050
DO $$
DECLARE
  r RECORD;
  v_counter INTEGER := 49; -- Começará em 50
BEGIN
  -- Loop pelos usuários ordenados por created_at
  FOR r IN (
    SELECT id 
    FROM profiles 
    ORDER BY created_at ASC
  ) LOOP
    v_counter := v_counter + 1;
    UPDATE profiles SET public_id = LPAD(v_counter::TEXT, 4, '0') WHERE id = r.id;
  END LOOP;
  
  -- Atualizar sequence para continuar do próximo
  PERFORM setval('profiles_public_id_seq', v_counter, true);
END $$;

-- 2) Verificar resultado
-- SELECT id, email, public_id, created_at FROM profiles ORDER BY created_at ASC;