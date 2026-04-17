-- Harness de simulação: invoca a RPC real injetando JWT claim local
CREATE OR REPLACE FUNCTION public.simulate_reverter_movimentacao_caixa(
  p_transacao_id uuid,
  p_motivo text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_actor_user_id::text, 'role', 'authenticated')::text, true);
  v_result := public.reverter_movimentacao_caixa(p_transacao_id, p_motivo);
  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.simulate_excluir_movimentacao_caixa(
  p_transacao_id uuid,
  p_motivo text,
  p_actor_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_actor_user_id::text, 'role', 'authenticated')::text, true);
  v_result := public.excluir_movimentacao_caixa(p_transacao_id, p_motivo);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.simulate_reverter_movimentacao_caixa(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.simulate_excluir_movimentacao_caixa(uuid, text, uuid) FROM PUBLIC, anon, authenticated;