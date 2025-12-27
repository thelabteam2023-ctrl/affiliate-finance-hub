-- Adicionar política INSERT para permitir que usuários registrem seus próprios logins
CREATE POLICY "Users can insert their own login history"
ON login_history FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Também adicionar política para usuários verem seu próprio histórico
CREATE POLICY "Users can view their own login history"
ON login_history FOR SELECT
TO authenticated
USING (user_id = auth.uid());