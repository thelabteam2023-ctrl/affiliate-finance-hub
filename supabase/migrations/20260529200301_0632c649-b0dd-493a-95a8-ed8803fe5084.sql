CREATE OR REPLACE FUNCTION public._admin_debug_delete(_ws uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE _err text;
BEGIN
  BEGIN
    DELETE FROM public.parceiros WHERE workspace_id=_ws;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS _err = MESSAGE_TEXT;
    RETURN _err;
  END;
END $$;
SELECT public._admin_debug_delete('aa47a3f3-f679-4601-84c3-645b3085ea47'::uuid) AS err;
DROP FUNCTION public._admin_debug_delete(uuid);