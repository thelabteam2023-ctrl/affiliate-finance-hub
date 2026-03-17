
-- 1. Update participacao_ciclos status constraint FIRST
ALTER TABLE participacao_ciclos DROP CONSTRAINT chk_participacao_status;
ALTER TABLE participacao_ciclos ADD CONSTRAINT chk_participacao_status 
  CHECK (status IN ('AGUARDANDO_CICLO', 'A_PAGAR', 'PAGO', 'RECONHECIDO'));

-- 2. Add tipo column to investidores
ALTER TABLE investidores ADD COLUMN tipo TEXT NOT NULL DEFAULT 'externo';
ALTER TABLE investidores ADD CONSTRAINT investidores_tipo_check CHECK (tipo IN ('proprio', 'externo'));

-- 3. Create projeto_investidores table
CREATE TABLE projeto_investidores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id UUID NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  investidor_id UUID NOT NULL REFERENCES investidores(id) ON DELETE CASCADE,
  percentual_participacao NUMERIC NOT NULL DEFAULT 0,
  base_calculo TEXT NOT NULL DEFAULT 'LUCRO_LIQUIDO',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  UNIQUE(projeto_id, investidor_id)
);

ALTER TABLE projeto_investidores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view projeto_investidores in their workspace"
  ON projeto_investidores FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()));

CREATE POLICY "Users can insert projeto_investidores in their workspace"
  ON projeto_investidores FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()));

CREATE POLICY "Users can update projeto_investidores in their workspace"
  ON projeto_investidores FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()));

CREATE POLICY "Users can delete projeto_investidores in their workspace"
  ON projeto_investidores FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT wm.workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()));

CREATE INDEX idx_projeto_investidores_projeto ON projeto_investidores(projeto_id) WHERE ativo = true;
CREATE INDEX idx_projeto_investidores_investidor ON projeto_investidores(investidor_id);
CREATE INDEX idx_projeto_investidores_workspace ON projeto_investidores(workspace_id);

-- 4. Migrate existing data
INSERT INTO projeto_investidores (projeto_id, investidor_id, percentual_participacao, base_calculo, workspace_id)
SELECT p.id, p.investidor_id, p.percentual_investidor, COALESCE(p.base_calculo_investidor, 'LUCRO_LIQUIDO'), p.workspace_id
FROM projetos p
WHERE p.investidor_id IS NOT NULL
ON CONFLICT (projeto_id, investidor_id) DO NOTHING;

-- 5. Mark LABBET as 'proprio'
UPDATE investidores SET tipo = 'proprio' WHERE id = 'b955caff-730f-421c-a713-9b0f99255e6a';

-- 6. Auto-recognize participações of capital próprio
UPDATE participacao_ciclos 
SET status = 'RECONHECIDO'
WHERE investidor_id IN (SELECT id FROM investidores WHERE tipo = 'proprio')
AND status = 'A_PAGAR';
