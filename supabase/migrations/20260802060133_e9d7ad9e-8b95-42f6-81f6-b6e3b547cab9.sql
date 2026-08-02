ALTER TABLE public.ocorrencias
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid,
  ADD COLUMN IF NOT EXISTS delete_reason text,
  ADD COLUMN IF NOT EXISTS cancel_reason text;

CREATE INDEX IF NOT EXISTS idx_ocorrencias_deleted_at ON public.ocorrencias (workspace_id, deleted_at);

-- Elimina exclusão física
DROP POLICY IF EXISTS "Admins podem excluir ocorrências do workspace" ON public.ocorrencias;
DROP POLICY IF EXISTS delete_ocorrencias ON public.ocorrencias;
REVOKE DELETE ON public.ocorrencias FROM authenticated;

-- Arquivadas só visíveis para owner/admin
DROP POLICY IF EXISTS select_ocorrencias ON public.ocorrencias;
CREATE POLICY select_ocorrencias ON public.ocorrencias
FOR SELECT TO authenticated
USING (
  is_workspace_member_active(auth.uid(), workspace_id)
  AND (deleted_at IS NULL OR is_workspace_owner_or_admin(auth.uid(), workspace_id))
);

CREATE OR REPLACE FUNCTION public.soft_delete_ocorrencia(p_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oc public.ocorrencias%ROWTYPE;
BEGIN
  SELECT * INTO v_oc FROM public.ocorrencias WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA';
  END IF;

  IF NOT is_workspace_owner_or_admin(auth.uid(), v_oc.workspace_id) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: apenas owner/admin podem arquivar ocorrências';
  END IF;

  IF v_oc.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'JA_ARQUIVADA';
  END IF;

  IF coalesce(p_motivo, '') = '' OR length(trim(p_motivo)) < 10 THEN
    RAISE EXCEPTION 'MOTIVO_OBRIGATORIO: informe ao menos 10 caracteres';
  END IF;

  IF coalesce(v_oc.perda_registrada_ledger, false) OR v_oc.perda_ledger_id IS NOT NULL THEN
    RAISE EXCEPTION 'VINCULO_FINANCEIRO: estorne a perda registrada no ledger antes de arquivar esta ocorrência';
  END IF;

  UPDATE public.ocorrencias
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         delete_reason = trim(p_motivo),
         updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.ocorrencias_eventos (ocorrencia_id, workspace_id, tipo, conteudo, autor_id, valor_anterior, valor_novo)
  VALUES (p_id, v_oc.workspace_id, 'campo_alterado', trim(p_motivo), auth.uid(), to_jsonb(v_oc)::text, 'ARQUIVADA');

  PERFORM public.create_audit_log(
    'DELETE'::audit_action, 'ocorrencia', p_id, v_oc.titulo,
    to_jsonb(v_oc), NULL,
    jsonb_build_object('motivo', trim(p_motivo), 'soft_delete', true, 'workspace_id', v_oc.workspace_id)
  );

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_ocorrencia(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_oc public.ocorrencias%ROWTYPE;
BEGIN
  SELECT * INTO v_oc FROM public.ocorrencias WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'OCORRENCIA_NAO_ENCONTRADA';
  END IF;

  IF NOT is_workspace_owner_or_admin(auth.uid(), v_oc.workspace_id) THEN
    RAISE EXCEPTION 'PERMISSAO_NEGADA: apenas owner/admin podem restaurar ocorrências';
  END IF;

  IF v_oc.deleted_at IS NULL THEN
    RETURN jsonb_build_object('success', true, 'id', p_id, 'noop', true);
  END IF;

  UPDATE public.ocorrencias
     SET deleted_at = NULL, deleted_by = NULL, delete_reason = NULL, updated_at = now()
   WHERE id = p_id;

  INSERT INTO public.ocorrencias_eventos (ocorrencia_id, workspace_id, tipo, conteudo, autor_id, valor_anterior, valor_novo)
  VALUES (p_id, v_oc.workspace_id, 'campo_alterado', 'Ocorrência restaurada do arquivo', auth.uid(), 'ARQUIVADA', 'ATIVA');

  PERFORM public.create_audit_log(
    'UPDATE'::audit_action, 'ocorrencia', p_id, v_oc.titulo,
    to_jsonb(v_oc), NULL,
    jsonb_build_object('restore', true, 'workspace_id', v_oc.workspace_id)
  );

  RETURN jsonb_build_object('success', true, 'id', p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_ocorrencia(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_ocorrencia(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_ocorrencia(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_ocorrencia(uuid) TO authenticated;