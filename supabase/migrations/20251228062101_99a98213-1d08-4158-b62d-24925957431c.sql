
-- FASE 3 (Parte 4): Remover últimas 2 policies problemáticas

DROP POLICY IF EXISTS "Workspace isolation user_favorites SELECT" ON user_favorites;
DROP POLICY IF EXISTS "Workspace isolation user_favorites DELETE" ON user_favorites;
