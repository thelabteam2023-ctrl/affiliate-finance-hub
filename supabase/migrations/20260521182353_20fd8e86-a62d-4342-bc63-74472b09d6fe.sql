CREATE OR REPLACE FUNCTION public.criar_surebet_atomica_v3(
    p_workspace_id uuid,
    p_user_id uuid,
    p_projeto_id uuid,
    p_mercado_id integer,
    p_competi_id integer,
    p_esporte_id integer,
    p_evento_nome text,
    p_evento_data timestamp with time zone,
    p_entradas jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_aposta_id uuid;
    v_perna_record record;
    v_entrada_json jsonb;
    v_perna_ordem integer;
    v_perna_id uuid;
    v_entrada_id uuid;
BEGIN
    -- 1. Inserir Aposta Unificada (O PAI)
    INSERT INTO public.apostas_unificada (
        workspace_id,
        user_id,
        projeto_id,
        mercado_id,
        competi_id,
        esporte_id,
        evento_nome,
        evento_data,
        forma_registro,
        status
    ) VALUES (
        p_workspace_id,
        p_user_id,
        p_projeto_id,
        p_mercado_id,
        p_competi_id,
        p_esporte_id,
        p_evento_nome,
        p_evento_data,
        'ARBITRAGEM',
        'PENDENTE'
    ) RETURNING id INTO v_aposta_id;

    -- 2. Processar Pernas
    -- Agrupamos as entradas por perna_ordem para criar as pernas
    FOR v_perna_ordem IN 
        SELECT DISTINCT (e->>'perna_ordem')::integer 
        FROM jsonb_array_elements(p_entradas) e
        ORDER BY 1
    LOOP
        -- Pegamos a primeira entrada desta perna para extrair os dados básicos da perna
        SELECT elem INTO v_entrada_json 
        FROM jsonb_array_elements(p_entradas) AS elem 
        WHERE (elem->>'perna_ordem')::integer = v_perna_ordem 
        LIMIT 1;

        INSERT INTO public.apostas_pernas (
            aposta_id,
            perna_ordem,
            bookmaker_id,
            odd,
            stake,
            moeda,
            stake_real,
            stake_freebet
        ) VALUES (
            v_aposta_id,
            v_perna_ordem,
            (v_entrada_json->>'bookmaker_id')::integer,
            (v_entrada_json->>'odd')::numeric,
            (v_entrada_json->>'stake')::numeric,
            v_entrada_json->>'moeda',
            CASE WHEN v_entrada_json->>'fonte_saldo' = 'BANCA' THEN (v_entrada_json->>'stake')::numeric ELSE 0 END,
            CASE WHEN v_entrada_json->>'fonte_saldo' = 'FREEBET' THEN (v_entrada_json->>'stake')::numeric ELSE 0 END
        ) RETURNING id INTO v_perna_id;

        -- 3. Inserir Entradas da Perna
        FOR v_entrada_json IN 
            SELECT elem FROM jsonb_array_elements(p_entradas) AS elem
            WHERE (elem->>'perna_ordem')::integer = v_perna_ordem
        LOOP
            INSERT INTO public.apostas_perna_entradas (
                perna_id,
                bookmaker_id,
                odd,
                stake,
                moeda,
                fonte_saldo,
                status
            ) VALUES (
                v_perna_id,
                (v_entrada_json->>'bookmaker_id')::integer,
                (v_entrada_json->>'odd')::numeric,
                (v_entrada_json->>'stake')::numeric,
                v_entrada_json->>'moeda',
                v_entrada_json->>'fonte_saldo',
                'OK'
            ) RETURNING id INTO v_entrada_id;

            -- 4. Sincronizar Evento Financeiro (Idempotente)
            PERFORM public.fn_sync_stake_event_v1(
                v_entrada_id,
                v_aposta_id,
                p_workspace_id,
                (v_entrada_json->>'bookmaker_id')::integer,
                (v_entrada_json->>'stake')::numeric,
                v_entrada_json->>'moeda',
                v_entrada_json->>'fonte_saldo',
                p_user_id
            );
        END LOOP;
    END LOOP;

    -- 5. Recalcular Totais da Surebet (Pai)
    PERFORM public.fn_recalc_pai_surebet(v_aposta_id);

    RETURN v_aposta_id;
END;
$function$;

-- Recarrega o schema para o PostgREST
NOTIFY pgrst, 'reload schema';
