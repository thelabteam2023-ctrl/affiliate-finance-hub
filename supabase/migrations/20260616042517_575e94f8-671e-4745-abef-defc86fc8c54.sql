
-- Função de validação: operador deve pertencer ao mesmo workspace
CREATE OR REPLACE FUNCTION public.enforce_operador_workspace_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op_workspace uuid;
BEGIN
  IF NEW.operador_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT workspace_id INTO v_op_workspace
  FROM public.operadores
  WHERE id = NEW.operador_id;

  IF v_op_workspace IS NULL THEN
    RAISE EXCEPTION 'Operador % não encontrado', NEW.operador_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_op_workspace <> NEW.workspace_id THEN
    RAISE EXCEPTION 'Cross-workspace bloqueado: operador % pertence ao workspace %, registro tenta gravar em %',
      NEW.operador_id, v_op_workspace, NEW.workspace_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger em despesas_administrativas
DROP TRIGGER IF EXISTS trg_despesas_adm_operador_workspace ON public.despesas_administrativas;
CREATE TRIGGER trg_despesas_adm_operador_workspace
BEFORE INSERT OR UPDATE OF operador_id, workspace_id ON public.despesas_administrativas
FOR EACH ROW EXECUTE FUNCTION public.enforce_operador_workspace_match();

-- Trigger em pagamentos_operador
DROP TRIGGER IF EXISTS trg_pagamentos_op_operador_workspace ON public.pagamentos_operador;
CREATE TRIGGER trg_pagamentos_op_operador_workspace
BEFORE INSERT OR UPDATE OF operador_id, workspace_id ON public.pagamentos_operador
FOR EACH ROW EXECUTE FUNCTION public.enforce_operador_workspace_match();
