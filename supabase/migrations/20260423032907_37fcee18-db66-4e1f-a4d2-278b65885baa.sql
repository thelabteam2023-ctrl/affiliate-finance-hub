-- ============================================================================
-- ENTREGA 1: Correção pontual do bônus EVERYGAME 8de2ba2c
-- ============================================================================
-- Bônus "Boas-vindas 50%" estava em LUIZ FELIPE II (BRL) → mover para BONUS FÊNIX (USD)
-- Validação: a conta nunca operou (zero apostas) no projeto antigo
DO $$
DECLARE
  v_bonus_id uuid := '1b9d0b78-25c5-4c2f-914e-d8f860de9c1f';
  v_bookmaker_id uuid := '8de2ba2c-011b-49f4-970e-be8637a9b05e';
  v_projeto_antigo uuid := '8d836024-116a-426b-bfb8-60c614f5196a'; -- LUIZ FELIPE II
  v_projeto_novo uuid := '438cef89-4a9a-4e72-8bc9-b1c3d7dc9693';   -- BONUS FÊNIX
  v_apostas_antigas int;
BEGIN
  SELECT COUNT(*) INTO v_apostas_antigas
  FROM apostas_unificada
  WHERE bookmaker_id = v_bookmaker_id AND projeto_id = v_projeto_antigo;

  IF v_apostas_antigas > 0 THEN
    RAISE EXCEPTION 'ABORTADO: A casa tem % apostas no projeto antigo. Reclassificação não permitida.', v_apostas_antigas;
  END IF;

  UPDATE project_bookmaker_link_bonuses
  SET project_id = v_projeto_novo,
      currency   = 'USD',
      updated_at = now()
  WHERE id = v_bonus_id
    AND project_id = v_projeto_antigo;

  RAISE NOTICE '✅ Bônus % reclassificado: LUIZ FELIPE II (BRL) → BONUS FÊNIX (USD)', v_bonus_id;
END $$;

-- ============================================================================
-- ENTREGA 2: Função RPC reclassificar_bonus_origem (genérica)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.reclassificar_bonus_origem(
  p_bonus_id uuid,
  p_novo_projeto_id uuid,
  p_nova_moeda text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bonus record;
  v_bookmaker record;
  v_projeto_atual_id uuid;
  v_workspace_id uuid;
  v_apostas_no_antigo int;
  v_user_id uuid := auth.uid();
  v_moeda_final text;
BEGIN
  -- 1. Carregar bônus
  SELECT * INTO v_bonus
  FROM project_bookmaker_link_bonuses
  WHERE id = p_bonus_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bônus não encontrado');
  END IF;

  IF v_bonus.status NOT IN ('credited','finalized') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Apenas bônus creditados ou finalizados podem ser reclassificados');
  END IF;

  v_projeto_atual_id := v_bonus.project_id;
  v_workspace_id := v_bonus.workspace_id;

  -- 2. Carregar bookmaker
  SELECT id, nome, projeto_id, moeda, workspace_id INTO v_bookmaker
  FROM bookmakers
  WHERE id = v_bonus.bookmaker_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bookmaker do bônus não encontrado');
  END IF;

  -- 3. Validar workspace
  IF v_bookmaker.workspace_id <> v_workspace_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Workspace do bookmaker não bate com o do bônus');
  END IF;

  -- 4. Validar que o novo projeto existe e é do mesmo workspace
  IF NOT EXISTS (
    SELECT 1 FROM projetos
    WHERE id = p_novo_projeto_id AND workspace_id = v_workspace_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Novo projeto inválido ou pertence a outro workspace');
  END IF;

  -- 5. Validar que o bookmaker está no novo projeto (ou seja, foi transferido)
  IF v_bookmaker.projeto_id IS DISTINCT FROM p_novo_projeto_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'A casa precisa estar atualmente vinculada ao novo projeto antes da reclassificação'
    );
  END IF;

  -- 6. REGRA CRÍTICA: zero apostas dessa casa no projeto antigo
  IF v_projeto_atual_id IS NOT NULL THEN
    SELECT COUNT(*) INTO v_apostas_no_antigo
    FROM apostas_unificada
    WHERE bookmaker_id = v_bookmaker.id
      AND projeto_id = v_projeto_atual_id;

    IF v_apostas_no_antigo > 0 THEN
      RETURN jsonb_build_object(
        'success', false,
        'error', format('Reclassificação bloqueada: a casa tem %s apostas no projeto de origem. Não é possível mover o bônus retroativamente.', v_apostas_no_antigo)
      );
    END IF;
  END IF;

  -- 7. Não permitir reclassificar para o mesmo projeto
  IF v_projeto_atual_id = p_novo_projeto_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'O bônus já está atribuído a este projeto');
  END IF;

  -- 8. Definir moeda final (mantém a original se não for fornecida)
  v_moeda_final := COALESCE(p_nova_moeda, v_bonus.currency);

  -- 9. Aplicar mudança
  UPDATE project_bookmaker_link_bonuses
  SET project_id = p_novo_projeto_id,
      currency   = v_moeda_final,
      updated_at = now()
  WHERE id = p_bonus_id;

  -- 10. Log de auditoria
  INSERT INTO audit_logs (
    actor_user_id, action, entity_type, entity_id, entity_name,
    workspace_id, before_data, after_data, metadata
  )
  VALUES (
    COALESCE(v_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    'UPDATE',
    'project_bookmaker_link_bonuses',
    p_bonus_id,
    v_bonus.title,
    v_workspace_id,
    jsonb_build_object('project_id', v_projeto_atual_id, 'currency', v_bonus.currency),
    jsonb_build_object('project_id', p_novo_projeto_id, 'currency', v_moeda_final),
    jsonb_build_object(
      'reason', 'reclassificar_bonus_origem',
      'bookmaker_id', v_bookmaker.id,
      'bookmaker_nome', v_bookmaker.nome,
      'projeto_origem', v_projeto_atual_id,
      'projeto_destino', p_novo_projeto_id,
      'moeda_origem', v_bonus.currency,
      'moeda_destino', v_moeda_final
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'bonus_id', p_bonus_id,
    'projeto_origem', v_projeto_atual_id,
    'projeto_destino', p_novo_projeto_id,
    'moeda_final', v_moeda_final
  );
END $$;

GRANT EXECUTE ON FUNCTION public.reclassificar_bonus_origem(uuid, uuid, text) TO authenticated;