
CREATE TABLE public.projeto_shared_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  label text,
  created_by uuid NOT NULL,
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count integer DEFAULT 0,
  last_viewed_at timestamptz,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_shared_links_token ON public.projeto_shared_links(token);
CREATE INDEX idx_shared_links_projeto ON public.projeto_shared_links(projeto_id);

ALTER TABLE public.projeto_shared_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_members_manage_shared_links"
ON public.projeto_shared_links
FOR ALL
TO authenticated
USING (
  workspace_id IN (
    SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()
  )
);

CREATE POLICY "public_read_by_token"
ON public.projeto_shared_links
FOR SELECT
TO anon
USING (true);

CREATE OR REPLACE FUNCTION public.get_shared_project_data(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link projeto_shared_links%ROWTYPE;
  v_projeto projetos%ROWTYPE;
  v_daily jsonb;
  v_resumo jsonb;
BEGIN
  SELECT * INTO v_link
  FROM projeto_shared_links
  WHERE token = p_token
    AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'INVALID_TOKEN');
  END IF;

  IF v_link.expires_at IS NOT NULL AND v_link.expires_at < now() THEN
    RETURN jsonb_build_object('error', 'EXPIRED_TOKEN');
  END IF;

  UPDATE projeto_shared_links
  SET view_count = view_count + 1,
      last_viewed_at = now()
  WHERE id = v_link.id;

  SELECT * INTO v_projeto
  FROM projetos
  WHERE id = v_link.projeto_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'PROJECT_NOT_FOUND');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('dia', dia, 'lucro', lucro, 'qtd', qtd) ORDER BY dia
  ), '[]'::jsonb)
  INTO v_daily
  FROM (
    SELECT
      DATE(a.data_aposta AT TIME ZONE 'America/Sao_Paulo') AS dia,
      SUM(
        CASE
          WHEN a.moeda_operacao IS NOT NULL 
               AND a.moeda_operacao <> COALESCE(v_projeto.moeda_consolidacao, 'BRL')
               AND a.pl_consolidado IS NOT NULL
          THEN a.pl_consolidado
          ELSE COALESCE(a.lucro_prejuizo, 0)
        END
      ) AS lucro,
      COUNT(*) AS qtd
    FROM apostas_unificada a
    WHERE a.projeto_id = v_link.projeto_id
      AND a.status = 'LIQUIDADA'
    GROUP BY DATE(a.data_aposta AT TIME ZONE 'America/Sao_Paulo')
  ) sub;

  SELECT jsonb_build_object(
    'total_apostas', COUNT(*),
    'greens', COUNT(*) FILTER (WHERE resultado = 'GREEN'),
    'reds', COUNT(*) FILTER (WHERE resultado = 'RED'),
    'voids', COUNT(*) FILTER (WHERE resultado = 'VOID'),
    'lucro_total', SUM(
      CASE
        WHEN moeda_operacao IS NOT NULL 
             AND moeda_operacao <> COALESCE(v_projeto.moeda_consolidacao, 'BRL')
             AND pl_consolidado IS NOT NULL
        THEN pl_consolidado
        ELSE COALESCE(lucro_prejuizo, 0)
      END
    ),
    'total_stake', SUM(
      CASE
        WHEN moeda_operacao IS NOT NULL 
             AND moeda_operacao <> COALESCE(v_projeto.moeda_consolidacao, 'BRL')
             AND stake_consolidado IS NOT NULL
        THEN stake_consolidado
        ELSE COALESCE(stake, 0)
      END
    ),
    'apostas_pendentes', (
      SELECT COUNT(*) FROM apostas_unificada
      WHERE projeto_id = v_link.projeto_id AND status = 'PENDENTE'
    )
  )
  INTO v_resumo
  FROM apostas_unificada
  WHERE projeto_id = v_link.projeto_id
    AND status = 'LIQUIDADA';

  RETURN jsonb_build_object(
    'projeto', jsonb_build_object(
      'id', v_projeto.id,
      'nome', v_projeto.nome,
      'moeda_consolidacao', COALESCE(v_projeto.moeda_consolidacao, 'BRL'),
      'created_at', v_projeto.created_at
    ),
    'resumo', v_resumo,
    'daily', v_daily
  );
END;
$$;
