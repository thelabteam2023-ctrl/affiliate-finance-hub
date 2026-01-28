
-- FIX: Corrigir dupla contagem de bônus no saldo operável
-- O bônus creditado já é adicionado ao saldo_atual da bookmaker via financial_events/trigger
-- Portanto, NÃO devemos somar saldo_bonus novamente no saldo_operavel
-- O saldo_bonus continua sendo retornado para fins de display/informação

CREATE OR REPLACE FUNCTION public.get_bookmaker_saldos(p_projeto_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid, 
  nome text, 
  parceiro_id uuid, 
  parceiro_nome text, 
  parceiro_primeiro_nome text, 
  moeda text, 
  logo_url text, 
  saldo_real numeric, 
  saldo_freebet numeric, 
  saldo_bonus numeric, 
  saldo_em_aposta numeric, 
  saldo_disponivel numeric, 
  saldo_operavel numeric, 
  bonus_rollover_started boolean, 
  has_pending_transactions boolean
)
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
  apostas_pendentes AS (
    SELECT 
      au.bookmaker_id,
      COALESCE(SUM(au.stake), 0) AS total_stake
    FROM public.apostas_unificada au
    WHERE au.workspace_id = v_workspace_id
      AND au.status = 'PENDENTE'
      AND au.cancelled_at IS NULL
      AND au.bookmaker_id IS NOT NULL
      AND (p_projeto_id IS NULL OR au.projeto_id = p_projeto_id)
    GROUP BY au.bookmaker_id
  ),
  bonus_creditados AS (
    -- Apenas para INFORMAÇÃO/DISPLAY, NÃO para soma no saldo_operavel
    -- O valor do bônus já está incluído em bookmakers.saldo_atual via financial_events
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
    -- saldo_bonus é retornado APENAS para informação, NÃO é somado ao saldo_operavel
    COALESCE(bc.total_bonus, 0)::NUMERIC AS saldo_bonus,
    COALESCE(ap.total_stake, 0)::NUMERIC AS saldo_em_aposta,
    GREATEST(0, ba.saldo_base - COALESCE(ap.total_stake, 0))::NUMERIC AS saldo_disponivel,
    -- FIX: Não somar saldo_bonus aqui pois já está incluído em saldo_base (via financial_events)
    -- A fórmula correta é: saldo_disponivel + saldo_freebet (sem saldo_bonus)
    (GREATEST(0, ba.saldo_base - COALESCE(ap.total_stake, 0)) + ba.saldo_freebet)::NUMERIC AS saldo_operavel,
    COALESCE(bc.has_rollover_started, FALSE) AS bonus_rollover_started,
    (tp.bookmaker_id IS NOT NULL) AS has_pending_transactions
  FROM bookmakers_ativos ba
  LEFT JOIN apostas_pendentes ap ON ap.bookmaker_id = ba.id
  LEFT JOIN bonus_creditados bc ON bc.bookmaker_id = ba.id
  LEFT JOIN transacoes_pendentes tp ON tp.bookmaker_id = ba.id
  ORDER BY ba.nome;
END;
$function$;

-- Adicionar comentário explicativo
COMMENT ON FUNCTION public.get_bookmaker_saldos IS 
'Retorna saldos das bookmakers. ATENÇÃO: saldo_bonus é retornado apenas para INFORMAÇÃO/DISPLAY.
O valor do bônus já está incluído em saldo_real (via financial_events quando creditado).
Portanto, saldo_operavel = saldo_disponivel + saldo_freebet (SEM somar saldo_bonus novamente).';
