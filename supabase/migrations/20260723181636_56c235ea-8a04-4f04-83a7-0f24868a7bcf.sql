
-- 1. Create subcategories catalog
CREATE TABLE public.community_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria text NOT NULL,
  slug text NOT NULL,
  label text NOT NULL,
  ordem int NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (categoria, slug)
);

GRANT SELECT ON public.community_subcategories TO authenticated;
GRANT ALL ON public.community_subcategories TO service_role;

ALTER TABLE public.community_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read subcategories"
  ON public.community_subcategories FOR SELECT
  TO authenticated
  USING (ativo = true);

-- 2. Seed subcategories
INSERT INTO public.community_subcategories (categoria, slug, label, ordem) VALUES
  ('casas_de_aposta', 'kyc', 'Verificação (KYC)', 1),
  ('casas_de_aposta', 'limitacoes', 'Limitações e Bloqueios', 2),
  ('casas_de_aposta', 'suporte', 'Suporte / Atendimento', 3),
  ('casas_de_aposta', 'odds', 'Odds e Mercados', 4),
  ('bancos', 'bloqueios', 'Bloqueios', 1),
  ('bancos', 'pix_ted', 'PIX / TED', 2),
  ('bancos', 'compliance', 'Compliance', 3),
  ('bonus_e_promocoes', 'ofertas', 'Ofertas & Oportunidades', 1),
  ('bonus_e_promocoes', 'termos', 'Termos e Regras', 2),
  ('bonus_e_promocoes', 'cashback', 'Cashback', 3),
  ('pagamentos_e_saques', 'prazos', 'Prazos', 1),
  ('pagamentos_e_saques', 'problemas', 'Problemas', 2),
  ('pagamentos_e_saques', 'metodos', 'Métodos e Taxas', 3),
  ('estrategias', 'surebet', 'Surebet', 1),
  ('estrategias', 'valuebet', 'Value Bet', 2),
  ('estrategias', 'freebet', 'Freebet', 3),
  ('estrategias', 'duplo_green', 'Duplo Green', 4),
  ('estrategias', 'trade', 'Trade', 5),
  ('estrategias', 'cassino', 'Cassino', 6),
  ('estrategias', 'extracao', 'Extração', 7),
  ('alertas', 'golpe_fraude', 'Golpe / Fraude', 1),
  ('alertas', 'downtime', 'Downtime / Instabilidade', 2),
  ('alertas', 'mudanca_regras', 'Mudança de Regras', 3),
  ('escritorio', 'operacional', 'Operacional', 1),
  ('escritorio', 'rh_legal', 'RH / Legal', 2);

-- 3. Add subcategoria_slug to community_topics
ALTER TABLE public.community_topics ADD COLUMN subcategoria_slug text;

CREATE INDEX idx_community_topics_cat_sub ON public.community_topics (categoria, subcategoria_slug, created_at DESC);
CREATE INDEX idx_community_topics_bm_sub ON public.community_topics (bookmaker_catalogo_id, subcategoria_slug, created_at DESC);

-- 4. Heuristic backfill (non-destructive)
UPDATE public.community_topics
SET subcategoria_slug = CASE
  WHEN categoria = 'casas_de_aposta' AND (titulo ~* '\y(kyc|verifica|documento|comprovante|selfie)\y' OR conteudo ~* '\y(kyc|verifica|documento|comprovante|selfie)\y') THEN 'kyc'
  WHEN categoria = 'casas_de_aposta' AND (titulo ~* '\y(limita|bloque|restri|banido|banimento)\y' OR conteudo ~* '\y(limita|bloque|restri|banido|banimento)\y') THEN 'limitacoes'
  WHEN categoria = 'casas_de_aposta' AND (titulo ~* '\y(suporte|atendimento|chat)\y') THEN 'suporte'
  WHEN categoria = 'bancos' AND (titulo ~* '\y(bloque|encerra|banimento)\y') THEN 'bloqueios'
  WHEN categoria = 'bancos' AND (titulo ~* '\ypix\y|\yted\y') THEN 'pix_ted'
  WHEN categoria = 'bonus_e_promocoes' AND (titulo ~* '\y(oferta|promoção|promocao)\y') THEN 'ofertas'
  WHEN categoria = 'bonus_e_promocoes' AND (titulo ~* '\y(termo|regra|rollover)\y') THEN 'termos'
  WHEN categoria = 'bonus_e_promocoes' AND (titulo ~* '\ycashback\y') THEN 'cashback'
  WHEN categoria = 'pagamentos_e_saques' AND (titulo ~* '\y(prazo|demora|tempo)\y') THEN 'prazos'
  WHEN categoria = 'pagamentos_e_saques' AND (titulo ~* '\y(problema|erro|falha|não recebi|nao recebi)\y') THEN 'problemas'
  WHEN categoria = 'alertas' AND (titulo ~* '\y(golpe|fraude|scam)\y') THEN 'golpe_fraude'
  WHEN categoria = 'alertas' AND (titulo ~* '\y(fora do ar|instabilidade|downtime|caiu)\y') THEN 'downtime'
  ELSE NULL
END
WHERE subcategoria_slug IS NULL;
