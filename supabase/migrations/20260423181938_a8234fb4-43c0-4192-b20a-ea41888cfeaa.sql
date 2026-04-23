-- Defesa em profundidade: bloquear UPDATE direto de campos de liquidação
-- (resultado, lucro_prejuizo, status para LIQUIDADA) em registros ARBITRAGEM
-- fora do contexto autorizado.
--
-- Contexto autorizado é sinalizado por uma GUC de sessão:
--   SET LOCAL app.surebet_recalc_context = 'on'
-- A função `fn_recalc_pai_surebet` (chamada pela RPC liquidar_perna_surebet_v1)
-- DEVE setar essa flag antes de fazer o UPDATE no pai.

-- 1. Trigger guard
CREATE OR REPLACE FUNCTION public.fn_apostas_unificada_arbitragem_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_ctx text;
  v_changed_resultado boolean;
  v_changed_lp boolean;
  v_changed_status_liquidada boolean;
BEGIN
  -- Aplica somente a registros de arbitragem
  IF NEW.forma_registro <> 'ARBITRAGEM' THEN
    RETURN NEW;
  END IF;

  -- Detectar mudanças relevantes
  v_changed_resultado :=
    (NEW.resultado IS DISTINCT FROM OLD.resultado);
  v_changed_lp :=
    (NEW.lucro_prejuizo IS DISTINCT FROM OLD.lucro_prejuizo)
    OR (NEW.lucro_prejuizo_brl_referencia IS DISTINCT FROM OLD.lucro_prejuizo_brl_referencia)
    OR (NEW.pl_consolidado IS DISTINCT FROM OLD.pl_consolidado);
  v_changed_status_liquidada :=
    (NEW.status IS DISTINCT FROM OLD.status)
    AND (NEW.status = 'LIQUIDADA' OR OLD.status = 'LIQUIDADA');

  IF NOT (v_changed_resultado OR v_changed_lp OR v_changed_status_liquidada) THEN
    RETURN NEW;
  END IF;

  -- Verificar contexto autorizado (setado por fn_recalc_pai_surebet)
  BEGIN
    v_ctx := current_setting('app.surebet_recalc_context', true);
  EXCEPTION WHEN OTHERS THEN
    v_ctx := NULL;
  END;

  IF v_ctx = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'Bloqueio de integridade Surebet: UPDATE direto de resultado/lucro/status em apostas_unificada (id=%) não é permitido. '
    'Surebets devem ser liquidadas via RPC liquidar_perna_surebet_v1 (que recalcula o pai automaticamente). '
    'Origem do problema: provável uso de liquidarSurebetSimples ou UPDATE manual fora do motor.',
    NEW.id
    USING ERRCODE = 'check_violation';
END;
$$;

DROP TRIGGER IF EXISTS tg_apostas_unificada_arbitragem_guard ON public.apostas_unificada;
CREATE TRIGGER tg_apostas_unificada_arbitragem_guard
BEFORE UPDATE ON public.apostas_unificada
FOR EACH ROW
EXECUTE FUNCTION public.fn_apostas_unificada_arbitragem_guard();

-- 2. Garantir que fn_recalc_pai_surebet sete a GUC de contexto.
--    Wrapping: aplicamos um SET LOCAL no início da função existente.
--    Como não conhecemos o corpo exato, usamos um patch idempotente:
--    se a função existe, recriamos um wrapper que seta a flag e delega.
--    Estratégia segura: editamos a função existente apenas adicionando
--    `PERFORM set_config('app.surebet_recalc_context','on', true);`
--    como primeira instrução do BEGIN.
DO $migration$
DECLARE
  v_src text;
  v_new_src text;
  v_args text;
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO v_src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'fn_recalc_pai_surebet'
  LIMIT 1;

  IF v_src IS NULL THEN
    RAISE NOTICE 'fn_recalc_pai_surebet não existe — nada a patchar (ok se ambiente novo)';
    RETURN;
  END IF;

  -- Se já tem o set_config, não faz nada
  IF v_src LIKE '%app.surebet_recalc_context%' THEN
    RAISE NOTICE 'fn_recalc_pai_surebet já contém marcador de contexto — skip';
    RETURN;
  END IF;

  -- Inserir set_config('app.surebet_recalc_context','on',true) logo após o primeiro BEGIN
  -- (corpo PL/pgSQL). Substituição da primeira ocorrência de "BEGIN" no corpo.
  v_new_src := regexp_replace(
    v_src,
    'BEGIN(\s)',
    E'BEGIN\\1  PERFORM set_config(''app.surebet_recalc_context'', ''on'', true);\n',
    ''
  );

  EXECUTE v_new_src;
  RAISE NOTICE 'fn_recalc_pai_surebet patcheada com marcador de contexto';
END
$migration$;