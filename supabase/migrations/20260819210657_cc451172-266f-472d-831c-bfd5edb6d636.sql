-- 1) get_user_workspace: validar default contra membership ativo
CREATE OR REPLACE FUNCTION public.get_user_workspace(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    -- default do perfil, SOMENTE se houver membership ativo e workspace ativo
    (SELECT p.default_workspace_id
       FROM public.profiles p
       JOIN public.workspace_members wm
         ON wm.workspace_id = p.default_workspace_id
        AND wm.user_id = p.id
        AND wm.is_active = true
       JOIN public.workspaces w
         ON w.id = wm.workspace_id
        AND COALESCE(w.is_active, true) = true
      WHERE p.id = _user_id),
    -- fallback: primeiro membership ativo válido (owner primeiro)
    (SELECT wm.workspace_id
       FROM public.workspace_members wm
       JOIN public.workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = _user_id
        AND wm.is_active = true
        AND COALESCE(w.is_active, true) = true
      ORDER BY (wm.role = 'owner') DESC, wm.created_at ASC
      LIMIT 1)
  )
$function$;

-- 2) Resolver com auto-cura do default (usado no bootstrap de autenticação)
CREATE OR REPLACE FUNCTION public.resolve_my_workspace(_preferred uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_ws uuid;
BEGIN
  IF v_user IS NULL THEN
    RETURN NULL;
  END IF;

  -- Preferência (aba/sessão) só vale se houver vínculo ativo válido
  IF _preferred IS NOT NULL THEN
    SELECT wm.workspace_id INTO v_ws
    FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = v_user
      AND wm.workspace_id = _preferred
      AND wm.is_active = true
      AND COALESCE(w.is_active, true) = true;
  END IF;

  IF v_ws IS NULL THEN
    v_ws := public.get_user_workspace(v_user);
  END IF;

  -- Auto-cura: corrigir default inválido/desatualizado do perfil
  IF v_ws IS NOT NULL THEN
    UPDATE public.profiles p
       SET default_workspace_id = v_ws
     WHERE p.id = v_user
       AND p.default_workspace_id IS DISTINCT FROM v_ws
       AND NOT EXISTS (
         SELECT 1 FROM public.workspace_members wm
         JOIN public.workspaces w ON w.id = wm.workspace_id
         WHERE wm.user_id = v_user
           AND wm.workspace_id = p.default_workspace_id
           AND wm.is_active = true
           AND COALESCE(w.is_active, true) = true
       );
  END IF;

  RETURN v_ws;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.resolve_my_workspace(uuid) TO authenticated;

-- 3) Trigger: ao desativar/remover um vínculo, não deixar o perfil apontando para ele
CREATE OR REPLACE FUNCTION public.fn_sync_default_workspace_on_membership_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := COALESCE(NEW.user_id, OLD.user_id);
  v_ws uuid := COALESCE(NEW.workspace_id, OLD.workspace_id);
  v_next uuid;
BEGIN
  -- Vínculo ativado: se o perfil está sem default válido, adota este
  IF TG_OP <> 'DELETE' AND NEW.is_active = true THEN
    UPDATE public.profiles p
       SET default_workspace_id = v_ws
     WHERE p.id = v_user
       AND (p.default_workspace_id IS NULL
            OR NOT EXISTS (
              SELECT 1 FROM public.workspace_members wm
              JOIN public.workspaces w ON w.id = wm.workspace_id
              WHERE wm.user_id = v_user
                AND wm.workspace_id = p.default_workspace_id
                AND wm.is_active = true
                AND COALESCE(w.is_active, true) = true
            ));
    RETURN NEW;
  END IF;

  -- Vínculo desativado/removido: se era o default, migrar para outro ativo
  SELECT wm.workspace_id INTO v_next
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.user_id = v_user
    AND wm.is_active = true
    AND COALESCE(w.is_active, true) = true
    AND wm.workspace_id <> v_ws
  ORDER BY (wm.role = 'owner') DESC, wm.created_at ASC
  LIMIT 1;

  UPDATE public.profiles
     SET default_workspace_id = v_next
   WHERE id = v_user
     AND default_workspace_id = v_ws;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_default_workspace ON public.workspace_members;
CREATE TRIGGER trg_sync_default_workspace
AFTER INSERT OR UPDATE OF is_active OR DELETE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_default_workspace_on_membership_change();

-- 4) Saneamento geral (sem exceção para usuário específico):
--    todo perfil cujo default aponta para vínculo inativo/inexistente é corrigido
UPDATE public.profiles p
   SET default_workspace_id = (
     SELECT wm.workspace_id
       FROM public.workspace_members wm
       JOIN public.workspaces w ON w.id = wm.workspace_id
      WHERE wm.user_id = p.id
        AND wm.is_active = true
        AND COALESCE(w.is_active, true) = true
      ORDER BY (wm.role = 'owner') DESC, wm.created_at ASC
      LIMIT 1
   )
 WHERE p.default_workspace_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.workspace_members wm
     JOIN public.workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = p.id
       AND wm.workspace_id = p.default_workspace_id
       AND wm.is_active = true
       AND COALESCE(w.is_active, true) = true
   );