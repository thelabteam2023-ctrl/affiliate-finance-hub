-- First, drop the incorrect version with text parameter
DROP FUNCTION IF EXISTS public.editar_surebet_completa_v1(
    uuid,
    jsonb,
    text,
    text,
    text,
    text,
    text,
    text,
    text, -- p_data_aposta as text
    numeric,
    numeric,
    numeric,
    text
);

-- Now, ensure the correct version exists with proper parameter defaults and error handling
CREATE OR REPLACE FUNCTION public.editar_surebet_completa_v1(
    p_aposta_id uuid,
    p_pernas jsonb,
    p_evento text DEFAULT NULL,
    p_esporte text DEFAULT NULL,
    p_mercado text DEFAULT NULL,
    p_modelo text DEFAULT NULL,
    p_estrategia text DEFAULT NULL,
    p_contexto text DEFAULT NULL,
    p_data_aposta timestamp with time zone DEFAULT NULL,
    p_stake_total numeric DEFAULT NULL,
    p_lucro numeric DEFAULT NULL,
    p_roi numeric DEFAULT NULL,
    p_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_perna jsonb;
    v_perna_id uuid;
    v_bookmaker_id uuid;
    v_conta_id uuid;
    v_stake numeric;
    v_odd numeric;
    v_resultado text;
    v_tipo_odd text;
    v_workspace_id uuid;
    v_perna_result jsonb;
    v_perna_msg text;
    v_perna_success boolean;
BEGIN
    -- 1. Get current operation info
    SELECT workspace_id INTO v_workspace_id
    FROM public.apostas_surebet
    WHERE id = p_aposta_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Operação não encontrada.');
    END IF;

    -- 2. Update main operation data
    UPDATE public.apostas_surebet
    SET 
        evento = COALESCE(p_evento, evento),
        esporte = COALESCE(p_esporte, esporte),
        mercado = COALESCE(p_mercado, mercado),
        modelo = COALESCE(p_modelo, modelo),
        estrategia = COALESCE(p_estrategia, estrategia),
        contexto = COALESCE(p_contexto, contexto),
        data_aposta = COALESCE(p_data_aposta, data_aposta),
        stake_total = COALESCE(p_stake_total, stake_total),
        lucro = COALESCE(p_lucro, lucro),
        roi = COALESCE(p_roi, roi),
        status = COALESCE(p_status, status),
        updated_at = now()
    WHERE id = p_aposta_id;

    -- 3. Iterate through legs
    FOR v_perna IN SELECT * FROM jsonb_array_elements(p_pernas)
    LOOP
        v_perna_id := (v_perna->>'id')::uuid;
        v_bookmaker_id := (v_perna->>'bookmaker_id')::uuid;
        v_conta_id := (v_perna->>'conta_id')::uuid;
        v_stake := (v_perna->>'stake')::numeric;
        v_odd := (v_perna->>'odd')::numeric;
        v_resultado := v_perna->>'resultado';
        v_tipo_odd := v_perna->>'tipo_odd';

        -- Use the specialized per-leg update function which handles balance validation
        -- IMPORTANT: We capture the result to check for success
        v_perna_result := public.editar_perna_surebet_v1(
            v_perna_id,
            v_bookmaker_id,
            v_conta_id,
            v_stake,
            v_odd,
            v_resultado,
            v_tipo_odd
        );

        v_perna_success := (v_perna_result->>'success')::boolean;
        IF v_perna_success IS NOT TRUE THEN
            v_perna_msg := v_perna_result->>'message';
            -- Abort and return the error message from the specific leg (e.g., Insufficient Balance)
            RAISE EXCEPTION '%', v_perna_msg;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('success', true, 'message', 'Operação atualizada com sucesso.');

EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$;