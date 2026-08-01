ALTER FUNCTION public.reverter_movimentacao_caixa(uuid, text)
  RENAME TO reverter_movimentacao_caixa_inner;

CREATE OR REPLACE FUNCTION public.reverter_movimentacao_caixa(p_transacao_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_impact jsonb;
  v_neg jsonb;
BEGIN
  v_impact := public.fn_ledger_reversal_impact(p_transacao_id);

  IF COALESCE((v_impact->>'found')::boolean, false)
     AND COALESCE((v_impact->>'ativos_negativos')::int, 0) > 0 THEN

    SELECT a INTO v_neg
    FROM jsonb_array_elements(v_impact->'ativos_afetados') a
    WHERE (a->>'negativo')::boolean
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', false,
      'code', 'CADEIA_DEPENDENTE',
      'message', format(
        'Reversão bloqueada: o ativo "%s" ficaria com saldo negativo (%s %s) porque %s operação(ões) posterior(es) já consumiram esse recurso. Reverta a cadeia na ordem cronológica inversa.',
        COALESCE(v_neg->>'nome', 'destino'),
        round(COALESCE((v_neg->>'saldo_pos_reversao')::numeric, 0), 2),
        COALESCE(v_neg->>'moeda', ''),
        COALESCE(v_impact->>'descendentes_count', '0')
      ),
      'impacto', v_impact
    );
  END IF;

  RETURN public.reverter_movimentacao_caixa_inner(p_transacao_id, p_motivo);
END;
$function$;

REVOKE ALL ON FUNCTION public.reverter_movimentacao_caixa(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reverter_movimentacao_caixa(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reverter_movimentacao_caixa_inner(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reverter_movimentacao_caixa_inner(uuid, text) TO service_role;