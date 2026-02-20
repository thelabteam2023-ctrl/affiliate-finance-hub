
-- Corrigir política de SELECT da tabela bancos:
-- Bancos do sistema (is_system=true) e bancos criados por usuários devem ser visíveis
-- para TODOS os usuários autenticados, não apenas para quem criou.

DROP POLICY IF EXISTS "Users can view system banks and own banks" ON public.bancos;

CREATE POLICY "Authenticated users can view all banks"
  ON public.bancos
  FOR SELECT
  TO authenticated
  USING (true);
