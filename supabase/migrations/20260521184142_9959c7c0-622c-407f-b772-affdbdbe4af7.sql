-- 1. Remover a overload antiga que não é mais usada (9 parâmetros)
DROP FUNCTION IF EXISTS public.criar_surebet_atomica_v3(uuid, uuid, uuid, integer, integer, integer, text, timestamp with time zone, jsonb);

-- 2. Corrigir a overload atual (versão usada pelo frontend)
CREATE OR REPLACE FUNCTION public.criar_surebet_atomica_v3(
    p_user_id uuid,
    p_banca_id uuid,
    p_perfil_config_id uuid,
    p_esporte text,
    p_evento text,
    p_data_evento timestamp with time zone,
    p_tipo_surebet text,
    p_status text,
    p_observacao text,
    p_pernas jsonb,
    p_entradas jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_surebet_id uuid;
    v_perna_json jsonb;
    v_entrada_json jsonb;
    v_perna_id uuid;
    v_perna_ordem int;
BEGIN
    -- Criar o registro pai (surebet)
    INSERT INTO public.surebets (
        user_id, banca_id, perfil_config_id, esporte, evento, 
        data_evento, tipo_surebet, status, observacao
    ) VALUES (
        p_user_id, p_banca_id, p_perfil_config_id, p_esporte, p_evento, 
        p_data_evento, p_tipo_surebet, p_status, p_observacao
    ) RETURNING id INTO v_surebet_id;

    -- Iterar sobre as pernas
    FOR v_perna_json IN SELECT * FROM jsonb_array_elements(p_pernas) LOOP
        v_perna_ordem := (v_perna_json->>'ordem')::int;
        
        -- Criar a perna vinculada à surebet
        INSERT INTO public.surebet_pernas (
            surebet_id, ordem, bookmaker_id, mercado, selecao, odd
        ) VALUES (
            v_surebet_id,
            v_perna_ordem,
            (v_perna_json->>'bookmaker_id')::uuid,
            (v_perna_json->>'mercado')::text,
            (v_perna_json->>'selecao')::text,
            (v_perna_json->>'odd')::numeric
        ) RETURNING id INTO v_perna_id;

        -- Buscar a entrada correspondente a esta perna no array p_entradas
        -- CORREÇÃO: Adicionado o alias "elem" para evitar o erro "column elem does not exist"
        FOR v_entrada_json IN 
            SELECT elem 
            FROM jsonb_array_elements(p_entradas) AS elem 
            WHERE (elem->>'perna_ordem')::int = v_perna_ordem 
            LIMIT 1
        LOOP
            -- Registrar a entrada (bet) vinculada à perna
            INSERT INTO public.entradas (
                user_id, banca_id, perna_id, 
                data_entrada, stake, odd_executada, 
                comissao_percentual, status, tipo_entrada
            ) VALUES (
                p_user_id,
                p_banca_id,
                v_perna_id,
                COALESCE((v_entrada_json->>'data_entrada')::timestamptz, now()),
                (v_entrada_json->>'stake')::numeric,
                (v_entrada_json->>'odd_executada')::numeric,
                COALESCE((v_entrada_json->>'comissao_percentual')::numeric, 0),
                p_status,
                'surebet'
            );
        END LOOP;
    END LOOP;

    RETURN v_surebet_id;
END;
$$;