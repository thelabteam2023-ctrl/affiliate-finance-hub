ALTER TABLE public.apostas_unificada
ADD COLUMN IF NOT EXISTS stake_freebet NUMERIC NOT NULL DEFAULT 0;

ALTER TABLE public.apostas_pernas
ADD COLUMN IF NOT EXISTS stake_real NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS stake_freebet NUMERIC NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.normalize_apostas_unificada_stake_split()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_real NUMERIC;
  v_freebet NUMERIC;
BEGIN
  v_total := COALESCE(NEW.stake_total, NEW.stake, 0);
  v_real := COALESCE(
    NEW.stake_real,
    CASE
      WHEN NEW.fonte_saldo = 'FREEBET' OR NEW.usar_freebet = TRUE THEN 0
      ELSE v_total
    END
  );
  v_real := GREATEST(0, v_real);

  v_freebet := COALESCE(
    NEW.stake_freebet,
    CASE
      WHEN NEW.fonte_saldo = 'FREEBET' OR NEW.usar_freebet = TRUE THEN GREATEST(v_total - v_real, 0)
      ELSE 0
    END
  );
  v_freebet := GREATEST(0, v_freebet);

  IF v_total = 0 THEN
    v_total := v_real + v_freebet;
  END IF;

  IF ABS(v_total - (v_real + v_freebet)) > 0.009 THEN
    RAISE EXCEPTION 'Stake split inválido em apostas_unificada: total %, real %, freebet %', v_total, v_real, v_freebet;
  END IF;

  NEW.stake_total := ROUND(v_total, 2);
  NEW.stake_real := ROUND(v_real, 2);
  NEW.stake_freebet := ROUND(v_freebet, 2);
  NEW.stake := ROUND(v_total, 2);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_normalize_apostas_unificada_stake_split ON public.apostas_unificada;
CREATE TRIGGER tr_normalize_apostas_unificada_stake_split
BEFORE INSERT OR UPDATE ON public.apostas_unificada
FOR EACH ROW
EXECUTE FUNCTION public.normalize_apostas_unificada_stake_split();

CREATE OR REPLACE FUNCTION public.normalize_apostas_pernas_stake_split()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total NUMERIC;
  v_real NUMERIC;
  v_freebet NUMERIC;
BEGIN
  v_total := COALESCE(NEW.stake, 0);
  v_real := COALESCE(
    NEW.stake_real,
    CASE
      WHEN NEW.fonte_saldo = 'FREEBET' THEN 0
      ELSE v_total
    END
  );
  v_real := GREATEST(0, v_real);

  v_freebet := COALESCE(
    NEW.stake_freebet,
    CASE
      WHEN NEW.fonte_saldo = 'FREEBET' THEN GREATEST(v_total - v_real, 0)
      ELSE 0
    END
  );
  v_freebet := GREATEST(0, v_freebet);

  IF v_total = 0 THEN
    v_total := v_real + v_freebet;
  END IF;

  IF ABS(v_total - (v_real + v_freebet)) > 0.009 THEN
    RAISE EXCEPTION 'Stake split inválido em apostas_pernas: total %, real %, freebet %', v_total, v_real, v_freebet;
  END IF;

  NEW.stake := ROUND(v_total, 2);
  NEW.stake_real := ROUND(v_real, 2);
  NEW.stake_freebet := ROUND(v_freebet, 2);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_normalize_apostas_pernas_stake_split ON public.apostas_pernas;
CREATE TRIGGER tr_normalize_apostas_pernas_stake_split
BEFORE INSERT OR UPDATE ON public.apostas_pernas
FOR EACH ROW
EXECUTE FUNCTION public.normalize_apostas_pernas_stake_split();

WITH calc AS (
  SELECT
    id,
    ROUND(
      GREATEST(
        0,
        COALESCE(
          stake_real,
          CASE
            WHEN fonte_saldo = 'FREEBET' OR usar_freebet = TRUE THEN 0
            ELSE COALESCE(stake_total, stake, 0)
          END
        )
      ),
      2
    ) AS stake_real_calc,
    ROUND(
      GREATEST(
        COALESCE(stake_total, stake, 0),
        GREATEST(
          0,
          COALESCE(
            stake_real,
            CASE
              WHEN fonte_saldo = 'FREEBET' OR usar_freebet = TRUE THEN 0
              ELSE COALESCE(stake_total, stake, 0)
            END
          )
        ) + GREATEST(
          0,
          COALESCE(
            stake_freebet,
            CASE
              WHEN fonte_saldo = 'FREEBET' OR usar_freebet = TRUE THEN COALESCE(stake_total, stake, 0) - GREATEST(
                0,
                COALESCE(
                  stake_real,
                  CASE
                    WHEN fonte_saldo = 'FREEBET' OR usar_freebet = TRUE THEN 0
                    ELSE COALESCE(stake_total, stake, 0)
                  END
                )
              )
              ELSE 0
            END
          )
        )
      ),
      2
    ) AS stake_total_calc
  FROM public.apostas_unificada
), normalized AS (
  SELECT
    id,
    stake_real_calc,
    stake_total_calc,
    ROUND(GREATEST(stake_total_calc - stake_real_calc, 0), 2) AS stake_freebet_calc
  FROM calc
)
UPDATE public.apostas_unificada au
SET
  stake_real = n.stake_real_calc,
  stake_total = n.stake_total_calc,
  stake_freebet = n.stake_freebet_calc,
  stake = n.stake_total_calc
FROM normalized n
WHERE au.id = n.id;

WITH normalized AS (
  SELECT
    id,
    ROUND(
      GREATEST(
        0,
        COALESCE(
          stake_real,
          CASE
            WHEN fonte_saldo = 'FREEBET' THEN 0
            ELSE COALESCE(stake, 0)
          END
        )
      ),
      2
    ) AS stake_real_calc,
    ROUND(
      GREATEST(
        COALESCE(stake, 0) - GREATEST(
          0,
          COALESCE(
            stake_real,
            CASE
              WHEN fonte_saldo = 'FREEBET' THEN 0
              ELSE COALESCE(stake, 0)
            END
          )
        ),
        0
      ),
      2
    ) AS stake_freebet_calc,
    ROUND(COALESCE(stake, 0), 2) AS stake_total_calc
  FROM public.apostas_pernas
)
UPDATE public.apostas_pernas ap
SET
  stake_real = n.stake_real_calc,
  stake_freebet = n.stake_freebet_calc,
  stake = n.stake_total_calc
FROM normalized n
WHERE ap.id = n.id;

CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, nome text, parceiro_id uuid, parceiro_nome text, parceiro_primeiro_nome text, moeda text, logo_url text, saldo_real numeric, saldo_freebet numeric, saldo_bonus numeric, saldo_em_aposta numeric, saldo_disponivel numeric, saldo_operavel numeric, bonus_rollover_started boolean, has_pending_transactions boolean, instance_identifier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_workspace_id UUID;
BEGIN
  IF p_projeto_id IS NOT NULL THEN
    SELECT public.projetos.workspace_id
      INTO v_workspace_id
    FROM public.projetos
    WHERE public.projetos.id = p_projeto_id;
  END IF;

  IF v_workspace_id IS NULL THEN
    v_workspace_id := public.get_current_workspace();
  END IF;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Workspace não definido';
  END IF;

  RETURN QUERY
  WITH bookmakers_ativos AS (
    SELECT
      b.id,
      b.nome,
      b.parceiro_id,
      b.moeda,
      b.instance_identifier,
      COALESCE(b.saldo_atual, 0) AS saldo_base,
      COALESCE(b.saldo_freebet, 0) AS saldo_freebet,
      p.nome AS parceiro_nome,
      SPLIT_PART(p.nome, ' ', 1) AS parceiro_primeiro_nome,
      bc.logo_url
    FROM public.bookmakers b
    LEFT JOIN public.parceiros p ON p.id = b.parceiro_id
    LEFT JOIN public.bookmakers_catalogo bc ON bc.id = b.bookmaker_catalogo_id
    WHERE b.workspace_id = v_workspace_id
      AND b.status IN ('ATIVO', 'ativo', 'LIMITADA', 'limitada')
      AND (p_projeto_id IS NULL OR b.projeto_id = p_projeto_id)
  ),
  apostas_ja_debitadas AS (
    SELECT DISTINCT fe.aposta_id
    FROM public.financial_events fe
    WHERE fe.workspace_id = v_workspace_id
      AND fe.tipo_evento = 'STAKE'
      AND fe.aposta_id IS NOT NULL
  ),
  apostas_simples_pendentes AS (
    SELECT
      au.bookmaker_id,
      COALESCE(SUM(COALESCE(au.stake_real, 0)), 0) AS total_stake
    FROM public.apostas_unificada au
    WHERE au.workspace_id = v_workspace_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND au.bookmaker_id IS NOT NULL
      AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
      AND au.id NOT IN (SELECT aposta_id FROM apostas_ja_debitadas)
    GROUP BY au.bookmaker_id
  ),
  apostas_pernas_pendentes AS (
    SELECT
      ap.bookmaker_id,
      COALESCE(SUM(COALESCE(ap.stake_real, 0)), 0) AS total_stake
    FROM public.apostas_pernas ap
    INNER JOIN public.apostas_unificada au ON au.id = ap.aposta_id
    WHERE au.workspace_id = v_workspace_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND au.bookmaker_id IS NULL
      AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
      AND au.id NOT IN (SELECT aposta_id FROM apostas_ja_debitadas)
    GROUP BY ap.bookmaker_id
  ),
  apostas_pendentes AS (
    SELECT bookmaker_id, SUM(total_stake) AS total_stake
    FROM (
      SELECT bookmaker_id, total_stake FROM apostas_simples_pendentes
      UNION ALL
      SELECT bookmaker_id, total_stake FROM apostas_pernas_pendentes
    ) combined
    GROUP BY bookmaker_id
  ),
  todas_apostas_pendentes AS (
    SELECT bookmaker_id, SUM(total_stake) AS total_stake
    FROM (
      SELECT
        au.bookmaker_id,
        COALESCE(SUM(COALESCE(au.stake_total, COALESCE(au.stake_real, 0) + COALESCE(au.stake_freebet, 0), au.stake, 0)), 0) AS total_stake
      FROM public.apostas_unificada au
      WHERE au.workspace_id = v_workspace_id
        AND au.status = 'PENDENTE'
        AND au.cancelled_at IS NULL
        AND au.bookmaker_id IS NOT NULL
        AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
      GROUP BY au.bookmaker_id
      UNION ALL
      SELECT
        ap.bookmaker_id,
        COALESCE(SUM(COALESCE(ap.stake_real, 0) + COALESCE(ap.stake_freebet, 0)), 0) AS total_stake
      FROM public.apostas_pernas ap
      INNER JOIN public.apostas_unificada au ON au.id = ap.aposta_id
      WHERE au.workspace_id = v_workspace_id
        AND au.status = 'PENDENTE'
        AND au.cancelled_at IS NULL
        AND au.bookmaker_id IS NULL
        AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
      GROUP BY ap.bookmaker_id
    ) all_combined
    GROUP BY bookmaker_id
  ),
  bonus_creditados AS (
    SELECT
      pblb.bookmaker_id,
      COALESCE(SUM(pblb.saldo_atual), 0) AS total_bonus,
      BOOL_OR(COALESCE(pblb.rollover_progress, 0) > 0) AS has_rollover_started
    FROM public.project_bookmaker_link_bonuses pblb
    WHERE pblb.workspace_id = v_workspace_id
      AND pblb.status = 'credited'
      AND (p_projeto_id IS NULL OR pblb.project_id = p_projeto_id)
    GROUP BY pblb.bookmaker_id
  ),
  transacoes_pendentes AS (
    SELECT DISTINCT
      COALESCE(cl.origem_bookmaker_id, cl.destino_bookmaker_id) AS bookmaker_id
    FROM public.cash_ledger cl
    WHERE cl.workspace_id = v_workspace_id
      AND cl.status IN ('PENDENTE', 'pendente')
      AND (cl.origem_bookmaker_id IS NOT NULL OR cl.destino_bookmaker_id IS NOT NULL)
  )
  SELECT
    ba.id,
    ba.nome,
    ba.parceiro_id,
    ba.parceiro_nome,
    ba.parceiro_primeiro_nome,
    ba.moeda,
    ba.logo_url,
    ba.saldo_base::NUMERIC AS saldo_real,
    ba.saldo_freebet::NUMERIC AS saldo_freebet,
    COALESCE(bc.total_bonus, 0)::NUMERIC AS saldo_bonus,
    COALESCE(tap.total_stake, 0)::NUMERIC AS saldo_em_aposta,
    GREATEST(0, ba.saldo_base - COALESCE(ap.total_stake, 0))::NUMERIC AS saldo_disponivel,
    (GREATEST(0, ba.saldo_base - COALESCE(ap.total_stake, 0)) + ba.saldo_freebet)::NUMERIC AS saldo_operavel,
    COALESCE(bc.has_rollover_started, FALSE) AS bonus_rollover_started,
    (tp.bookmaker_id IS NOT NULL) AS has_pending_transactions,
    ba.instance_identifier
  FROM bookmakers_ativos ba
  LEFT JOIN apostas_pendentes ap ON ap.bookmaker_id = ba.id
  LEFT JOIN todas_apostas_pendentes tap ON tap.bookmaker_id = ba.id
  LEFT JOIN bonus_creditados bc ON bc.bookmaker_id = ba.id
  LEFT JOIN transacoes_pendentes tp ON tp.bookmaker_id = ba.id
  ORDER BY ba.nome;
END;
$function$;