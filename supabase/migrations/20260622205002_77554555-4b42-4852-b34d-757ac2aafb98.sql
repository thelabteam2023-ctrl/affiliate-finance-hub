CREATE OR REPLACE FUNCTION public.reliquidar_aposta_v6(p_aposta_id uuid, p_novo_resultado text, p_lucro_prejuizo numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_aposta RECORD;
    v_eventos_antigos JSONB;
    v_eventos_count INTEGER;
    v_actor UUID;
BEGIN
    -- 1. Lock
    SELECT * INTO v_aposta FROM public.apostas_unificada WHERE id = p_aposta_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Aposta não encontrada');
    END IF;

    -- 2. AUDIT TRAIL (Opção 3): snapshot dos eventos que serão estornados,
    --    gravado ANTES do DELETE e na mesma transação => atômico.
    SELECT
      COALESCE(jsonb_agg(to_jsonb(fe.*) ORDER BY fe.processed_at), '[]'::jsonb),
      COUNT(*)
    INTO v_eventos_antigos, v_eventos_count
    FROM public.financial_events fe
    WHERE fe.aposta_id = p_aposta_id
      AND fe.tipo_evento IN ('PAYOUT', 'FREEBET_RETURN', 'VOID_REFUND', 'AJUSTE', 'REVERSAL');

    -- actor_user_id: caller via auth.uid() (RLS bypass por SECURITY DEFINER),
    -- fallback para o dono da aposta se a função for chamada fora de contexto autenticado.
    v_actor := COALESCE(auth.uid(), v_aposta.user_id);

    -- Só registra se houver algo a auditar (reliquidação real, não no-op de aposta pendente)
    IF v_eventos_count > 0 OR v_aposta.resultado IS NOT NULL THEN
        INSERT INTO public.audit_logs (
            workspace_id, actor_user_id, action, entity_type, entity_id,
            before_data, after_data, metadata
        ) VALUES (
            v_aposta.workspace_id,
            v_actor,
            'UPDATE'::audit_action,
            'aposta_reliquidacao',
            p_aposta_id,
            jsonb_build_object(
                'resultado_anterior', v_aposta.resultado,
                'status_anterior',    v_aposta.status,
                'lucro_prejuizo_anterior', v_aposta.lucro_prejuizo,
                'valor_retorno_anterior', v_aposta.valor_retorno,
                'eventos_financeiros_estornados', v_eventos_antigos
            ),
            jsonb_build_object(
                'resultado_novo', p_novo_resultado,
                'lucro_prejuizo_informado', p_lucro_prejuizo
            ),
            jsonb_build_object(
                'evento', 'reliquidacao_aposta',
                'bookmaker_id', v_aposta.bookmaker_id,
                'forma_registro', v_aposta.forma_registro,
                'eventos_estornados_count', v_eventos_count,
                'reliquidado_em', now()
            )
        );
    END IF;

    -- 3. Deletar APENAS eventos de retorno, preservando o STAKE
    DELETE FROM public.financial_events
    WHERE aposta_id = p_aposta_id
      AND tipo_evento IN ('PAYOUT', 'FREEBET_RETURN', 'VOID_REFUND', 'AJUSTE', 'REVERSAL');

    -- 4. Resetar status
    UPDATE public.apostas_unificada
    SET status = 'PENDENTE',
        resultado = NULL,
        lucro_prejuizo = 0
    WHERE id = p_aposta_id;

    -- 5. Chamar nova liquidação
    PERFORM public.liquidar_aposta_v4(p_aposta_id, p_novo_resultado, p_lucro_prejuizo);

    -- 6. Sincronização final de segurança
    PERFORM public.sync_bookmaker_balance_from_ledger(v_aposta.bookmaker_id);

    RETURN jsonb_build_object('success', true, 'auditados', v_eventos_count);
END;
$function$;